# AI Workflow Studio

`AI Workflow Studio` is a mock-only public showcase of an AI production workspace. It reuses the information architecture of an internal workspace MVP and preserves the core generation flow:

```text
Idea -> Scene -> Segment -> Media Card -> Media Task
```

The public version does not include real business logic, real providers, real assets, real outputs, real secrets, or local paths. All data is sample data, and every generation task is completed by a mock provider. The repository includes generic static mock images to demonstrate `preview_url` write-back; these images do not come from any real project assets.

The repository includes two fully fictional demo datasets:

- `AI Workflow Production Desk`: demonstrates schema design, task state, polling, failed/retry handling, and preview write-back.
- `Xiaohongshu Content Workflow`: demonstrates how a graphic-content Agent can reuse the same Idea / Scene / Segment / Media Card structure.

## Why This Exists

A complex AI production workflow is not just one model call. One idea can contain multiple scenes and segments. Each segment may need image, video, and voiceover assets, and each asset may become a separate generation task with its own prompt, constraints, provider type, task state, failure mode, retry action, and preview write-back target.

AI Workflow Studio models this flow around the `Media Card`. A Media Card is the production contract for one generated asset: it describes what to generate, which prompt to use, which provider type should handle it, what input constraints apply, and where the result should be written back.

The public version stays mock-only so the workflow structure, validation, polling, retry handling, and preview updates can be reviewed without exposing real content, providers, assets, credentials, or local paths.

## What This Demonstrates

- Multi-level AI production object modeling.
- Media Card as the production contract for generation tasks.
- Mock provider submission.
- Task polling.
- `aggregate_status` updates.
- Failed task state and retry handling.
- `preview_url` write-back.
- Static mock visual assets.
- Validator, CLI, tests, and agent-friendly checks.

## What This Project Does Not Claim

- It does not claim to be a differentiated video generation product.
- It does not include real content operations.
- It does not include real provider integrations.
- It does not include growth metrics or commercial results.
- It is a technical product sandbox for workflow decomposition and task-state design.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/workspace
```

Engineering check:

```bash
npm run check
```

## Demo Path

1. Open `/workspace`.
2. Use the copy-all action to copy the full Scene / Segment content.
3. Select a Scene and Segment.
4. Review the current Segment's Media Card.
5. Edit the Prompt and save the card.
6. Submit the current media card to the mock provider.
7. Poll running tasks twice and observe `processing -> completed`.
8. Switch to a video card containing `[FAIL]`, submit it, and poll it to `failed`.
9. Retry the failed task, then poll it to `completed`.

## Privacy Boundary

The public version does not include:

- Real business strategy.
- Real content topics.
- Real people or personal assets.
- Real providers.
- Real APIs.
- Real secrets.
- Real object storage.
- Real output files.
- Real operations data.
- Local absolute paths.

## License

MIT License. See [LICENSE](LICENSE).
