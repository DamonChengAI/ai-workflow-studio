export type MediaType = "image" | "video";
export type MediaProvider = "mock-image" | "mock-video";
export type MediaTaskStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type SegmentMediaAggregateStatus = "idle" | "processing" | "completed" | "failed";
export type CoverGenerationStatus = "idle" | "processing" | "completed" | "failed";
export type TitleDirection = "clarity" | "tradeoff" | "action";

export interface Idea {
  idea_id: string;
  name: string;
  tags_json: string[];
  detail: string;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  scene_id: string;
  idea_id: string;
  title: string;
  summary: string;
  detail: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Segment {
  segment_id: string;
  scene_id: string;
  tab_order: number;
  title: string;
  summary: string;
  narration: string;
  narration_cn: string;
  created_at: string;
  updated_at: string;
}

export interface SegmentMedia {
  media_id: string;
  segment_id: string;
  media_type: MediaType;
  slot_order: number;
  prompt: string;
  reference_images_json: string[];
  generate_count: number;
  provider: MediaProvider;
  model: string;
  duration: number | null;
  aspect_ratio: string;
  resolution: string;
  audio: boolean | null;
  aggregate_status: SegmentMediaAggregateStatus;
  preview_url: string | null;
  last_error: string | null;
  last_submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaTask {
  media_task_id: string;
  media_id: string;
  task_index: number;
  provider_task_id: string;
  task_status: MediaTaskStatus;
  result_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  output_base_dir: string;
  auto_poll_enabled: boolean;
  auto_poll_interval_ms: number;
}

export interface IdeaCover {
  cover_id: string;
  idea_id: string;
  title: string;
  cover_text: string;
  title_direction: TitleDirection;
  cover_prompt: string;
  cover_image_url: string | null;
  generation_status: CoverGenerationStatus;
  last_error: string | null;
  is_active_title: number;
  is_active_cover: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BulkSample {
  ideas: Idea[];
  scenes: Scene[];
  segments: Segment[];
  media_cards: SegmentMedia[];
  covers: IdeaCover[];
}

export interface ApiListPayload<T> {
  data: { items: T[] };
  meta: { total: number };
}

export interface ApiDataPayload<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationReport {
  ok: boolean;
  counts: {
    ideas: number;
    scenes: number;
    segments: number;
    media_cards: number;
    covers: number;
  };
  issues: ValidationIssue[];
}
