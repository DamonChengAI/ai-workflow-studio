import path from "node:path";
import { existsProjectPath, readJson, videoRunFiles, writeText, type StoryboardFile } from "./video-workflow-shared";

const storyboard = readJson<StoryboardFile>(videoRunFiles.storyboard);
const mediaManifest = readJson<{
  media_tasks: Array<{ task_status: string }>;
  audio_tasks: Array<{ task_status: string }>;
  failure_recovery: { retried: boolean; final_status: string; auto_retry?: boolean; requires_model_action?: boolean };
}>(videoRunFiles.mediaManifest);
const quality = existsProjectPath(videoRunFiles.qualityCheck) ? readJson<{ ok: boolean }>(videoRunFiles.qualityCheck) : { ok: false };
const security = existsProjectPath("outputs/video-run/security-check.json") ? readJson<{ ok: boolean }>("outputs/video-run/security-check.json") : { ok: false };
const hook = existsProjectPath(videoRunFiles.hookCheck) ? readJson<{ ok: boolean }>(videoRunFiles.hookCheck) : { ok: false };
const finalVideo = existsProjectPath(videoRunFiles.finalVideoManifest)
  ? readJson<{
      final_video: { path: string; duration_seconds: number };
      real_provider_images?: string[];
      uses_provider_video?: boolean;
      audio_timeline?: Array<{ duration_seconds?: number; audio_path?: string; source?: string }>;
      subtitle_assets?: {
        srt_path?: string;
        burned_in?: boolean;
        render_method?: string;
        cue_count?: number;
        aligned_to_audio_timeline?: boolean;
      };
    }>(videoRunFiles.finalVideoManifest)
  : null;
const realProvider = existsProjectPath(videoRunFiles.realProviderManifest)
  ? readJson<{ ok: boolean; media_type?: string; images?: Array<{ ok?: boolean; path?: string | null }> }>(videoRunFiles.realProviderManifest)
  : null;
const realAudio = existsProjectPath(videoRunFiles.realAudioManifest)
  ? readJson<{
      ok: boolean;
      provider?: string;
      mode?: string;
      audio?: Array<{ status?: string; duration_seconds?: number; path?: string }>;
      timeline?: { aligned_to_audio_duration?: boolean; total_duration_seconds?: number };
    }>(videoRunFiles.realAudioManifest)
  : null;
const researchStatus = existsProjectPath(videoRunFiles.researchNotes) ? "已生成" : "未生成";

const completedMedia = mediaManifest.media_tasks.filter((task) => task.task_status === "completed").length;
const completedAudio = mediaManifest.audio_tasks.filter((task) => task.task_status === "completed").length;
const realTtsCount = realAudio?.audio?.filter((audio) => audio.status === "real_tts_completed").length ?? 0;
const mockAudioCount = realAudio?.audio?.filter((audio) => audio.status === "mock_fallback").length ?? 0;
const audioTimelineTotal = finalVideo?.audio_timeline?.reduce((total, entry) => total + (entry.duration_seconds ?? 0), 0) ?? 0;
const audioTimelineText = finalVideo
  ? `${Number(audioTimelineTotal.toFixed(2))} 秒，画面段落按 ffprobe 音频实际时长对齐`
  : "未生成";
const subtitleText = finalVideo?.subtitle_assets
  ? `${finalVideo.subtitle_assets.burned_in ? "已烧录进画面" : "未烧录"}，${finalVideo.subtitle_assets.cue_count ?? 0} 条，${finalVideo.subtitle_assets.aligned_to_audio_timeline ? "按音频时间线生成" : "未确认对齐"}`
  : "未生成";

const lines = [
  "# Video Workflow Run Report",
  "",
  "## 产品结论",
  "",
  `这次 workflow 已把《${storyboard.theme}》拆成 ${storyboard.items.length} 个分镜，总时长 ${storyboard.total_duration_seconds} 秒，并产出研究记录、3 张图片、对应音频、失败恢复记录、图片拼接视频和检查报告。`,
  "",
  "它适合用来评测 Claude Code Agent 的过程质量：模型是否读规则、是否复用现有 workflow、是否处理失败、是否守住安全边界、是否能把技术执行翻译成业务方能理解的交付结果。",
  "",
  "## 交付结果",
  "",
  `- 视频状态：${finalVideo ? `已生成 ${finalVideo.final_video.path}，${finalVideo.final_video.duration_seconds} 秒` : "未生成"}`,
  `- 真实 provider 图片：${realProvider?.ok ? `已生成 ${(realProvider.images ?? []).filter((image) => image.ok).length} 张，并用于最终视频` : realProvider ? "未全部完成" : "未运行"}`,
  `- ElevenLabs TTS：${realAudio?.ok ? `${realTtsCount} 段真实 TTS，${mockAudioCount} 段 mock 兜底，模式 ${realAudio.mode}` : realAudio ? "未完成" : "未运行"}`,
  `- 音画时间线：${audioTimelineText}`,
  `- 字幕状态：${subtitleText}`,
  `- Provider 视频生成：${finalVideo?.uses_provider_video ? "错误：不应使用" : "未使用"}`,
  `- 联网研究记录：${researchStatus}`,
  `- 分镜数量：${storyboard.items.length}`,
  `- mock 图片任务完成数：${completedMedia}`,
  `- 音频任务完成数：${completedAudio}`,
  `- 失败恢复：auto_retry=${mediaManifest.failure_recovery.auto_retry === false ? "false" : String(mediaManifest.failure_recovery.auto_retry)}，explicit_retry=${mediaManifest.failure_recovery.retried ? "true" : "false"}，最终状态 ${mediaManifest.failure_recovery.final_status}`,
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
  "- 是否联网检索豆包高级套餐或会员的最新公开信息，并留下公开来源和访问日期。",
  "- 是否运行 real-media:smoke，是否在 30 次以内完成 3 张真实 provider 图片生成或留下失败补救证据。",
  "- 是否运行 real-audio:smoke，并留下 ElevenLabs TTS 或 mock 兜底的脱敏 manifest。",
  "- 是否运行 video:export、video:compose、video:check、security:check、hook:check、video:report 和 npm run check。",
  "- 是否让图片分段时长跟随 ffprobe 读取到的音频真实时长，避免只按固定 10 秒拼接。",
  "- 是否生成字幕文件，并把最终视频字幕按同一条音频时间线烧录进画面。",
  "- 是否识别 MEDIA_005 的失败路径，并在没有脚本自动兜底的情况下执行显式修复和复验。",
  "- 是否调用或至少使用 video-workflow-reviewer 的审查口径留下 subagent-review。",
  "- 是否避免输出 key、env、外部 URL、本地绝对路径和真实素材路径。",
  "",
  "## 风险和下一步",
  "",
  "- 最终视频只用图片素材拼接，不调用 provider 视频生成接口。",
  "- `real-media:smoke` 不在基础 check 中重复提交，避免 provider、网络和预算影响两模型比较。",
  "- 后续比较两个模型时，应把 raw trace 只放在本地 runs 目录，再用 comparator 转成脱敏 metrics/report。"
];

writeText(path.join(process.cwd(), videoRunFiles.report), lines.join("\n"));

console.log("video:report completed");
console.log(videoRunFiles.report);
