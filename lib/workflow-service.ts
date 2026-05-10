import { pollMockProviderTask, submitMockAudioTask, submitMockProviderTask } from "./mock-provider";
import { addAudioTask, addTask, getMediaCard, getSegment, listAudioTasks, listTasks, updateAudioTask, updateMediaCard, updateTask } from "./mock-store";
import type { MediaTask, SegmentAudioTask, SegmentMedia } from "./types";

function now() {
  return new Date().toISOString();
}

function nextTaskId(media_id: string, index: number) {
  return `${media_id}_TASK_${String(index).padStart(2, "0")}`;
}

function nextAudioTaskId(segment_id: string, index: number) {
  return `${segment_id}_AUDIO_TASK_${String(index).padStart(2, "0")}`;
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

  const remainingLimit = Math.max(0, limit - updatedTasks.length);
  const runningAudio = listAudioTasks()
    .filter((task) => task.task_status === "pending" || task.task_status === "processing")
    .slice(0, remainingLimit);
  const updatedAudioTasks: SegmentAudioTask[] = [];

  for (const task of runningAudio) {
    const result = pollMockProviderTask(task.provider_task_id);
    updatedAudioTasks.push(
      updateAudioTask(task.audio_task_id, {
        task_status: result.task_status,
        result_url: result.result_url,
        error_message: result.error_message
      })
    );
  }

  return {
    updated_tasks: updatedTasks.length + updatedAudioTasks.length,
    tasks: updatedTasks,
    audio_tasks: updatedAudioTasks
  };
}

export function submitSegmentAudio(segment_id: string, source_text?: string) {
  const segment = getSegment(segment_id);
  if (!segment) throw new Error(`Segment not found: ${segment_id}`);

  const text = (source_text ?? segment.narration_cn ?? segment.narration ?? "").trim();
  if (!text) throw new Error("Audio source text is empty");

  const existing = listAudioTasks(segment_id);
  const latest = existing.at(-1);
  if (latest?.task_status === "processing" || latest?.task_status === "pending" || latest?.task_status === "completed") {
    return {
      task: latest,
      created: false,
      message: `audio for ${segment_id} is already ${latest.task_status}`
    };
  }

  if (latest?.task_status === "failed") {
    return {
      task: latest,
      created: false,
      message: `audio for ${segment_id} is failed; retry explicitly`
    };
  }

  const provider_task_id = submitMockAudioTask(segment_id, text);
  const task = addAudioTask({
    audio_task_id: nextAudioTaskId(segment_id, existing.length + 1),
    segment_id,
    provider_task_id,
    task_status: "processing",
    source_text: text,
    result_url: null,
    error_message: null,
    created_at: now(),
    updated_at: now()
  });

  return {
    task,
    created: true,
    message: `audio for ${segment_id} submitted`
  };
}

export function retrySegmentAudio(segment_id: string, source_text?: string) {
  const segment = getSegment(segment_id);
  if (!segment) throw new Error(`Segment not found: ${segment_id}`);
  const failed = [...listAudioTasks(segment_id)].reverse().find((task) => task.task_status === "failed");
  if (!failed) {
    return {
      task: listAudioTasks(segment_id).at(-1) ?? null,
      retried: false,
      message: `audio for ${segment_id} is not failed`
    };
  }

  const text = (source_text ?? failed.source_text ?? segment.narration_cn ?? segment.narration ?? "").replace(/\s*\[FAIL\]/g, "").trim();
  if (!text) throw new Error("Audio source text is empty");

  const provider_task_id = submitMockAudioTask(segment_id, text);
  const task = updateAudioTask(failed.audio_task_id, {
    provider_task_id,
    task_status: "processing",
    source_text: text,
    result_url: null,
    error_message: null
  });

  return {
    task,
    retried: true,
    message: `audio for ${segment_id} retried`
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
