import type { MediaType, SegmentMedia } from "./types";

interface ProviderJob {
  entity_id: string;
  job_type: "media" | "audio";
  media_type: MediaType | null;
  poll_count: number;
  should_fail: boolean;
}

const jobs = new Map<string, ProviderJob>();
let counter = 0;

export function resetMockProvider() {
  jobs.clear();
  counter = 0;
}

export function submitMockProviderTask(media: SegmentMedia) {
  counter += 1;
  const provider_task_id = `MOCK_JOB_${String(counter).padStart(3, "0")}`;
  jobs.set(provider_task_id, {
    entity_id: media.media_id,
    job_type: "media",
    media_type: media.media_type,
    poll_count: 0,
    should_fail: media.prompt.includes("[FAIL]")
  });
  return provider_task_id;
}

export function submitMockAudioTask(segment_id: string, source_text: string) {
  counter += 1;
  const provider_task_id = `MOCK_AUDIO_${String(counter).padStart(3, "0")}`;
  jobs.set(provider_task_id, {
    entity_id: segment_id,
    job_type: "audio",
    media_type: null,
    poll_count: 0,
    should_fail: source_text.includes("[FAIL]")
  });
  return provider_task_id;
}

export function pollMockProviderTask(provider_task_id: string) {
  const job = jobs.get(provider_task_id);
  if (!job) {
    return {
      task_status: "failed" as const,
      result_url: null,
      error_message: `Unknown mock provider task: ${provider_task_id}`
    };
  }

  job.poll_count += 1;
  if (job.poll_count < 2) {
    return {
      task_status: "processing" as const,
      result_url: null,
      error_message: null
    };
  }

  if (job.should_fail) {
    return {
      task_status: "failed" as const,
      result_url: null,
      error_message: "Mock provider failed because source text includes [FAIL]."
    };
  }

  if (job.job_type === "audio") {
    return {
      task_status: "completed" as const,
      result_url: "/mock-assets/mock-audio.wav",
      error_message: null
    };
  }

  const extension = job.media_type === "video" ? "mp4" : "png";
  return {
    task_status: "completed" as const,
    result_url: `/mock-assets/${job.entity_id}.${extension}`,
    error_message: null
  };
}
