// ── Story event types (v2 schema — mirrors backend domain/events.py) ───────

export type StoryEventKind = 'user_prompt' | 'text_segment' | 'image' | 'music';

interface BaseEvent {
  seq: number;
  ts: string;
}

export interface UserPromptEvent extends BaseEvent {
  kind: 'user_prompt';
  text: string;
}

export interface TextSegmentEvent extends BaseEvent {
  kind: 'text_segment';
  text: string;
}

export interface ImageEvent extends BaseEvent {
  kind: 'image';
  blob_path: string;
  image_url: string;
  image_prompt: string;
  mime_type: string;
  gcs_ok: boolean;
}

export interface MusicStoryEvent extends BaseEvent {
  kind: 'music';
  blob_path: string;
  audio_url: string;
  duration_seconds: number;
}

export type StoryEvent = UserPromptEvent | TextSegmentEvent | ImageEvent | MusicStoryEvent;

export interface Session {
  session_id: string;
  title: string;
  status: 'active' | 'ended' | string;
  created_at: string | null;
  updated_at: string | null;
  interaction_count: number;
  preview: string;
  thumbnail_url?: string | null;
}

// ── Section types (mirrors backend StorySection union) ─────────────────────

export type StorySection =
  | { type: 'text'; content: string }
  | { type: 'image'; url: string; caption: string }
  | { type: 'music'; url: string; duration: number };

// ── Session detail ─────────────────────────────────────────────────────────

export interface SessionDetail extends Session {
  schema_version?: number;
  /** v1 sessions only — empty array for v2 sessions */
  interactions: Interaction[];
  /** v2 sessions: pre-computed ordered sections (use if present) */
  sections?: StorySection[];
}

export interface Interaction {
  role: 'user' | 'elora' | 'tool';
  text?: string;
  name?: string;
  args?: Record<string, unknown>;
  timestamp: string;
}

export interface ImageToolResult {
  image_url?: string;  // Key used by generate_image tool
  url?: string;        // Fallback key used by SSE events
  caption?: string;
}

export interface MusicToolResult {
  audio_url?: string;  // Key used by generate_music tool
  url?: string;        // Fallback key
  duration?: number;
  duration_seconds?: number;
}
