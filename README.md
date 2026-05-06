# AI Workflow Studio

这是一个 **mock-only 的 AI 生产工作台 showcase**。它复用原 Workspace MVP 的信息架构，保留主生成流程：

```text
Idea -> Scene -> Segment -> Media Card -> Media Task
```

公开版不包含真实业务、真实供应商、真实素材、真实输出、真实密钥或本地路径。所有数据都是 sample data，所有生成任务都由 mock provider 完成。仓库内包含一组通用静态 mock 图片，用来展示 `preview_url` 回写后的视觉效果；这些图片不来自真实项目素材。

内置两组完全虚构的 demo 数据：

- `AI 工作流生产台`：展示 schema、状态机、轮询、失败重试和 preview 回写。
- `小红书图文工作流`：展示图文内容 Agent 如何复用同一套 Idea / Scene / Segment / Media Card 结构。

## 这个项目展示什么

- 多层 AI 生产对象拆解
- Media Card 作为生成任务的生产合约
- mock provider submit
- task polling
- aggregate_status 聚合
- failed / retry
- preview_url 回写
- 静态 mock 视觉资产
- validator、CLI、测试和 agent-friendly 检查

## 这个项目不声称什么

- It does not claim to be a differentiated video generation product.
- It does not include real content operations.
- It does not include real provider integrations.
- It does not include growth metrics or commercial results.
- It is a technical product sandbox for workflow decomposition and task-state design.

## 运行

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

## 面试展示路径

1. 打开 `/workspace`。
2. 点击“复制全部内容”，展示完整 Scene / Segment 内容可被一次性带走。
3. 选择 Scene 和 Segment。
4. 查看当前 Segment 的 Media Card。
5. 修改 Prompt 并保存卡片。
6. 点击“提交生成”。
7. 点击“轮询任务”两次，观察 `processing -> completed`。
8. 切到带 `[FAIL]` 的 video card，提交并轮询到 failed。
9. 点击“重试失败任务”，再轮询到 completed。

## 隐私边界

公开版不包含：

- 真实业务策略
- 真实内容主题
- 真实人物或个人素材
- 真实 provider
- 真实 API
- 真实密钥
- 真实对象存储
- 真实输出文件
- 真实运营数据
- 本地绝对路径

## English Summary

AI Workflow Studio is a mock-only public showcase of an AI production workspace. It demonstrates how a multi-step AI generation flow can be decomposed into structured objects, media cards, provider tasks, polling, aggregate status updates, retry handling, and preview write-back.

It is designed for interview review and technical discussion. It does not connect to external providers, store private assets, include real content operations, or claim product-market differentiation.

Run it with:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000/workspace
```
