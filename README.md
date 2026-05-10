# AI Workflow Studio

> English version: [README.en.md](README.en.md)

`AI Workflow Studio` 是一个 mock-only 的 AI 生产工作台公开 showcase。它复用原 Workspace MVP 的信息架构，保留主生成流程：

```text
Idea -> Scene -> Segment -> Media Card -> Media Task
```

公开版不包含真实业务逻辑、真实供应商、真实素材、真实输出、真实密钥或本地路径。所有数据都是 sample data，所有生成任务都由 mock provider 完成。仓库内包含一组通用静态 mock 图片，用来展示 `preview_url` 回写后的视觉效果；这些图片不来自真实项目素材。

仓库内置两组完全虚构的 demo 数据：

- `AI Workflow Production Desk`：展示 schema、任务状态、轮询、失败重试和 preview 回写。
- `Xiaohongshu Content Workflow`：展示图文内容 Agent 如何复用同一套 Idea / Scene / Segment / Media Card 结构。

## 为什么做这个项目

复杂 AI 生产流程不只是一次模型调用。一个 idea 可能包含多个 scene 和 segment，每个 segment 又可能需要图片、视频、旁白等素材，每个素材都可能成为一个独立生成任务，并带有自己的 prompt、约束、provider 类型、任务状态、失败模式、重试动作和预览回写位置。

AI Workflow Studio 围绕 `Media Card` 建模。Media Card 是单个素材生成任务的生产合约：描述要生成什么、使用什么 prompt、由哪类 provider 处理、有哪些输入限制，以及生成结果应该回写到哪里。

公开版保持 mock-only，让 workflow 结构、校验、轮询、失败重试和 preview 回写可以被直接审阅，同时不暴露真实内容、供应商、素材、凭证或本地路径。

## 这个项目展示什么

- 多层 AI 生产对象建模。
- Media Card 作为生成任务的生产合约。
- mock provider submit。
- task polling。
- `aggregate_status` 更新。
- failed 状态和 retry 处理。
- `preview_url` 回写。
- 静态 mock 视觉资产。
- validator、CLI、测试和 agent-friendly checks。

## 这个项目不声称什么

- It does not claim to be a differentiated video generation product.
- It does not include real content operations.
- It does not include real provider integrations.
- It does not include growth metrics or commercial results.
- It is a technical product sandbox for workflow decomposition and task-state design.

## 本地运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000/workspace
```

工程检查：

```bash
npm run check
```

## Demo 路径

1. 打开 `/workspace`。
2. 使用复制全部内容的操作，复制完整 Scene / Segment 内容。
3. 选择 Scene 和 Segment。
4. 查看当前 Segment 的 Media Card。
5. 修改 Prompt 并保存卡片。
6. 将当前 media card 提交给 mock provider。
7. 轮询运行中的任务两次，观察 `processing -> completed`。
8. 切到带 `[FAIL]` 的 video card，提交并轮询到 `failed`。
9. 重试失败任务，再轮询到 `completed`。

## 隐私边界

公开版不包含：

- 真实业务策略。
- 真实内容主题。
- 真实人物或个人素材。
- 真实 provider。
- 真实 API。
- 真实密钥。
- 真实对象存储。
- 真实输出文件。
- 真实运营数据。
- 本地绝对路径。

## 授权

MIT License. See [LICENSE](LICENSE).
