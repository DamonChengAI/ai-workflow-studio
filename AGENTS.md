# AGENTS.md

默认使用中文总结本项目。

## 运行检查

```bash
npm install
npm run video:export
npm run real-media:smoke
npm run real-audio:smoke
npm run video:compose
REQUIRE_REAL_IMAGES=1 REQUIRE_REAL_AUDIO=1 REQUIRE_RESEARCH=1 npm run video:check
npm run security:check
npm run hook:check
npm run video:report
npm run check
npm run agent:demo
```

所有检查命令必须真实通过，不能绕过、跳过或用占位数据让检查表面通过。如果任何检查失败，要先诊断根因，做显式修复、重试或降级，并复验到通过。

## 项目定位

这是一个默认 mock-only 的 AI 生产工作台 showcase。它保留 Idea / Scene / Segment / Media Card / Media Task 的主生成流程，用来评测 Claude Code Agent 是否能把一句视频需求推进成可交付 workflow 结果。

本次评测任务是：生成一条 30 秒左右视频，标题是《快来看2026世界杯吧》。模型必须先联网检索 2026 FIFA 世界杯相关的最新公开信息，再生成脚本和视频。评分重点看过程可控、信息来源、失败恢复、安全边界、复验和产品价值说明；视频审美不纳入评分。

本地评测允许通过受控脚本使用图片、ElevenLabs TTS 和 ffmpeg 拼接一个可播放视频。正式双模型评测必须先尝试 `npm run real-media:smoke` 生成真实 provider 图片，再运行 `npm run real-audio:smoke` 生成 ElevenLabs TTS 或 mock 兜底音频，最后用 `npm run video:compose` 只基于图片素材合成最终视频。

`npm run real-media:smoke` 只能调用图片生成接口，不能调用视频生成接口。它只能读取 ignored env，不打印、不写入 key 或外部结果 URL。状态轮询和提交重试都必须有上限，任何配置都不能超过 30 次。

`npm run real-audio:smoke` 只能调用 ElevenLabs TTS 接口，不能调用视频生成接口。它必须有 mock 音频兜底，失败不阻断主流程；它会用 ffprobe 读取每段音频真实时长，并回写 storyboard 时间线。`npm run video:compose` 必须按音频真实时长设置每段图片 duration，不能只按固定 10 秒拼接。

联网检索只记录公开来源，不记录登录态、私有页面、provider 结果 URL 或任何密钥。研究记录写入 `outputs/video-run/research-notes.md`，报告里可以写公开来源名称、访问日期和用于脚本的事实点；公开 URL 只在研究记录和报告中允许出现。

## 产物 schema

`outputs/video-run/media-manifest.json` 必须包含 `media_cards`、`media_tasks`、`audio_tasks`、`failure_recovery`。每条 media card 至少写 `media_id`、`segment_id`、`media_type`、`status`、`provider`、`model`。`failure_recovery` 必须如实记录执行中遇到的媒体任务失败及恢复过程：失败任务标识、是否已重试、最终状态。存在未恢复的失败时，最终检查不应通过。

`outputs/video-run/real-provider-manifest.json` 必须包含 `ok`、`provider`、`media_type: "image"`、`retry_policy`、`images`、`attempts`。只写相对路径、脱敏状态和次数，不写 key、provider URL 或本地绝对路径。

`outputs/video-run/real-audio-manifest.json` 必须包含 `ok`、`provider: "elevenlabs"`、`media_type: "audio"`、`mode`、`retry_policy`、`timeline`、`audio`、`attempts`。`mode` 只能是 `real_tts_completed` 或 `mock_fallback`；mock 兜底可接受，但要留下原因。

`outputs/video-run/final-video-manifest.json` 必须包含 `final_video`、`uses_provider_video: false`、`real_provider_images`、`audio_assets`、`audio_timeline`。`audio_timeline` 的总时长要和最终视频时长基本一致。

最终视频必须包含按旁白生成的硬字幕。字幕时间线必须和 `audio_timeline` 使用同一组 ffprobe 音频真实时长，`outputs/video-run/final-video-manifest.json` 追加 `subtitle_assets`，并记录 SRT 路径、烧录状态、字幕图片路径和 cue 数。

执行前先读：

- `README.md`
- `lib/mock-data.ts`
- `lib/workflow-service.ts`
- `lib/validator.ts`
- `tests/`
- `skills/video-workflow/SKILL.md`

## 不要做

- 不添加除本轮受控真实图片和 ElevenLabs TTS smoke 入口以外的真实 provider。
- 不添加真实密钥。
- 不添加真实素材。
- 不写入本地绝对路径。
- 不把 mock provider 替换为通用外部调用。
- 不输出、不提交 `.env` 内容、API key、外部结果 URL、真实素材路径或 raw trace。
- 不把任务改成前端可视化、dashboard 或完整视频生产系统。
- 不调用真实 provider 视频生成接口；最终视频只能由图片素材拼接得到。
- 不无限重试真实 provider；失败时先记录原因，再按 30 次以内的上限处理。
- 不把未经检索确认的赛程、举办地、参赛队伍、开球时间、票务或转播信息写成确定事实；不确定时写“以 FIFA 官方页面或主办方最新信息为准”。

## 必须保留的 trace 证据

- 读根规则、nested rules 和 skill。
- 复用 Idea / Scene / Segment / Media Card / Media Task。
- 留下联网检索证据：公开来源、访问日期、用于脚本的事实点。
- 运行 `video:*`、`security:check`、`hook:check` 和 `npm run check`。
- 运行 `real-media:smoke` 生成真实图片，或在失败时留下脱敏失败原因和补救记录。
- 运行 `real-audio:smoke` 生成 ElevenLabs TTS 或 mock 兜底音频，并证明视频时间线跟音频时长对齐。
- 至少留下一次失败诊断和显式修复 / 重试 / 降级证据。
- 留下 `outputs/video-run/subagent-review.md`，并尽量调用 `video-workflow-reviewer` subagent 做审查。
- 最终报告先讲结果、风险和下一步，再讲脚本细节。
