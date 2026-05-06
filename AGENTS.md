# AGENTS.md

默认使用中文总结本项目。

## 运行检查

```bash
npm install
npm run check
npm run agent:demo
```

## 项目定位

这是一个 mock-only 的 AI 生产工作台 showcase。它保留 Idea / Scene / Segment / Media Card / Media Task 的主生成流程，不接真实 provider，不读环境变量，不使用真实素材。

## 不要做

- 不添加真实 provider。
- 不添加真实密钥。
- 不添加真实素材。
- 不写入本地绝对路径。
- 不把 mock provider 替换为外部调用。

