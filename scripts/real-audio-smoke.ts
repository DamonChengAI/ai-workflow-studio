import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputDir, readJson, sanitizeText, toProjectPath, videoRunFiles, writeJson, type StoryboardFile, type StoryboardItem } from "./video-workflow-shared";

type AudioStatus = "real_tts_completed" | "mock_fallback";

const elevenLabsBaseUrl = "https://api.elevenlabs.io/v1";
const homeDir = process.env.HOME ?? "";
const configuredFallbacks = (process.env.REAL_MEDIA_ENV_FALLBACKS ?? "")
  .split(path.delimiter)
  .map((item) => item.trim())
  .filter(Boolean);

const envCandidates = [
  path.resolve(process.cwd(), ".env.local"),
  process.env.REAL_MEDIA_ENV_FILE ? path.resolve(process.env.REAL_MEDIA_ENV_FILE) : null,
  ...configuredFallbacks.map((item) => path.resolve(item)),
  homeDir ? path.join(homeDir, "Desktop", "ship", "youtube_long", ".env") : null
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

function numberFromEnv(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function ffprobeDuration(filePath: string) {
  const output = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
    { encoding: "utf8" }
  ).trim();
  return Number(output);
}

function run(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: "pipe"
  });
}

async function parseResponseJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

async function textToSpeech(item: StoryboardItem, previousText: string | null, nextText: string | null) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";
  if (!apiKey || !voiceId) {
    throw new Error("ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is not configured");
  }

  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT?.trim() || "mp3_44100_128";
  const body: Record<string, unknown> = {
    text: item.narration_cn,
    model_id: modelId,
    voice_settings: {
      stability: 0.75,
      similarity_boost: 0.75,
      style: 0.4,
      speed: 1.0,
      use_speaker_boost: true
    }
  };

  if (!modelId.startsWith("eleven_v3")) {
    if (previousText) body.previous_text = previousText;
    if (nextText) body.next_text = nextText;
  }

  const response = await fetch(`${elevenLabsBaseUrl}/text-to-speech/${voiceId}?output_format=${outputFormat}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const data = await parseResponseJson(response);
    const message = typeof data.detail === "string" ? data.detail : typeof data.message === "string" ? data.message : `status=${response.status}`;
    throw new Error(`ElevenLabs TTS failed: ${sanitizeText(message)}`);
  }

  return {
    audioBuffer: Buffer.from(await response.arrayBuffer()),
    modelId,
    characterCount: Number(response.headers.get("x-character-count") ?? item.narration_cn.length)
  };
}

function ensureMp3Path(filePath: string) {
  return filePath.replace(/\.(wav|aac|m4a)$/i, ".mp3");
}

function writeRealAudio(buffer: Buffer, outputPath: string, minDurationSeconds: number) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.raw.mp3`);
  fs.writeFileSync(tempPath, buffer);
  try {
    const rawDuration = ffprobeDuration(tempPath);
    const padDuration = Math.max(0, minDurationSeconds - rawDuration);
    if (padDuration > 0.05) {
      run("ffmpeg", ["-y", "-i", tempPath, "-af", `apad=pad_dur=${padDuration.toFixed(3)}`, "-c:a", "libmp3lame", "-b:a", "128k", outputPath]);
    } else {
      fs.copyFileSync(tempPath, outputPath);
    }
    return ffprobeDuration(outputPath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

function writeMockAudio(outputPath: string, durationSeconds: number, index: number) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${360 + index * 70}:duration=${durationSeconds}:sample_rate=44100`,
    "-af",
    "volume=0.018",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    outputPath
  ]);
  return ffprobeDuration(outputPath);
}

function updateStoryboardTimeline(storyboard: StoryboardFile, durations: Map<number, number>) {
  let cursor = 0;
  const nextItems = storyboard.items.map((item) => {
    const duration = Number((durations.get(item.order) ?? item.duration_seconds).toFixed(2));
    const updated = {
      ...item,
      audio_manifest_path: ensureMp3Path(item.audio_manifest_path),
      duration_seconds: duration,
      audio_duration_seconds: duration,
      timeline_start_seconds: Number(cursor.toFixed(2))
    };
    cursor += duration;
    return updated;
  });
  return {
    ...storyboard,
    total_duration_seconds: Number(cursor.toFixed(2)),
    items: nextItems
  };
}

async function main() {
  const loadedEnvFiles = envCandidates.filter((candidate) => loadEnvFile(candidate));
  const storyboard = readJson<StoryboardFile>(videoRunFiles.storyboard);
  const manifestPath = path.join(process.cwd(), videoRunFiles.realAudioManifest);
  const maxRetries = numberFromEnv("REAL_AUDIO_MAX_RETRIES", 1, 30);
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT?.trim() || "mp3_44100_128";
  const audioResults: Array<Record<string, unknown>> = [];
  const attempts: Array<Record<string, unknown>> = [];
  const durations = new Map<number, number>();

  for (const [index, item] of storyboard.items.entries()) {
    const outputPath = path.join(process.cwd(), ensureMp3Path(item.audio_manifest_path));
    const previousText = storyboard.items[index - 1]?.narration_cn ?? null;
    const nextText = storyboard.items[index + 1]?.narration_cn ?? null;
    const targetDuration = item.duration_seconds || 10;
    let completed = false;
    let fallbackReason = "real_tts_not_attempted";
    let modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";
    let characterCount = item.narration_cn.length;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const result = await textToSpeech(item, previousText, nextText);
        modelId = result.modelId;
        characterCount = result.characterCount;
        const duration = writeRealAudio(result.audioBuffer, outputPath, targetDuration);
        durations.set(item.order, duration);
        audioResults.push({
          order: item.order,
          title: item.title,
          status: "real_tts_completed" satisfies AudioStatus,
          path: toProjectPath(outputPath),
          duration_seconds: Number(duration.toFixed(2)),
          source_text_chars: item.narration_cn.length,
          character_count: characterCount,
          provider: "elevenlabs",
          model: modelId,
          fallback: false,
          attempts: attempt
        });
        attempts.push({ order: item.order, phase: "submit", attempt, ok: true, provider: "elevenlabs", model: modelId });
        completed = true;
        break;
      } catch (error) {
        fallbackReason = sanitizeText(error instanceof Error ? error.message : String(error));
        attempts.push({ order: item.order, phase: "submit", attempt, ok: false, error: fallbackReason });
      }
    }

    if (!completed) {
      const duration = writeMockAudio(outputPath, targetDuration, index);
      durations.set(item.order, duration);
      audioResults.push({
        order: item.order,
        title: item.title,
        status: "mock_fallback" satisfies AudioStatus,
        path: toProjectPath(outputPath),
        duration_seconds: Number(duration.toFixed(2)),
        source_text_chars: item.narration_cn.length,
        character_count: characterCount,
        provider: "mock-audio",
        model: "ffmpeg-sine-fallback",
        fallback: true,
        fallback_reason: fallbackReason,
        attempts: maxRetries
      });
      attempts.push({ order: item.order, phase: "fallback", ok: true, provider: "mock-audio", reason: fallbackReason });
    }
  }

  const updatedStoryboard = updateStoryboardTimeline(storyboard, durations);
  writeJson(path.join(process.cwd(), videoRunFiles.storyboard), updatedStoryboard);

  const realCount = audioResults.filter((item) => item.status === "real_tts_completed").length;
  const fallbackCount = audioResults.filter((item) => item.status === "mock_fallback").length;
  const ok = audioResults.every((item) => typeof item.path === "string" && fs.existsSync(path.join(process.cwd(), String(item.path))));

  writeJson(manifestPath, {
    ok,
    provider: "elevenlabs",
    media_type: "audio",
    mode: fallbackCount === 0 ? "real_tts_completed" : "mock_fallback",
    model: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
    output_format: outputFormat,
    loaded_env_files: loadedEnvFiles.map((file) => path.basename(file)),
    retry_policy: {
      max_retries: maxRetries,
      hard_cap: 30,
      failure_does_not_block_main_flow: true
    },
    timeline: {
      aligned_to_audio_duration: true,
      total_duration_seconds: updatedStoryboard.total_duration_seconds,
      items: updatedStoryboard.items.map((item) => ({
        order: item.order,
        start_seconds: item.timeline_start_seconds,
        duration_seconds: item.duration_seconds,
        audio_path: item.audio_manifest_path
      }))
    },
    audio: audioResults,
    attempts
  });

  console.log("real-audio:smoke completed");
  console.log("provider=elevenlabs");
  console.log(`mode=${fallbackCount === 0 ? "real_tts_completed" : "mock_fallback"}`);
  console.log(`real_tts_completed=${realCount}/${audioResults.length}`);
  console.log(`mock_fallback=${fallbackCount}/${audioResults.length}`);
}

main().catch((error) => {
  const message = sanitizeText(error instanceof Error ? error.message : String(error));
  console.error(`real-audio:smoke failed before fallback: ${message}`);
  process.exit(1);
});
