import fs from "node:fs";
import path from "node:path";
import { outputDir, sanitizeText, toProjectPath, videoRunFiles, writeJson } from "./video-workflow-shared";

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
      asString(record.video_url) ??
      asString(record.download_url) ??
      firstStringInArray(record.urls) ??
      firstStringInArray(record.video_urls);
    if (direct) return direct;

    const output = asRecord(record.output);
    if (output) {
      const nestedUrl =
        asString(output.url) ??
        asString(output.video_url) ??
        firstStringInArray(output.urls) ??
        firstStringInArray(output.video_urls);
      if (nestedUrl) return nestedUrl;
    }

    const result = asRecord(record.result);
    const firstVideo = firstRecordInArray(result?.videos);
    if (firstVideo) {
      const videoUrl =
        asString(firstVideo.url) ??
        firstStringInArray(firstVideo.url) ??
        asString(firstVideo.video_url) ??
        firstStringInArray(firstVideo.video_url);
      if (videoUrl) return videoUrl;
    }
  }
  return null;
}

function publicError(data: JsonRecord): string | null {
  const nested = pickNestedRecord(data);
  return asString(data.message) ?? asString(data.error) ?? asString(nested?.message) ?? asString(nested?.error);
}

async function readJson(response: Response): Promise<JsonRecord> {
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

function readExistingManifest(manifestPath: string) {
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    ok?: boolean;
    task_id?: string;
    video?: { path?: string | null };
  };
}

async function submitVideo(submitUrl: string, apiKey: string, model: string) {
  const body = {
    model,
    prompt:
      "A polished product workflow explainer video: one short user request becomes structured storyboard cards, image and audio tasks, provider generation, retry handling, safety check, and final delivery report. Clean modern product UI motion, no logos, no real people, no sensitive text.",
    image_urls: [],
    duration: 5,
    aspect_ratio: "16:9",
    resolution: "720p",
    audio: true
  };

  const response = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  const data = await readJson(response);
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
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`status_failed status=${response.status} message=${sanitizeText(publicError(data) ?? "unknown")}`);
  }
  return {
    task_status: extractStatus(data),
    result_url: extractResultUrl(data),
    error_message: sanitizeText(publicError(data) ?? "")
  };
}

async function downloadVideo(resultUrl: string, outputPath: string) {
  const response = await fetch(resultUrl);
  if (!response.ok) throw new Error(`download_failed status=${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, bytes);
  return bytes.length;
}

async function main() {
  const loadedEnvFiles = envCandidates.filter((candidate) => loadEnvFile(candidate));
  const realDir = path.join(outputDir, "real-provider");
  const videoPath = path.join(realDir, "real-provider-video.mp4");
  const manifestPath = path.join(process.cwd(), videoRunFiles.realProviderManifest);
  fs.mkdirSync(realDir, { recursive: true });

  const existingManifest = readExistingManifest(manifestPath);
  if (existingManifest?.ok && existingManifest.video?.path && fs.existsSync(path.join(process.cwd(), existingManifest.video.path))) {
    console.log("real-media:smoke skipped");
    console.log("reason=completed_manifest_exists");
    return;
  }

  const baseUrl = requiredEnv("APIMART_BASE_URL");
  const apiKey = requiredEnv("APIMART_API_KEY");
  const model = process.env.REAL_VIDEO_MODEL ?? "doubao-seedance-1-5-pro";
  const videoApiPath = process.env.VIDEO_API_PATH ?? "/v1/videos/generations";
  const rawStatusPath = process.env.TASK_STATUS_API_PATH ?? "/v1/tasks";
  const statusBasePath = rawStatusPath.endsWith("/") ? rawStatusPath.slice(0, -1) : rawStatusPath;
  const pollAttempts = numberFromEnv("REAL_VIDEO_MAX_POLL_ATTEMPTS", 30, 30);
  const submitRetries = numberFromEnv("REAL_VIDEO_MAX_SUBMIT_RETRIES", 3, 30);
  const pollIntervalMs = numberFromEnv("REAL_VIDEO_POLL_INTERVAL_MS", 15000, 60000);
  const taskIdArgIndex = process.argv.indexOf("--task-id");
  const initialTaskId = taskIdArgIndex >= 0 ? process.argv[taskIdArgIndex + 1] : existingManifest?.task_id;

  if (baseUrl === "mock") throw new Error("APIMART_BASE_URL points to mock mode");

  const submitUrl = new URL(videoApiPath, baseUrl).toString();
  const attempts: Array<Record<string, unknown>> = [];
  let taskId = initialTaskId ?? null;
  let lastStatus: TaskStatus | "not_submitted" = "not_submitted";
  let downloadedBytes = 0;

  for (let submitAttempt = taskId ? 0 : 1; submitAttempt <= submitRetries; submitAttempt += 1) {
    if (!taskId) {
      try {
        taskId = await submitVideo(submitUrl, apiKey, model);
        attempts.push({ phase: "submit", submit_attempt: submitAttempt, ok: true, task_id_present: true });
      } catch (error) {
        attempts.push({
          phase: "submit",
          submit_attempt: submitAttempt,
          ok: false,
          error: sanitizeText(error instanceof Error ? error.message : String(error))
        });
        if (submitAttempt >= submitRetries) break;
        continue;
      }
    }

    for (let pollAttempt = 1; pollAttempt <= pollAttempts; pollAttempt += 1) {
      const status = await getStatus(baseUrl, statusBasePath, taskId, apiKey);
      lastStatus = status.task_status;
      attempts.push({
        phase: "status",
        poll_attempt: pollAttempt,
        task_status: status.task_status,
        result_url_available: Boolean(status.result_url),
        error_message: status.error_message || null
      });

      if (status.task_status === "completed" && status.result_url) {
        downloadedBytes = await downloadVideo(status.result_url, videoPath);
        const manifest = {
          ok: true,
          provider: "apimart",
          model,
          task_id: taskId,
          task_status: status.task_status,
          loaded_env_files: loadedEnvFiles.map((file) => path.basename(file)),
          retry_policy: {
            max_submit_retries: submitRetries,
            max_poll_attempts: pollAttempts,
            poll_interval_ms: pollIntervalMs,
            hard_cap: 30
          },
          video: {
            path: toProjectPath(videoPath),
            bytes: downloadedBytes,
            result_url_available: true
          },
          attempts
        };
        writeJson(manifestPath, manifest);
        console.log("real-media:smoke completed");
        console.log("provider=apimart");
        console.log(`model=${model}`);
        console.log(`task_status=${status.task_status}`);
        console.log(`video_path=${manifest.video.path}`);
        return;
      }

      if (status.task_status === "failed" || status.task_status === "cancelled") {
        taskId = null;
        break;
      }

      if (pollAttempt < pollAttempts) await sleep(pollIntervalMs);
    }
  }

  const manifest = {
    ok: false,
    provider: "apimart",
    model,
    task_id: taskId,
    task_status: lastStatus,
    loaded_env_files: loadedEnvFiles.map((file) => path.basename(file)),
    retry_policy: {
      max_submit_retries: submitRetries,
      max_poll_attempts: pollAttempts,
      poll_interval_ms: pollIntervalMs,
      hard_cap: 30
    },
    video: {
      path: null,
      bytes: downloadedBytes,
      result_url_available: false
    },
    attempts
  };
  writeJson(manifestPath, manifest);
  throw new Error(`real video generation did not complete; status=${lastStatus}`);
}

main().catch((error) => {
  const message = sanitizeText(error instanceof Error ? error.message : String(error));
  console.error(`real-media:smoke failed: ${message}`);
  process.exit(1);
});
