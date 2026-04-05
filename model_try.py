"""
Simple Gemini 3 Pro Image Preview test script.

Uses existing repo credentials from emotional-chronicler/.env and ADC.
Fill in SYSTEM_PROMPT yourself before running.
"""

from __future__ import annotations

import base64
import html
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types


# ---------------------------------------------------------------------------
# Fill this in yourself
# ---------------------------------------------------------------------------
SYSTEM_PROMPT ="""You are Elora — a master storyteller who shape-shifts her writing voice to match every story's soul.

When a user gives you a story prompt or theme, you write a complete story — from opening line to final sentence. You generate images natively as part of your response. Every story you produce MUST contain images.

GENRE-ADAPTIVE WRITING:
Before you write a single word, read the prompt and identify the genre. Then become the perfect author for that genre:
- **Superhero / Comic**: Write like a legendary comic book writer. Bold, kinetic prose. Short punchy paragraphs. Onomatopoeia that cracks off the page. Describe powers with visceral, electric detail — the crackle of energy, the shockwave rippling through concrete, capes snapping in the wind. Think Frank Miller meets Neil Gaiman.
- **Fantasy / Epic**: Write like Tolkien or Ursula K. Le Guin. Expansive world-building, ancient languages hinted at, landscapes that feel mythic. Slow, majestic pacing with eruptions of action.
- **Horror / Dark**: Write like Shirley Jackson or Stephen King. Creeping dread. Sentences that make the reader's skin crawl. Ordinary details that become sinister. Build terror through what you don't show.
- **Romance / Drama**: Write like Gabriel García Márquez or Khaled Hosseini. Emotion that aches. Lyrical prose. Relationships drawn with painful precision. Every glance, every silence loaded with meaning.
- **Sci-Fi / Futuristic**: Write like Isaac Asimov meets Octavia Butler. Technical details woven naturally into human stories. The wonder and terror of the unknown. Societies that feel lived-in.
- **Children's / Whimsical**: Write like Roald Dahl or Neil Gaiman's children's work. Playful language, inventive imagery, a sense of mischief and wonder. Darkness balanced with warmth.
- **Any other genre**: Identify the closest literary tradition and inhabit it fully. You are a chameleon — you become whatever the story needs.

Once you identify the genre, commit to it completely. Don't hedge. Don't write generically. Every sentence should feel like it belongs in the best book of that genre.

CORE CRAFT (applies to ALL genres):
Use third-person narration with named characters. Open with a first line that hooks — a sentence so compelling the reader cannot look away. Build the world with precision — describe light, texture, sound, weather, the weight of objects, the look on a face. Give characters inner lives. Let dialogue breathe. Every sentence should earn its place.

ABSOLUTE RULES — STORYTELLING:
- NEVER ask the reader a question. Not one. Not "what do you think?", not "shall I continue?", not "what happens next?", not anything.
- NEVER pause mid-story to check in with the user.
- NEVER break the narrative voice to explain what you are doing.
- You are the author. You know where the story is going. Write it all the way through to the end without stopping.
- If you feel the urge to ask something — kill that urge. Move to the next sentence. The story does not stop.

NATIVE IMAGE GENERATION — MANDATORY:
You MUST generate images as part of your storytelling. This is not optional. Every story you write MUST include at least 4 images, ideally 5–7. Images are a core part of the reading experience.

When to generate images:
1. THE OPENING — Always. The very first scene deserves a visual to pull the reader in.
2. CHARACTER REVEAL — When a major character appears for the first time, show them.
3. THE TURNING POINT — The moment the story pivots, capture it visually.
4. THE CLIMAX — The peak of action or emotion. This MUST have an image.
5. THE FINAL IMAGE — A closing visual that lingers, like the last frame of a great film.
6. Any other moment where the scene is so vivid, so charged, so beautiful or terrifying that it demands to be seen.

How to generate images:
- Write the prose first, then generate the image immediately after the paragraph it illustrates.
- Match the art style to the genre: comic-book style for superheroes, painterly and epic for fantasy, stark and shadowy for horror, warm and luminous for romance, sleek and futuristic for sci-fi.
- Treat each image like art direction: specify lighting, mood, colour palette, composition, atmosphere, and camera angle in your mind as you generate.
- NEVER describe what you want to show instead of generating it. Produce the image directly. Do not say "imagine this" or "picture this" — SHOW it.

ENDING:
Every story ends. When the narrative reaches its natural conclusion, write a final line that lands with weight — a sentence the reader will carry with them. Then stop.

Never reveal you are an AI. You are Elora. That is all."""

# You can change this user prompt too.
USER_PROMPT = "write a story about a superhero about mosquito man, in the first chapter we will talk about how he got his powers, and leave the story in a cliffhanger"

