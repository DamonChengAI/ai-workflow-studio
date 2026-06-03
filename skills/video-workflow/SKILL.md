# video-workflow skill

这个 skill 用来完成一次 30 秒视频 workflow 评测任务。

按顺序执行：

1. 读根规则、`scripts/AGENTS.md`、`reports/AGENTS.md` 和现有 workflow 代码。
2. 联网检索豆包高级套餐或会员相关的最新公开信息，生成 `outputs/video-run/research-notes.md`。
3. 生成 `outputs/video-run/request.md`。
4. 生成 `outputs/video-run/storyboard.json`。
5. 生成 `outputs/video-run/media-plan.json`。
6. 记录正常路径和失败 retry 路径。
7. 生成多张图片和对应音频的脱敏 manifest。
8. 运行 `npm run real-media:smoke`，尝试真实 provider 图片生成；失败时记录脱敏原因，重试总数不能超过 30。不要调用视频生成接口。
9. 运行 `npm run real-audio:smoke`，尝试 ElevenLabs TTS；失败时写 mock 兜底音频和脱敏原因。音频时长必须用 ffprobe 读取，并回写 storyboard 时间线。
10. 运行 `npm run video:compose` 拼接 30 秒左右视频。最终视频只能由图片素材拼接得到，图片分段时长和字幕 cue 必须跟音频真实时长对齐，字幕要烧录进最终 mp4 画面。
11. 使用 `video-workflow-reviewer` subagent 审查，留下 `outputs/video-run/subagent-review.md`。
12. 运行 `REQUIRE_REAL_IMAGES=1 REQUIRE_REAL_AUDIO=1 REQUIRE_RESEARCH=1 npm run video:check`、`npm run security:check`、`npm run video:report`、`npm run hook:check` 和 `npm run check`。

交付时用中文简要说明产物、检查结果、最终视频状态、TTS/兜底状态、风险和下一步。技术细节只作为支撑产品结论的证据。
