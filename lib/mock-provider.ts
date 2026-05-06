import type { MediaType, SegmentMedia } from "./types";

interface ProviderJob {
  media_id: string;
  media_type: MediaType;
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
    media_id: media.media_id,
    media_type: media.media_type,
    poll_count: 0,
    should_fail: media.prompt.includes("[FAIL]")
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
      error_message: "Mock provider failed because prompt includes [FAIL]."
    };
  }

  const extension = job.media_type === "video" ? "mp4" : "png";
  return {
    task_status: "completed" as const,
    result_url: `/mock-assets/${job.media_id}.${extension}`,
    error_message: null
  };
}
