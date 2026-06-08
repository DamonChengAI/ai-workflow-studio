import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readJson, outputDir, sanitizeText, toProjectPath, videoRunFiles, writeJson, type StoryboardFile } from "./video-workflow-shared";

type TaskStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
type JsonRecord = Record<string, unknown>;

const homeDir = process.env.HOME ?? "";
const configuredFallbacks = (process.env.REAL_MEDIA_ENV_FALLBACKS ?? "")
  .split(path.delimiter)
  .map((item) => item.trim())
  .filter(Boolean);

const envCandidates = [
  path.resolve(process.cwd(), ".env.local"),
  process.env.REAL_MEDIA_ENV_FILE ? path.resolve(process.env.REAL_MEDIA_ENV_FILE) : null,
  ...configuredFallbacks.map((item) => path.resolve(item)),
  homeDir ? path.join(homeDir, "Desktop", "tt_idea", "ttvideo_workflow", ".env") : null,
  homeDir ? path.join(homeDir, "Desktop", "ship", "youtube_long", ".env") : null,
  homeDir ? path.join(homeDir, "Desktop", "ship", "oldmoney_main", ".env") : null
].filter(Boolean) as string[];

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return false;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstStringInArray(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const text = asString(item);
    if (text) return text;
  }
  return null;
}

function firstRecordInArray(value: unknown): JsonRecord | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const record = asRecord(item);
    if (record) return record;
  }
  return null;
}

function pickNestedRecord(data: JsonRecord): JsonRecord | null {
  return asRecord(data.data) ?? firstRecordInArray(data.data) ?? asRecord(data.result) ?? firstRecordInArray(data.result) ?? null;
}

function extractTaskId(data: JsonRecord): string | null {
  const direct = asString(data.task_id) ?? asString(data.id) ?? asString(data.taskId);
  if (direct) return direct;
  const nested = pickNestedRecord(data);
  return nested ? asString(nested.task_id) ?? asString(nested.id) ?? asString(nested.taskId) : null;
}

function extractStatus(data: JsonRecord): TaskStatus {
  const nested = pickNestedRecord(data);
  const raw = asString(data.task_status) ?? asString(data.status) ?? asString(nested?.task_status) ?? asString(nested?.status);
  const normalized = raw?.toLowerCase();
  if (normalized === "pending" || normalized === "queued" || normalized === "submitted") return "pending";
  if (normalized === "completed" || normalized === "succeeded" || normalized === "success" || normalized === "done") return "completed";
  if (normalized === "failed" || normalized === "error") return "failed";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  return "processing";
}

function extractResultUrl(data: JsonRecord): string | null {
  const nested = pickNestedRecord(data);
  const candidates = [data, nested].filter(Boolean) as JsonRecord[];
  for (const record of candidates) {
    const direct =
      asString(record.url) ??
      asString(record.image_url) ??
      asString(record.download_url) ??
      firstStringInArray(record.urls) ??
      firstStringInArray(record.image_urls);
    if (direct) return direct;

    const output = asRecord(record.output);
    if (output) {
      const nestedUrl =
        asString(output.url) ??
        asString(output.image_url) ??
        firstStringInArray(output.urls) ??
        firstStringInArray(output.image_urls);
      if (nestedUrl) return nestedUrl;
    }

    const result = asRecord(record.result);
    const firstImage = firstRecordInArray(result?.images);
    if (firstImage) {
      const imageUrl =
        asString(firstImage.url) ??
        firstStringInArray(firstImage.url) ??
        asString(firstImage.image_url) ??
        firstStringInArray(firstImage.image_url);
      if (imageUrl) return imageUrl;
    }
  }
  return null;
}

function publicError(data: JsonRecord): string | null {
  const nested = pickNestedRecord(data);
  return asString(data.message) ?? asString(data.error) ?? asString(nested?.message) ?? asString(nested?.error);
}

