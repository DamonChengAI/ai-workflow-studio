# MVP 方案：脱敏版 AI 生产工作台

## 目标

本仓库是原私有工作台的 **mock-only 脱敏公开版**，用于面试展示。目标不是重新设计一个新产品，也不是做通用 workflow 控制台，而是保留原工作台的主生成流程和信息架构：

```text
Idea -> Scene -> Segment -> Media Card -> Media Task
```

公开版只展示通用工程能力：

- 层级对象管理
- Media Card 作为生成任务的生产合约
- mock provider 提交
- media task 状态流转
- 轮询
- aggregate_status 聚合
- failed / retry
- preview_url 回写
- 通用静态 mock 图片资产
- CLI 校验和测试

## 核心原则

- 复用原 Workspace MVP 的前端信息架构。
- 不做新的抽象 dashboard。
- 不在前端大面积展示 validator。
- 不加入原项目没有的 showcase 专用大功能。
- 公开版可以 `npm run dev` 直接运行，不需要真实 API、数据库、密钥、对象存储或外部 provider。
- README 和 UI 默认中文，英文只作为补充。

## 技术栈

- Next.js
- React
- TypeScript
- zod
- vitest
- in-memory mock store
- mock provider

## 运行方式

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000/workspace
```

工程验证：

```bash
npm run check
```

## 前端范围

只保留原工作台主生成流程的必要环节。

### 顶部

保留：

- 工作台标题
- 复制全部内容
- 轮询任务
- 重置 Demo
- message / error

不做：

- 导入 JSON 大按钮
- 导出摘要大按钮
- 大号校验面板
- 全局失败演示按钮
- 输出目录 / 自动轮询 / 保存设置等工程配置控件
- 新设计的 Review Cards / Run Profiles

### Row 1

保留原结构：

```text
Ideas | 封面 | 标题
```

公开版内容全部 mock：

- Ideas：虚构 sample idea
- 封面：mock cover variants，不调用真实 provider
- 标题：mock title variants

### Row 2

保留原结构：

```text
Scenes
左侧 scene 列表
右侧当前 scene 下的 segment 总览
```

### Row 3

保留原结构：

```text
Segment tabs
当前 Segment 内容
Media Cards
```

Media Card 内保留：

- preview placeholder
- media_id
- aggregate_status
- task rows
- prompt textarea
- generate_count
- provider
- model
- duration
- aspect_ratio
- resolution
- audio
- 保存卡片
- 提交生成
- failed 状态下显示重试按钮
- reference_images 数量展示

## 后端范围

保留原 API route 的形状，但全部 mock：

```text
GET /api/settings
PATCH /api/settings

GET /api/ideas
GET /api/ideas/:ideaId/covers

GET /api/scenes?idea_id=
GET /api/segments?scene_id=
GET /api/segments
PATCH /api/segments/:segmentId

GET /api/segment-media?segment_id=
PATCH /api/segment-media/:mediaId
POST /api/segment-media/:mediaId/submit
POST /api/segment-media/:mediaId/retry
GET /api/segment-media/:mediaId/tasks
POST /api/segment-media/poll-running

POST /api/mock/reset
```

不做：

- 真实数据库
- 真实 provider
- 真实上传
- 真实对象存储
- 真实音频
- 真实输出文件
- 真实环境变量读取

公开版可以包含少量通用静态 mock 图片，用于展示 completed 后的 preview 效果。这些图片必须是为本 sandbox 单独生成的通用视觉资产，不来自原私有项目素材。

## Mock 生成规则

`submitMedia(media_id)`：

- 如果 card 是 `idle`：创建 `generate_count` 个 MediaTask，状态为 `processing`。
- 如果 card 是 `processing` 或 `completed`：不重复创建任务。
- 如果 card 是 `failed`：默认不自动重提，必须显式 retry。

`pollRunningTasks()`：

- 第一次 poll：processing
- 第二次 poll：completed
- image result_url：`/mock-assets/MOCK_JOB_001.png`
- video result_url：`/mock-assets/MOCK_JOB_002.mp4`
- prompt 包含 `[FAIL]` 时第二次 poll：failed

`retryMedia(media_id)`：

- 只允许 failed card 重试。
- 移除 prompt 中的 `[FAIL]`。
- 将 failed task 重新提交为 processing。

## 状态聚合

Media Card `aggregate_status`：

```text
无任务 -> idle
任一 task failed -> failed
任一 task pending / processing -> processing
所有 task completed -> completed
completed 后 preview_url 使用第一个 completed task 的 result_url
```

## Sample 数据

主题：

```text
如何把复杂 AI 任务拆成可生产的工作流
国际时尚趋势观察：低调奢华之后，为什么“精致实穿”又回来了？
```

规模：

- 2 ideas
- 5 scenes
- 9 segments
- 10 media cards
- 4 mock cover / title variants
- 一组通用 workflow 16:9 mock assets
- 一组小红书图文 3:4 mock assets

## CLI 和测试

CLI 保留工程验证，不抢前端展示空间：

```bash
npm run validate
npm run demo
npm run agent:demo
npm run check
npm test
```

测试覆盖：

- valid sample passes
- missing reference fails
- video generate_count > 1 fails
- image duration fails
- unsupported provider fails
- submit creates tasks
- poll changes processing to completed
- failed prompt changes task to failed
- aggregate status updates correctly
- retry failed task works
- duplicate submit does not create duplicate tasks

## 脱敏边界

公开版不包含：

- 真实业务策略
- 真实内容主题
- 真实人物
- 真实素材
- 真实供应商
- 真实 API
- 真实密钥
- 真实对象存储
- 真实输出文件
- 真实运营数据
- 本地绝对路径

## 验收标准

- `npm install` 成功。
- `npm run dev` 可打开 `/workspace`。
- 页面可完成：选择 scene、选择 segment、保存 media card、提交生成、轮询两次、看到 completed preview。
- failed card 可 retry。
- `npm run check` 成功。
- `npm test` 成功。
- 脱敏扫描零命中。
- 原私有项目不被修改。
