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

export interface SessionDetail extends Session {
  interactions: Interaction[];
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
