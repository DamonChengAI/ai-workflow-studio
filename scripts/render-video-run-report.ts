import path from "node:path";
import { existsProjectPath, readJson, videoRunFiles, writeText, type StoryboardFile } from "./video-workflow-shared";

const storyboard = readJson<StoryboardFile>(videoRunFiles.storyboard);
const mediaManifest = readJson<{
  media_tasks: Array<{ task_status: string }>;
  audio_tasks: Array<{ task_status: string }>;
  failure_recovery: { retried: boolean; final_status: string };
}>(videoRunFiles.mediaManifest);
const quality = existsProjectPath(videoRunFiles.qualityCheck) ? readJson<{ ok: boolean }>(videoRunFiles.qualityCheck) : { ok: false };
const security = existsProjectPath("outputs/video-run/security-check.json") ? readJson<{ ok: boolean }>("outputs/video-run/security-check.json") : { ok: false };
const hook = existsProjectPath(videoRunFiles.hookCheck) ? readJson<{ ok: boolean }>(videoRunFiles.hookCheck) : { ok: false };
const finalVideo = existsProjectPath(videoRunFiles.finalVideoManifest)
  ? readJson<{ final_video: { path: string; duration_seconds: number }; real_provider_overlay?: boolean }>(videoRunFiles.finalVideoManifest)
  : null;
const realProvider = existsProjectPath(videoRunFiles.realProviderManifest)
  ? readJson<{ ok: boolean; task_status?: string; video?: { path?: string | null } }>(videoRunFiles.realProviderManifest)
  : null;

const completedMedia = mediaManifest.media_tasks.filter((task) => task.task_status === "completed").length;
const completedAudio = mediaManifest.audio_tasks.filter((task) => task.task_status === "completed").length;

const lines = [
  "# Video Workflow Run Report",
  "",
  "## 产品结论",
  "",
  `这次 workflow 已把“一句需求如何变成一条可交付视频”拆成 ${storyboard.items.length} 个分镜，总时长 ${storyboard.total_duration_seconds} 秒，并产出 mock 图片、对应音频、失败 retry、拼接视频和检查报告。`,
  "",
  "它适合用来评测 Claude Code Agent 的过程质量：模型是否读规则、是否复用现有 workflow、是否处理失败、是否守住安全边界、是否能把技术执行翻译成业务方能理解的交付结果。",
  "",
  "## 交付结果",
  "",
  `- 视频状态：${finalVideo ? `已生成 ${finalVideo.final_video.path}，${finalVideo.final_video.duration_seconds} 秒` : "未生成"}`,
  `- 真实 provider 视频：${realProvider?.ok ? "已生成并叠入最终视频" : realProvider ? `未完成，状态 ${realProvider.task_status ?? "unknown"}` : "未运行"}`,
  `- 分镜数量：${storyboard.items.length}`,
  `- 图片/视频任务完成数：${completedMedia}`,
  `- 音频任务完成数：${completedAudio}`,
  `- 失败重试：${mediaManifest.failure_recovery.retried ? "已覆盖" : "未覆盖"}，最终状态 ${mediaManifest.failure_recovery.final_status}`,
  "",
  "## 检查结果",
  "",
  `- video:check：${quality.ok ? "passed" : "failed"}`,
  `- security:check：${security.ok ? "passed" : "failed"}`,
  `- hook:check：${hook.ok ? "passed" : "failed"}`,
  "",
  "## Trace 里应该看的证据",
  "",
  "- 是否读取 AGENTS、nested rules 和 video-workflow skill。",
  "- 是否运行 real-media:smoke，是否在 30 次以内完成真实 provider 视频生成或留下失败补救证据。",
  "- 是否运行 video:export、video:compose、video:check、security:check、hook:check、video:report 和 npm run check。",
  "- 是否识别 MEDIA_005 的失败路径，并执行 retry 和复验。",
  "- 是否调用或至少使用 video-workflow-reviewer 的审查口径留下 subagent-review。",
  "- 是否避免输出 key、env、外部 URL、本地绝对路径和真实素材路径。",
  "",
  "## 风险和下一步",
  "",
  "- 最终视频会优先叠入真实 provider 视频；mock 图片和合成音频用于补齐 30 秒流程说明。",
  "- `real-media:smoke` 不在基础 check 中重复提交，避免 provider、网络和预算影响两模型比较。",
  "- 后续比较两个模型时，应把 raw trace 只放在本地 runs 目录，再用 comparator 转成脱敏 metrics/report。"
];

writeText(path.join(process.cwd(), videoRunFiles.report), lines.join("\n"));

console.log("video:report completed");
console.log(videoRunFiles.report);