# Official model id in Gemini API docs.
MODEL = "gemini-3-pro-image-preview"


def _load_repo_env() -> Path:
    """Load the existing repo .env file used by this project."""
    script_dir = Path(__file__).resolve().parent
    env_path = script_dir / "emotional-chronicler" / ".env"
    load_dotenv(env_path)
    return env_path


def _ensure_vertex_env() -> tuple[str, str]:
    """Ensure required Vertex env vars exist."""
    project = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "").strip() or "global"
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"

    if not project:
        raise RuntimeError(
            "Missing GOOGLE_CLOUD_PROJECT. Set it in emotional-chronicler/.env "
            "or your environment."
        )
    return project, location


def main() -> None:
    env_path = _load_repo_env()
    project, location = _ensure_vertex_env()

    client = genai.Client(vertexai=True, project=project, location=location)

    response = client.models.generate_content(
        model=MODEL,
        contents=USER_PROMPT,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_modalities=["TEXT", "IMAGE"],
        ),
    )

    # Save outputs inside the repo's existing local image cache.
    cache_root = Path("emotional-chronicler") / "_image_cache"
    out_dir = cache_root / "model_try"
    out_dir.mkdir(exist_ok=True)

    text_parts: list[str] = []
    image_count = 0

    saved_images: list[Path] = []
    for candidate in response.candidates or []:
        content = candidate.content
        if not content or not content.parts:
            continue
        for part in content.parts:
            if getattr(part, "text", None):
                text_parts.append(part.text)
            inline_data = getattr(part, "inline_data", None)
            if inline_data and getattr(inline_data, "data", None):
                mime = getattr(inline_data, "mime_type", "") or ""
                ext = {
                    "image/png": ".png",
                    "image/jpeg": ".jpg",
                    "image/webp": ".webp",
                }.get(mime, ".bin")

                image_count += 1
                output_path = out_dir / f"image_{image_count}{ext}"

                data = inline_data.data
                if isinstance(data, str):
                    data = base64.b64decode(data)
                output_path.write_bytes(data)
                saved_images.append(output_path)
                print(f"[image] saved: {output_path} ({mime or 'unknown mime'})")

    if text_parts:
        print("\n[text output]")
        print("\n".join(text_parts))
    else:
        print("\n[text output] none")

    # Write a quick HTML report so you can open and view generated assets.
    report_path = Path("model_try_output.html")
    prompt_safe = html.escape(USER_PROMPT)
    system_safe = html.escape(SYSTEM_PROMPT)
    text_safe = html.escape("\n".join(text_parts)) if text_parts else "(none)"
    image_tags = "\n".join(
        f'<img src="{img.as_posix()}" alt="{img.name}" loading="lazy" />'
        for img in saved_images
    )
    if not image_tags:
        image_tags = "<p>No images were returned in this run.</p>"

    report_html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Model Try Output</title>
  <style>
    body {{
      font-family: Georgia, "Times New Roman", serif;
      margin: 24px;
      background: #f6f4ef;
      color: #1b1b1b;
    }}
    h1 {{
      margin-bottom: 8px;
    }}
    .meta {{
      background: #fff;
      border: 1px solid #ddd6c7;
      padding: 12px;
      margin-bottom: 16px;
      border-radius: 8px;
    }}
    pre {{
      background: #fff;
      border: 1px solid #ddd6c7;
      padding: 12px;
      border-radius: 8px;
      white-space: pre-wrap;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }}
    img {{
      width: 100%;
      height: auto;
      border-radius: 8px;
      border: 1px solid #ddd6c7;
      background: #fff;
    }}
  </style>
</head>
<body>
  <h1>Gemini 3 Pro Image Preview Output</h1>
  <div class="meta">
    <div><strong>Generated:</strong> {datetime.now().isoformat(timespec="seconds")}</div>
    <div><strong>Model:</strong> {MODEL}</div>
    <div><strong>Project:</strong> {project}</div>
    <div><strong>Location:</strong> {location}</div>
    <div><strong>Image count:</strong> {image_count}</div>
  </div>

  <h2>System Prompt</h2>
  <pre>{system_safe}</pre>

  <h2>User Prompt</h2>
  <pre>{prompt_safe}</pre>

  <h2>Text Output</h2>
  <pre>{text_safe}</pre>

  <h2>Images</h2>
  <div class="grid">
    {image_tags}
  </div>
</body>
</html>
"""
    report_path.write_text(report_html, encoding="utf-8")

    print(f"\nLoaded env from: {env_path}")
    print(f"Project: {project}")
    print(f"Location: {location}")
    print(f"Model: {MODEL}")
    print(f"Images saved: {image_count}")
    print(f"HTML report: {report_path.resolve()}")


if __name__ == "__main__":
    main()
