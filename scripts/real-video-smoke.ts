import fs from "node:fs";
import path from "node:path";

type TaskStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

type JsonRecord = Record<string, unknown>;

const envPath = path.resolve(process.cwd(), ".env.local");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstStringInArray(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const item of value) {
    const text = asString(item);
    if (text) {
      return text;
    }
  }

  return null;
}

function firstRecordInArray(value: unknown): JsonRecord | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const item of value) {
    const record = asRecord(item);
    if (record) {
      return record;
    }
  }

  return null;
}

function pickNestedRecord(data: JsonRecord): JsonRecord | null {
  return (
    asRecord(data.data) ??
    firstRecordInArray(data.data) ??
    asRecord(data.result) ??
    firstRecordInArray(data.result) ??
    null
  );
}

function extractTaskId(data: JsonRecord): string | null {
  const direct =
    asString(data.task_id) ??
    asString(data.id) ??
    asString(data.taskId);
  if (direct) {
    return direct;
  }

  const nested = pickNestedRecord(data);
  if (!nested) {
    return null;
  }

  return (
    asString(nested.task_id) ??
    asString(nested.id) ??
    asString(nested.taskId)
  );
}

function extractStatus(data: JsonRecord): TaskStatus {
  const nested = pickNestedRecord(data);
  const raw =
    asString(data.task_status) ??
    asString(data.status) ??
    asString(nested?.task_status) ??
    asString(nested?.status);
  const normalized = raw?.toLowerCase();

  if (normalized === "pending" || normalized === "queued" || normalized === "submitted") {
    return "pending";
  }
  if (normalized === "completed" || normalized === "succeeded" || normalized === "success" || normalized === "done") {
    return "completed";
  }
  if (normalized === "failed" || normalized === "error") {
    return "failed";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }
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
    if (direct) {
      return direct;
    }

    const output = asRecord(record.output);
    if (output) {
      const nestedUrl =
        asString(output.url) ??
        asString(output.video_url) ??
        firstStringInArray(output.urls) ??
        firstStringInArray(output.video_urls);
      if (nestedUrl) {
        return nestedUrl;
      }
    }

    const result = asRecord(record.result);
    const firstVideo = firstRecordInArray(result?.videos);
    if (firstVideo) {
      const videoUrl =
        asString(firstVideo.url) ??
        firstStringInArray(firstVideo.url) ??
        asString(firstVideo.video_url) ??
        firstStringInArray(firstVideo.video_url);
      if (videoUrl) {
        return videoUrl;
      }
    }
  }

  return null;
}

function publicError(data: JsonRecord): string | null {
  const nested = pickNestedRecord(data);
  return (
    asString(data.message) ??
    asString(data.error) ??
    asString(nested?.message) ??
    asString(nested?.error)
  );
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json().catch(() => ({}))) as JsonRecord;
}

async function main() {
  loadEnvFile(envPath);

  const baseUrl = requiredEnv("APIMART_BASE_URL");
  const apiKey = requiredEnv("APIMART_API_KEY");
  const videoPath = process.env.VIDEO_API_PATH ?? "/v1/videos/generations";
  const statusPath = process.env.TASK_STATUS_API_PATH ?? "/v1/tasks";
  const model = process.env.REAL_VIDEO_MODEL ?? "doubao-seedance-1-5-pro";

  if (baseUrl === "mock") {
    throw new Error("APIMART_BASE_URL points to mock mode");
  }

  const submitUrl = new URL(videoPath, baseUrl).toString();
  const statusBasePath = statusPath.endsWith("/") ? statusPath.slice(0, -1) : statusPath;
  const taskIdArgIndex = process.argv.indexOf("--task-id");
  const taskIdArg = taskIdArgIndex >= 0 ? process.argv[taskIdArgIndex + 1] : null;
  const shouldDownload = process.argv.includes("--download");

  const body = {
    model,
    prompt:
      "A clean product demo storyboard animation: six labeled layers of an AI video workflow appear one by one on a neutral studio background, simple cards, smooth camera movement, no logos, no real people, no readable brand text.",
    image_urls: [],
    duration: 5,
    aspect_ratio: "16:9",
    resolution: "720p",
    audio: false
  };

  console.log("APIMART smoke test");
  console.log(`provider=apimart model=${model}`);
  console.log(`submit_endpoint=${videoPath}`);
  console.log("api_key=configured");

  let taskId = taskIdArg;

  if (!taskId) {
    const submitResponse = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    const submitData = await readJson(submitResponse);
    taskId = extractTaskId(submitData);

    if (!submitResponse.ok || !taskId) {
      throw new Error(`submit_failed status=${submitResponse.status} message=${publicError(submitData) ?? "unknown"}`);
    }

    console.log(`submit=ok task_id=${taskId}`);
  } else {
    console.log(`submit=skipped task_id=${taskId}`);
  }

  const statusUrl = new URL(`${statusBasePath}/${taskId}`, baseUrl).toString();
  const statusResponse = await fetch(statusUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const statusData = await readJson(statusResponse);

  if (!statusResponse.ok) {
    throw new Error(`status_failed status=${statusResponse.status} message=${publicError(statusData) ?? "unknown"}`);
  }

  const taskStatus = extractStatus(statusData);
  const resultUrl = extractResultUrl(statusData);
  console.log(`status=ok task_status=${taskStatus}`);
  console.log(`result_url=${resultUrl ? "available" : "not_ready"}`);

  if (shouldDownload) {
    if (taskStatus !== "completed" || !resultUrl) {
      throw new Error("download_requested_but_result_not_ready");
    }

    const outputDir = path.resolve(process.cwd(), "outputs", "real-video-smoke");
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${taskId}.mp4`);
    const videoResponse = await fetch(resultUrl);
    if (!videoResponse.ok || !videoResponse.body) {
      throw new Error(`download_failed status=${videoResponse.status}`);
    }
    const bytes = Buffer.from(await videoResponse.arrayBuffer());
    fs.writeFileSync(outputPath, bytes);
    console.log(`download=ok path=${path.relative(process.cwd(), outputPath)} bytes=${bytes.length}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`real-video-smoke failed: ${message}`);
  process.exit(1);
});
