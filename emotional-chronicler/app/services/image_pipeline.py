"""Parallel image generation pipeline for the story stream.

ImagePipeline schedules visual-model calls as asyncio Tasks the moment the
narrative model emits an [[IMAGE_PROMPT:...]] marker, then awaits them in
``seq`` order so every image lands at the correct narrative position without
serialising generation time.

Typical lifecycle per story stream::

    pipeline = ImagePipeline(session_id="abc123")

    # Called inside the text-chunk loop — fires immediately, does not block
    pipeline.schedule(seq=2, prompt="A dark misty forest at dawn")
    pipeline.schedule(seq=4, prompt="A burning castle on a hill")

    # Emit text[0], then wait for the first image
    pending = await pipeline.await_seq(2)
    if pending:
        yield sse_image_event(pending.image_url)

    # Emit text[1], then wait for the second image
    pending = await pipeline.await_seq(4)
    ...

    # At stream end — drain any images that were scheduled but never awaited
    async for pending in pipeline.drain_all():
        yield sse_image_event(pending.image_url)

    # On any exception path — release background tasks cleanly
    await pipeline.cancel_all()
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import AsyncGenerator

from app.config import IMAGE_CACHE_DIR, upload_to_gcs
from app.core.visual_engine import generate_image

logger = logging.getLogger("chronicler")

# Maximum accepted image size (20 MB); larger responses are discarded.
_MAX_IMAGE_BYTES = 20 * 1024 * 1024

# Canonical extension map for MIME types the visual model emits.
# Avoids mimetypes.guess_extension(), which is OS-registry-dependent on Windows.
_IMAGE_EXT_MAP: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


@dataclass
class PendingImage:
    """State for a single scheduled image generation task.

    Fields are progressively populated as the task completes and is
    post-processed by :meth:`ImagePipeline.await_seq`.

    Attributes:
        seq:       Monotonic sequence number assigned by the orchestrator.
        prompt:    The raw [[IMAGE_PROMPT:...]] content sent to the visual model.
        task:      The background asyncio Task producing ``(bytes, mime_type) | None``.
        blob_path: GCS path once the image is persisted (``images/{sid}/{file}``).
        image_url: Served URL once the image is persisted (``/api/v1/assets/...``).
        mime_type: MIME type reported by the visual model (e.g. ``image/png``).
        gcs_ok:    False if the GCS upload failed (image still served from local cache).
    """

    seq: int
    prompt: str
    task: asyncio.Task  # type: asyncio.Task[tuple[bytes, str] | None]

    # Populated by ImagePipeline.await_seq() after the task resolves successfully
    blob_path: str | None = None
    image_url: str | None = None
    mime_type: str | None = None
    gcs_ok: bool = True

    # Internal — True once the task has been awaited and post-processed.
    # Prevents double-processing when drain_all() encounters an already-awaited seq.
    _settled: bool = field(default=False, init=False, repr=False)


class ImagePipeline:
    """Schedules parallel image generation tasks and drains them in seq order.

    All public methods must be called from the same asyncio event loop
    (the story stream's event loop).  The class is **not** thread-safe.
    """

    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self._pending: dict[int, PendingImage] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def schedule(self, seq: int, prompt: str) -> None:
        """Fire an image generation task immediately (non-blocking).

        The underlying :func:`generate_image` coroutine is wrapped in an
        asyncio Task that starts running concurrently with the caller.
        Call :meth:`await_seq` later to collect the result at the right
        narrative position.

        Args:
            seq:    Monotonic sequence number for ordering — must be unique
                    within this pipeline instance.
            prompt: The image prompt text to send to the visual model.
        """
        task: asyncio.Task[tuple[bytes, str] | None] = asyncio.create_task(
            generate_image(prompt),
            name=f"image-gen-seq{seq}",
        )
        self._pending[seq] = PendingImage(seq=seq, prompt=prompt, task=task)
        logger.debug(
            "[ImagePipeline] scheduled seq=%d session=%s prompt_len=%d",
            seq,
            self._session_id,
            len(prompt),
        )

    async def await_seq(self, seq: int) -> PendingImage | None:
        """Await the generation task for ``seq`` and run post-processing.

        Post-processing steps (only run once per seq):
        1. Validate the image size.
        2. Write to the local image cache directory.
        3. Upload to GCS (failure is non-fatal; ``gcs_ok`` is set to False).

        Returns:
            A :class:`PendingImage` with ``blob_path`` and ``image_url``
            populated, or ``None`` if generation failed, the image was
            oversized, or ``seq`` was never scheduled.

        Idempotent: safe to call multiple times for the same ``seq``;
        subsequent calls return the cached result immediately.
        """
        pending = self._pending.get(seq)
        if not pending:
            logger.warning(
                "[ImagePipeline] await_seq called for unscheduled seq=%d session=%s",
                seq,
                self._session_id,
            )
            return None

        if pending._settled:
            # Already processed — return cached result (image_url is None on failure)
            return pending if pending.image_url else None

        # Mark settled *before* await so that concurrent callers (unusual but
        # possible) cannot trigger a second post-processing run.
        pending._settled = True

        try:
            result: tuple[bytes, str] | None = await pending.task
        except asyncio.CancelledError:
            logger.warning(
                "[ImagePipeline] task cancelled seq=%d session=%s",
                seq,
                self._session_id,
            )
            return None

        if result is None:
            logger.warning(
                "[ImagePipeline] generation failed seq=%d session=%s",
                seq,
                self._session_id,
            )
            return None

        image_bytes, mime_type = result
        if len(image_bytes) > _MAX_IMAGE_BYTES:
            logger.warning(
                "[ImagePipeline] oversized image rejected seq=%d size=%d session=%s",
                seq,
                len(image_bytes),
                self._session_id,
            )
            return None

        # Persist to local cache
        ext = _IMAGE_EXT_MAP.get(mime_type, ".bin")
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = IMAGE_CACHE_DIR / filename
        await asyncio.to_thread(filepath.write_bytes, image_bytes)

        # Derive canonical paths
        blob_path = f"images/{self._session_id}/{filename}"
        image_url = f"/api/v1/assets/images/{self._session_id}/{filename}"

        # Upload to GCS (non-critical — image still served from local cache on failure)
        gcs_ok = True
        try:
            await asyncio.to_thread(upload_to_gcs, blob_path, image_bytes, mime_type)
        except Exception as gcs_err:
            gcs_ok = False
            logger.warning(
                "[ImagePipeline] GCS upload failed seq=%d filename=%s error=%s session=%s",
                seq,
                filename,
                gcs_err,
                self._session_id,
            )

        pending.blob_path = blob_path
        pending.image_url = image_url
        pending.mime_type = mime_type
        pending.gcs_ok = gcs_ok

        logger.info(
            "[ImagePipeline] ready seq=%d filename=%s mime=%s gcs_ok=%s session=%s",
            seq,
            filename,
            mime_type,
            gcs_ok,
            self._session_id,
        )
        return pending

    async def drain_all(self) -> AsyncGenerator[PendingImage, None]:
        """Yield all *unsettled* images in seq order.

        This is called at stream end to emit any images that were scheduled
        but never awaited inline (e.g. markers at the very end of the model
        output before the stream closed).

        Already-settled images (processed by :meth:`await_seq` during streaming)
        are skipped — they were already emitted as SSE events.

        Only yields images that produced a valid ``image_url``.
        """
        for seq in sorted(self._pending.keys()):
            pending = self._pending[seq]
            if pending._settled:
                # Handled during streaming — do not re-emit
                continue
            result = await self.await_seq(seq)
            if result and result.image_url:
                yield result

    async def cancel_all(self) -> None:
        """Cancel all pending generation tasks and clear internal state.

        Call on exception paths to prevent orphaned background tasks from
        consuming quota or holding resources.  Awaits the cancelled tasks
        so their ``CancelledError`` is reaped cleanly (avoids "Task exception
        was never retrieved" warnings in the event loop).
        """
        tasks_to_cancel = [
            p.task for p in self._pending.values() if not p.task.done()
        ]
        for task in tasks_to_cancel:
            task.cancel()
        if tasks_to_cancel:
            await asyncio.gather(*tasks_to_cancel, return_exceptions=True)
        cancelled = len(tasks_to_cancel)
        self._pending.clear()
        if cancelled:
            logger.debug(
                "[ImagePipeline] cancelled %d pending task(s) session=%s",
                cancelled,
                self._session_id,
            )
