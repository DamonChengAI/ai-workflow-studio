import { z } from "zod";

export const mediaTypeSchema = z.enum(["image", "video"]);
export const mediaProviderSchema = z.enum(["mock-image", "mock-video"]);
export const aggregateStatusSchema = z.enum(["idle", "processing", "completed", "failed"]);

export const ideaSchema = z.object({
  idea_id: z.string().min(1),
  name: z.string().min(1),
  tags_json: z.array(z.string()),
  detail: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1)
});

export const sceneSchema = z.object({
  scene_id: z.string().min(1),
  idea_id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  detail: z.string().min(1),
  sort_order: z.number().int().positive(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1)
});

export const segmentSchema = z.object({
  segment_id: z.string().min(1),
  scene_id: z.string().min(1),
  tab_order: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().min(1),
  narration: z.string(),
  narration_cn: z.string(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1)
});

export const segmentMediaSchema = z.object({
  media_id: z.string().min(1),
  segment_id: z.string().min(1),
  media_type: mediaTypeSchema,
  slot_order: z.number().int().positive(),
  prompt: z.string().min(1),
  reference_images_json: z.array(z.string()),
  generate_count: z.number().int(),
  provider: mediaProviderSchema,
  model: z.string().min(1),
  duration: z.number().int().nullable(),
  aspect_ratio: z.string().min(1),
  resolution: z.string().min(1),
  audio: z.boolean().nullable(),
  aggregate_status: aggregateStatusSchema,
  preview_url: z.string().nullable(),
  last_error: z.string().nullable(),
  last_submitted_at: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1)
});

export const coverSchema = z.object({
  cover_id: z.string().min(1),
  idea_id: z.string().min(1),
  title: z.string().min(1),
  cover_text: z.string().min(1),
  title_direction: z.enum(["clarity", "tradeoff", "action"]),
  cover_prompt: z.string().min(1),
  cover_image_url: z.string().nullable(),
  generation_status: z.enum(["idle", "processing", "completed", "failed"]),
  last_error: z.string().nullable(),
  is_active_title: z.number().int(),
  is_active_cover: z.number().int(),
  sort_order: z.number().int().positive(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1)
});

export const bulkSampleSchema = z.object({
  ideas: z.array(ideaSchema),
  scenes: z.array(sceneSchema),
  segments: z.array(segmentSchema),
  media_cards: z.array(segmentMediaSchema),
  covers: z.array(coverSchema)
});
