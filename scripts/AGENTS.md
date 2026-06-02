# scripts/AGENTS.md

脚本只写相对路径和脱敏信息。

真实图片、音频、拼接视频只进入 `outputs/` 的 manifest，不打印 key、env、外部结果 URL、本地绝对路径或真实素材路径。

脚本服务评测目标：让两个模型在同一 workflow 里留下可比较 trace，不扩成完整视频生产系统。
