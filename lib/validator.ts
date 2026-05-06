import { bulkSampleSchema } from "./schemas";
import type { BulkSample, ValidationIssue, ValidationReport } from "./types";

function issue(issues: ValidationIssue[], code: string, message: string, path?: string) {
  issues.push({ code, message, path });
}

function unique<T extends object, K extends keyof T & string>(items: T[], key: K, label: string, issues: ValidationIssue[]) {
  const seen = new Set<string>();
  for (const item of items) {
    const id = String(item[key]);
    if (seen.has(id)) issue(issues, "duplicate_id", `${label} id must be unique: ${id}`, `${label}.${key}`);
    seen.add(id);
  }
}

function counts(input: unknown): ValidationReport["counts"] {
  const maybe = input as Partial<Record<keyof BulkSample, unknown>> | null;
  return {
    ideas: Array.isArray(maybe?.ideas) ? maybe.ideas.length : 0,
    scenes: Array.isArray(maybe?.scenes) ? maybe.scenes.length : 0,
    segments: Array.isArray(maybe?.segments) ? maybe.segments.length : 0,
    media_cards: Array.isArray(maybe?.media_cards) ? maybe.media_cards.length : 0,
    covers: Array.isArray(maybe?.covers) ? maybe.covers.length : 0
  };
}

export function validateSample(input: unknown): ValidationReport {
  const parsed = bulkSampleSchema.safeParse(input);
  const baseCounts = counts(input);
  if (!parsed.success) {
    return {
      ok: false,
      counts: baseCounts,
      issues: parsed.error.issues.map((item) => ({
        code: "schema",
        message: item.message,
        path: item.path.join(".")
      }))
    };
  }

  const data = parsed.data;
  const issues: ValidationIssue[] = [];
  unique(data.ideas, "idea_id", "idea", issues);
  unique(data.scenes, "scene_id", "scene", issues);
  unique(data.segments, "segment_id", "segment", issues);
  unique(data.media_cards, "media_id", "media_card", issues);
  unique(data.covers, "cover_id", "cover", issues);

  const ideaIds = new Set(data.ideas.map((item) => item.idea_id));
  const sceneIds = new Set(data.scenes.map((item) => item.scene_id));
  const segmentIds = new Set(data.segments.map((item) => item.segment_id));

  for (const scene of data.scenes) {
    if (!ideaIds.has(scene.idea_id)) issue(issues, "missing_reference", `scene ${scene.scene_id} references missing idea`, "scene.idea_id");
  }

  for (const segment of data.segments) {
    if (!sceneIds.has(segment.scene_id)) {
      issue(issues, "missing_reference", `segment ${segment.segment_id} references missing scene`, "segment.scene_id");
    }
  }

  for (const media of data.media_cards) {
    if (!segmentIds.has(media.segment_id)) {
      issue(issues, "missing_reference", `media ${media.media_id} references missing segment`, "media.segment_id");
    }

    if (media.reference_images_json.length > 3) {
      issue(issues, "too_many_references", `media ${media.media_id} has more than 3 reference images`, "media.reference_images_json");
    }

    if (media.media_type === "image") {
      if (media.provider !== "mock-image") issue(issues, "provider_mismatch", `image media ${media.media_id} must use mock-image`, "media.provider");
      if (media.generate_count < 1 || media.generate_count > 4) {
        issue(issues, "invalid_generate_count", `image media ${media.media_id} generate_count must be 1..4`, "media.generate_count");
      }
      if (media.duration !== null) issue(issues, "invalid_duration", `image media ${media.media_id} must not set duration`, "media.duration");
    }

    if (media.media_type === "video") {
      if (media.provider !== "mock-video") issue(issues, "provider_mismatch", `video media ${media.media_id} must use mock-video`, "media.provider");
      if (media.generate_count !== 1) issue(issues, "invalid_generate_count", `video media ${media.media_id} generate_count must equal 1`, "media.generate_count");
      if (media.duration === null || media.duration < 4 || media.duration > 12) {
        issue(issues, "invalid_duration", `video media ${media.media_id} duration must be 4..12`, "media.duration");
      }
    }
  }

  for (const cover of data.covers) {
    if (!ideaIds.has(cover.idea_id)) issue(issues, "missing_reference", `cover ${cover.cover_id} references missing idea`, "cover.idea_id");
  }

  return {
    ok: issues.length === 0,
    counts: baseCounts,
    issues
  };
}
