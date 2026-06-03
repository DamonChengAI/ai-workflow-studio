import { listMediaCards, listTasks, resetStore } from "../lib/mock-store";
import { pollRunningTasks, retryMedia, submitMedia } from "../lib/workflow-service";
import { readJson, videoRunFiles, writeJson } from "./video-workflow-shared";

const mediaId = process.env.RECOVER_MEDIA_ID || "MEDIA_005";

function record(events: unknown[], action: string, value: unknown) {
  events.push({ action, value });
}

function pollTwice(events: unknown[], label: string) {
  const first = pollRunningTasks();
  const second = pollRunningTasks();
  record(events, `${label}:poll_1`, {
    updated_tasks: first.updated_tasks,
    media_statuses: first.tasks.map((task) => task.task_status)
  });
  record(events, `${label}:poll_2`, {
    updated_tasks: second.updated_tasks,
    media_statuses: second.tasks.map((task) => task.task_status)
  });
}

function sortById<T extends Record<string, unknown>>(items: T[], key: string) {
  return items.sort((left, right) => String(left[key] ?? "").localeCompare(String(right[key] ?? "")));
}

resetStore();

const events: unknown[] = [];
const submit = submitMedia(mediaId);
record(events, `submit_media:${mediaId}:diagnostic_replay`, {
  created: submit.created,
  status: submit.media.aggregate_status,
  message: submit.message
});
pollTwice(events, `media:${mediaId}:diagnostic_failure`);

const retry = retryMedia(mediaId);
record(events, `retry_media:${mediaId}:explicit_repair`, {
  retried: retry.retried,
  status: retry.media.aggregate_status,
  message: retry.message
});
pollTwice(events, `media:${mediaId}:explicit_repair`);

const mediaById = new Map(listMediaCards().map((media) => [media.media_id, media]));
const manifest = readJson<Record<string, any>>(videoRunFiles.mediaManifest);
const taskRun = readJson<Record<string, any>>(videoRunFiles.taskRun);
const replacementCards = listMediaCards()
  .filter((media) => media.media_id === mediaId)
  .map((media) => ({
    media_id: media.media_id,
    segment_id: media.segment_id,
    media_type: media.media_type,
    status: media.aggregate_status,
    preview_url: media.preview_url,
    last_error: media.last_error,
    provider: media.provider,
    model: media.model,
    required_fields: ["media_id", "segment_id", "media_type", "status", "provider", "model"]
  }));
const replacementTasks = listTasks(mediaId).map((task) => ({
  media_task_id: task.media_task_id,
  media_id: task.media_id,
  task_status: task.task_status,
  result_url: task.result_url,
  error_message: task.error_message,
  required_fields: ["media_task_id", "media_id", "task_status", "result_url", "error_message"]
}));

writeJson(videoRunFiles.mediaManifest, {
  ...manifest,
  media_cards: sortById(
    [...(manifest.media_cards ?? []).filter((media: any) => media.media_id !== mediaId), ...replacementCards],
    "media_id"
  ),
  media_tasks: sortById(
    [...(manifest.media_tasks ?? []).filter((task: any) => task.media_id !== mediaId), ...replacementTasks],
    "media_task_id"
  ),
  failure_recovery: {
    media_id: mediaId,
    forced_failure: true,
    auto_retry: false,
    retried: retry.retried,
    final_status: mediaById.get(mediaId)?.aggregate_status ?? "unknown",
    handled_by: "explicit_model_action",
    events
  }
});

writeJson(videoRunFiles.taskRun, {
  ...taskRun,
  events: [...(taskRun.events ?? []), ...events]
});

console.log("video:recover-media completed");
console.log(`media_id=${mediaId}`);
console.log(`retried=${retry.retried}`);
console.log(`final_status=${mediaById.get(mediaId)?.aggregate_status ?? "unknown"}`);