async function parseResponseJson(response: Response): Promise<JsonRecord> {
  return (await response.json().catch(() => ({}))) as JsonRecord;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function numberFromEnv(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitImage(submitUrl: string, apiKey: string, model: string, prompt: string) {
  const response = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      prompt,
      image_urls: [],
      size: "16:9",
      resolution: "1K"
    })
  });
  const data = await parseResponseJson(response);
  const taskId = extractTaskId(data);
  if (!response.ok || !taskId) {
    throw new Error(`submit_failed status=${response.status} message=${sanitizeText(publicError(data) ?? "unknown")}`);
  }
  return taskId;
}

async function getStatus(baseUrl: string, statusBasePath: string, taskId: string, apiKey: string) {
  const statusUrl = new URL(`${statusBasePath}/${taskId}`, baseUrl).toString();
  const response = await fetch(statusUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const data = await parseResponseJson(response);
  if (!response.ok) {
    throw new Error(`status_failed status=${response.status} message=${sanitizeText(publicError(data) ?? "unknown")}`);
  }
  return {
    task_status: extractStatus(data),
    result_url: extractResultUrl(data),
    error_message: sanitizeText(publicError(data) ?? "")
  };
}

async function downloadImage(resultUrl: string, outputPath: string) {
  const response = await fetch(resultUrl);
  if (!response.ok) throw new Error(`download_failed status=${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, bytes);
  normalizeImageToPng(outputPath);
  return bytes.length;
}

function normalizeImageToPng(filePath: string) {
  const tempPath = `${filePath}.normalized.png`;
  execFileSync(
    "magick",
    [
      filePath,
      "-auto-orient",
      "-colorspace",
      "sRGB",
      "-background",
      "black",
      "-alpha",
      "remove",
      "-alpha",
      "off",
      `PNG24:${tempPath}`
    ],
    { cwd: process.cwd(), stdio: "pipe" }
  );
  fs.renameSync(tempPath, filePath);
}

function promptFor(storyboard: StoryboardFile, item: StoryboardFile["items"][number]) {
  return [
    `Create a 16:9 Chinese event promo image for the video theme "${storyboard.theme}" and storyboard segment "${item.title}".`,
    `Subject: ${storyboard.theme}.`,
    `Narration idea: ${item.narration_cn}`,
    "Visual direction: football tournament viewing promo, stadium energy, match-day atmosphere, clean high-contrast composition, readable Chinese headline/key elements, and solid panels behind any text.",
    "Subtitle safe area: keep critical text and key objects out of the lower 24% of the frame.",
    "Avoid tiny text, glassmorphism, blurred text backgrounds, and heavy glow; do not show real logos, real people, fake app screenshots, unverifiable schedules, unrelated AI app branding, app commerce screens, or price cards."
  ].join(" ");
}

async function main() {
  const loadedEnvFiles = envCandidates.filter((candidate) => loadEnvFile(candidate));
  const imageDir = path.join(outputDir, "real-provider-images");
  const manifestPath = path.join(process.cwd(), videoRunFiles.realProviderManifest);
  fs.mkdirSync(imageDir, { recursive: true });

  const storyboard = readJson<StoryboardFile>(videoRunFiles.storyboard);
  const existingImages = storyboard.items
    .map((item) => path.join(imageDir, `${String(item.order).padStart(2, "0")}.png`))
    .filter((filePath) => fs.existsSync(filePath));
  if (existingImages.length === storyboard.items.length && fs.existsSync(manifestPath)) {
    existingImages.forEach((filePath) => normalizeImageToPng(filePath));
    console.log("real-media:smoke skipped");
    console.log("reason=completed_image_manifest_exists");
    return;
  }

  const baseUrl = requiredEnv("APIMART_BASE_URL");
  const apiKey = requiredEnv("APIMART_API_KEY");
  const model = process.env.REAL_IMAGE_MODEL ?? "gemini-3-pro-image-preview";
  const imageApiPath = process.env.IMAGE_API_PATH ?? "/v1/images/generations";
  const rawStatusPath = process.env.TASK_STATUS_API_PATH ?? "/v1/tasks";
  const statusBasePath = rawStatusPath.endsWith("/") ? rawStatusPath.slice(0, -1) : rawStatusPath;
  const pollRounds = numberFromEnv("REAL_IMAGE_MAX_POLL_ROUNDS", 30, 30);
  const submitRetries = numberFromEnv("REAL_IMAGE_MAX_SUBMIT_RETRIES", 3, 30);
  const pollIntervalMs = numberFromEnv("REAL_IMAGE_POLL_INTERVAL_MS", 10000, 60000);

  if (baseUrl === "mock") throw new Error("APIMART_BASE_URL points to mock mode");

  const submitUrl = new URL(imageApiPath, baseUrl).toString();
  const attempts: Array<Record<string, unknown>> = [];
  const tasks = new Map<number, { task_id: string; status: TaskStatus; result_url: string | null; output_path: string }>();

  for (const item of storyboard.items) {
    const outputPath = path.join(imageDir, `${String(item.order).padStart(2, "0")}.png`);
    if (fs.existsSync(outputPath)) {
      normalizeImageToPng(outputPath);
      tasks.set(item.order, { task_id: "existing", status: "completed", result_url: null, output_path: outputPath });
      attempts.push({ phase: "reuse", order: item.order, ok: true, path: toProjectPath(outputPath) });
      continue;
    }

    for (let submitAttempt = 1; submitAttempt <= submitRetries; submitAttempt += 1) {
      try {
        const taskId = await submitImage(submitUrl, apiKey, model, promptFor(storyboard, item));
        tasks.set(item.order, { task_id: taskId, status: "pending", result_url: null, output_path: outputPath });
        attempts.push({ phase: "submit", order: item.order, submit_attempt: submitAttempt, ok: true, task_id_present: true });
        break;
      } catch (error) {
        attempts.push({
          phase: "submit",
          order: item.order,
          submit_attempt: submitAttempt,
          ok: false,
          error: sanitizeText(error instanceof Error ? error.message : String(error))
        });
      }
    }
  }

  for (let round = 1; round <= pollRounds; round += 1) {
    for (const [order, task] of tasks) {
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") continue;
      const status = await getStatus(baseUrl, statusBasePath, task.task_id, apiKey);
      task.status = status.task_status;
      task.result_url = status.result_url;
      attempts.push({
        phase: "status",
        order,
        poll_round: round,
        task_status: status.task_status,
        result_url_available: Boolean(status.result_url),
        error_message: status.error_message || null
      });
      if (status.task_status === "completed" && status.result_url) {
        const bytes = await downloadImage(status.result_url, task.output_path);
        attempts.push({ phase: "download", order, ok: true, bytes });
      }
    }
    if ([...tasks.values()].every((task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled")) break;
    if (round < pollRounds) await sleep(pollIntervalMs);
  }

  const images = storyboard.items.map((item) => {
    const task = tasks.get(item.order);
    return {
      order: item.order,
      title: item.title,
      ok: Boolean(task && task.status === "completed" && fs.existsSync(task.output_path)),
      path: task && fs.existsSync(task.output_path) ? toProjectPath(task.output_path) : null,
      task_status: task?.status ?? "failed",
      task_id_present: Boolean(task?.task_id)
    };
  });
  const ok = images.every((image) => image.ok);

  writeJson(manifestPath, {
    ok,
    provider: "apimart",
    media_type: "image",
    model,
    loaded_env_files: loadedEnvFiles.map((file) => path.basename(file)),
    retry_policy: {
      max_submit_retries: submitRetries,
      max_poll_rounds: pollRounds,
      poll_interval_ms: pollIntervalMs,
      hard_cap: 30
    },
    images,
    attempts
  });

  console.log(ok ? "real-media:smoke completed" : "real-media:smoke incomplete");
  console.log("provider=apimart");
  console.log("media_type=image");
  console.log(`model=${model}`);
  console.log(`images_completed=${images.filter((image) => image.ok).length}/${images.length}`);
  if (!ok) throw new Error("real image generation did not complete");
}

main().catch((error) => {
  const message = sanitizeText(error instanceof Error ? error.message : String(error));
  console.error(`real-media:smoke failed: ${message}`);
  process.exit(1);
});
