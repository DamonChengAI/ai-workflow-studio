import { pollMockProviderTask, submitMockProviderTask } from "./mock-provider";
import { addTask, getMediaCard, listTasks, updateMediaCard, updateTask } from "./mock-store";
import type { MediaTask, SegmentMedia } from "./types";

function now() {
  return new Date().toISOString();
}

function nextTaskId(media_id: string, index: number) {
  return `${media_id}_TASK_${String(index).padStart(2, "0")}`;
}

export function recalculateMediaStatus(media_id: string) {
  const tasks = listTasks(media_id);
  if (tasks.length === 0) {
    return updateMediaCard(media_id, {
      aggregate_status: "idle",
      preview_url: null,
      last_error: null
    });
  }

  const failed = tasks.find((task) => task.task_status === "failed");
  if (failed) {
    return updateMediaCard(media_id, {
      aggregate_status: "failed",
      preview_url: null,
      last_error: failed.error_message ?? "Mock provider task failed."
    });
  }

  if (tasks.some((task) => task.task_status === "pending" || task.task_status === "processing")) {
    return updateMediaCard(media_id, {
      aggregate_status: "processing",
      last_error: null
    });
  }

  const completed = tasks.find((task) => task.task_status === "completed" && task.result_url);
  return updateMediaCard(media_id, {
    aggregate_status: "completed",
    preview_url: completed?.result_url ?? null,
    last_error: null
  });
}

export function submitMedia(media_id: string) {
  const media = getMediaCard(media_id);
  if (!media) throw new Error(`Media card not found: ${media_id}`);

  if (media.aggregate_status === "processing" || media.aggregate_status === "completed") {
    return {
      media,
      tasks: listTasks(media_id),
      created: false,
      message: `media ${media_id} is already ${media.aggregate_status}`
    };
  }

  if (media.aggregate_status === "failed") {
    return {
      media,
      tasks: listTasks(media_id),
      created: false,
      message: `media ${media_id} is failed; retry explicitly`
    };
  }

  const existing = listTasks(media_id);
  if (existing.length > 0) {
    return {
      media,
      tasks: existing,
      created: false,
      message: `media ${media_id} already has tasks`
    };
  }

  const created: MediaTask[] = [];
  for (let index = 1; index <= media.generate_count; index += 1) {
    const provider_task_id = submitMockProviderTask(media);
    created.push(
      addTask({
        media_task_id: nextTaskId(media_id, index),
        media_id,
        task_index: index,
        provider_task_id,
        task_status: "processing",
        result_url: null,
        error_message: null,
        created_at: now(),
        updated_at: now()
      })
    );
  }

  const updated = recalculateMediaStatus(media_id);
  updateMediaCard(media_id, {
    last_submitted_at: now()
  });

  return {
    media: updated,
    tasks: created,
    created: true,
    message: `media ${media_id} submitted`
  };
}

export function pollRunningTasks(limit = 50) {
  const running = listTasks().filter((task) => task.task_status === "pending" || task.task_status === "processing").slice(0, limit);
  const touched = new Set<string>();
  const updatedTasks: MediaTask[] = [];

  for (const task of running) {
    const result = pollMockProviderTask(task.provider_task_id);
    const updated = updateTask(task.media_task_id, {
      task_status: result.task_status,
      result_url: result.result_url,
      error_message: result.error_message
    });
    touched.add(task.media_id);
    updatedTasks.push(updated);
  }

  for (const media_id of touched) recalculateMediaStatus(media_id);

  return {
    updated_tasks: updatedTasks.length,
    tasks: updatedTasks
  };
}

export function retryMedia(media_id: string) {
  const media = getMediaCard(media_id);
  if (!media) throw new Error(`Media card not found: ${media_id}`);
  if (media.aggregate_status !== "failed") {
    return {
      media,
      tasks: listTasks(media_id),
      retried: false,
      message: `media ${media_id} is not failed`
    };
  }

  const failed = listTasks(media_id).find((task) => task.task_status === "failed");
  if (!failed) throw new Error(`Failed task not found for media: ${media_id}`);

  const patchedMedia: SegmentMedia = updateMediaCard(media_id, {
    prompt: media.prompt.replace(/\s*\[FAIL\]/g, "")
  });
  const provider_task_id = submitMockProviderTask(patchedMedia);
  updateTask(failed.media_task_id, {
    provider_task_id,
    task_status: "processing",
    result_url: null,
    error_message: null
  });
  const updated = recalculateMediaStatus(media_id);

  return {
    media: updated,
    tasks: listTasks(media_id),
    retried: true,
    message: `media ${media_id} retried`
  };
}
