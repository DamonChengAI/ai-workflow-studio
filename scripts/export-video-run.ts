import path from "node:path";
import { initialSample } from "../lib/mock-data";
import { listAudioTasks, listMediaCards, listSegments, listTasks, resetStore } from "../lib/mock-store";
import { validateSample } from "../lib/validator";
import { pollRunningTasks, retryMedia, submitMedia, submitSegmentAudio } from "../lib/workflow-service";
import { outputDir, videoRunFiles, writeJson, writeText, type StoryboardFile } from "./video-workflow-shared";

const theme = "一句需求如何变成一条可交付视频";
const targetDurationSeconds = 30;
const segmentIds = ["SEG_001", "SEG_002", "SEG_003", "SEG_004"];
const mediaIds = ["MEDIA_001", "MEDIA_002", "MEDIA_003", "MEDIA_004"];

function record(events: unknown[], action: string, value: unknown) {
  events.push({
    action,
    value
  });
}

function pollTwice(events: unknown[], label: string) {
  const first = pollRunningTasks();
  const second = pollRunningTasks();
  record(events, `${label}:poll_1`, {
    updated_tasks: first.updated_tasks,
    media_statuses: first.tasks.map((task) => task.task_status),
    audio_statuses: first.audio_tasks.map((task) => task.task_status)
  });
  record(events, `${label}:poll_2`, {
    updated_tasks: second.updated_tasks,
    media_statuses: second.tasks.map((task) => task.task_status),
    audio_statuses: second.audio_tasks.map((task) => task.task_status)
  });
}

resetStore();

const validation = validateSample(initialSample);
const events: unknown[] = [];
record(events, "validate_sample", validation);

for (const mediaId of mediaIds) {
  const submit = submitMedia(mediaId);
  record(events, `submit_media:${mediaId}`, {
    created: submit.created,
    status: submit.media.aggregate_status,
    message: submit.message
  });
  pollTwice(events, `media:${mediaId}`);
}

for (const segmentId of segmentIds) {
  const submit = submitSegmentAudio(segmentId);
  record(events, `submit_audio:${segmentId}`, {
    created: submit.created,
    status: submit.task.task_status,
    message: submit.message
  });
  pollTwice(events, `audio:${segmentId}`);
}

const failedSubmit = submitMedia("MEDIA_005");
record(events, "submit_media:MEDIA_005_failure_path", {
  created: failedSubmit.created,
  status: failedSubmit.media.aggregate_status,
  message: failedSubmit.message
});
pollTwice(events, "media:MEDIA_005_failure");

const retry = retryMedia("MEDIA_005");
record(events, "retry_media:MEDIA_005", {
  retried: retry.retried,
  status: retry.media.aggregate_status,
  message: retry.message
});
pollTwice(events, "media:MEDIA_005_retry");

const segmentById = new Map(listSegments().map((segment) => [segment.segment_id, segment]));
const mediaById = new Map(listMediaCards().map((media) => [media.media_id, media]));
const audioBySegment = new Map(listAudioTasks().map((task) => [task.segment_id, task]));

const storyboard: StoryboardFile = {
  theme,
  target_duration_seconds: targetDurationSeconds,
  total_duration_seconds: targetDurationSeconds,
  items: [
    {
      order: 1,
      segment_id: "INTRO",
      title: "一句需求进入工作台",
      duration_seconds: 5,
      image_asset: "public/mock-assets/COVER_001.png",
      audio_manifest_path: "outputs/video-run/audio/01-intro.wav",
      narration_cn: "一句需求先被改写成可执行目标，明确输入、输出和验收标准。",
      product_point: "评测模型是否先理解目标，而不是直接做产物。"
    },
    ...mediaIds.map((mediaId, index) => {
      const media = mediaById.get(mediaId);
      const segment = media ? segmentById.get(media.segment_id) : null;
      return {
        order: index + 2,
        segment_id: segment?.segment_id ?? mediaId,
        title: segment?.title ?? mediaId,
        duration_seconds: 5,
        image_asset: `public/mock-assets/${mediaId}.png`,
        audio_manifest_path: `outputs/video-run/audio/${String(index + 2).padStart(2, "0")}-${segment?.segment_id ?? mediaId}.wav`,
        narration_cn: segment?.narration_cn ?? "",
        product_point:
          index === 0
            ? "看模型是否把模糊需求变成可执行目标。"
            : index === 1
              ? "看模型是否复用现有对象层级和上下文。"
              : index === 2
                ? "看模型是否理解异步任务、状态和轮询。"
                : "看模型是否能处理失败、重试和复验。"
      };
    }),
    {
      order: 6,
      segment_id: "SEG_004_RECOVERY",
      title: "失败处理和交付复盘",
      duration_seconds: 5,
      image_asset: "public/mock-assets/MEDIA_005.png",
      audio_manifest_path: "outputs/video-run/audio/06-recovery.wav",
      narration_cn: "最后把失败路径、重试结果、安全检查和交付报告整理成业务方能理解的结果。",
      product_point: "看模型是否能把 trace 变成产品风险和下一步判断。"
    }
  ]
};

