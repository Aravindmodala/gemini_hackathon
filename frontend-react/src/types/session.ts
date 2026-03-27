export interface Session {
  session_id: string;
  title: string;
  status: 'active' | 'ended' | string;
  created_at: string | null;
  updated_at: string | null;
  interaction_count: number;
  preview: string;
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
  url: string;
  caption?: string;
}

export interface MusicToolResult {
  audio_url?: string;
  url?: string;
  duration?: number;
}
