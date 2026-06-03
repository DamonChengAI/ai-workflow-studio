# scripts/AGENTS.md

脚本只写相对路径和脱敏信息。

真实图片、ElevenLabs TTS 或 mock 兜底音频、拼接视频只进入 `outputs/` 的 manifest，不打印 key、env、外部结果 URL、本地绝对路径或真实素材路径。

脚本服务评测目标：让两个模型在同一 workflow 里留下可比较 trace，不扩成完整视频生产系统。

`real-media:smoke` 只负责图片生成，`real-audio:smoke` 只负责 TTS 或 mock 音频兜底；两者都不能调用 provider 视频生成接口。

视频合成必须以音频文件的 ffprobe 时长为准，`final-video-manifest.json` 要写 `audio_timeline`，用于复查每段图片 duration 和音频时间线是否对齐。

`media-manifest.json`、`real-provider-manifest.json`、`real-audio-manifest.json`、`final-video-manifest.json` 的字段必须稳定，新增字段只能追加，不能删除已有检查依赖字段。