const taskRun = {
  run_type: "mock-video-workflow-eval",
  generated_at: new Date().toISOString(),
  theme,
  target_duration_seconds: targetDurationSeconds,
  validation_ok: validation.ok,
  events,
  checks_expected: [
    "npm run real-media:smoke",
    "npm run video:compose",
    "npm run video:check",
    "npm run security:check",
    "npm run hook:check",
    "npm run video:report",
    "npm run check"
  ]
};

const mediaManifest = {
  mock_only: true,
  redacted: true,
  media_cards: listMediaCards()
    .filter((media) => media.media_id.startsWith("MEDIA_00"))
    .map((media) => ({
      media_id: media.media_id,
      segment_id: media.segment_id,
      media_type: media.media_type,
      status: media.aggregate_status,
      preview_url: media.preview_url,
      last_error: media.last_error,
      provider: media.provider,
      model: media.model
    })),
  media_tasks: listTasks().map((task) => ({
    media_task_id: task.media_task_id,
    media_id: task.media_id,
    task_status: task.task_status,
    result_url: task.result_url,
    error_message: task.error_message
  })),
  audio_tasks: listAudioTasks().map((task) => ({
    audio_task_id: task.audio_task_id,
    segment_id: task.segment_id,
    task_status: task.task_status,
    result_url: task.result_url,
    error_message: task.error_message
  })),
  failure_recovery: {
    media_id: "MEDIA_005",
    forced_failure: true,
    retried: true,
    final_status: mediaById.get("MEDIA_005")?.aggregate_status ?? "unknown"
  }
};

const mediaPlan = {
  theme,
  workflow: "Idea -> Scene -> Segment -> Media Card -> Media Task -> Audio Task -> Final Video",
  target_duration_seconds: targetDurationSeconds,
  storyboard_items: storyboard.items.length,
  image_assets: storyboard.items.map((item) => item.image_asset),
  audio_assets: storyboard.items.map((item) => item.audio_manifest_path),
  real_provider_video: videoRunFiles.realProviderManifest,
  required_outputs: Object.values(videoRunFiles),
  note: "All paths are project-relative and mock-only."
};

writeText(
  path.join(process.cwd(), videoRunFiles.request),
  [
    "# Video Workflow Request",
    "",
    `主题：${theme}`,
    "",
    "时长：30 秒左右",
    "",
    "目标：用一个受控视频 workflow 展示 Agent 如何把一句需求推进成可交付结果，并为双模型 Claude Code trace 对比留下证据。",
    "",
    "验收：有分镜、多张图片、对应音频、失败处理、拼接视频、hook/subagent/安全检查和中文交付报告。"
  ].join("\n")
);
writeJson(path.join(process.cwd(), videoRunFiles.storyboard), storyboard);
writeJson(path.join(process.cwd(), videoRunFiles.mediaPlan), mediaPlan);
writeJson(path.join(process.cwd(), videoRunFiles.taskRun), taskRun);
writeJson(path.join(process.cwd(), videoRunFiles.mediaManifest), mediaManifest);
writeText(
  path.join(outputDir, "subagent-review.md"),
  [
    "# Subagent Review",
    "",
    "状态：待模型使用 `video-workflow-reviewer` subagent 复核后补充。脚本先保留审查入口，避免交付链路缺文件。",
    "",
    "初始结论：workflow 已包含需求、分镜、图片、音频、失败 retry、拼接入口、安全检查和报告入口。"
  ].join("\n")
);

console.log("video:export completed");
console.log(`storyboard_items=${storyboard.items.length}`);
console.log(`duration_seconds=${storyboard.total_duration_seconds}`);
