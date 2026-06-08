import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { existsProjectPath, outputDir, readJson, videoRunFiles, writeJson, type StoryboardFile } from "./video-workflow-shared";

interface CheckItem {
  name: string;
  ok: boolean;
  detail: string;
}

function item(name: string, ok: boolean, detail: string): CheckItem {
  return { name, ok, detail };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function near(left: number, right: number, tolerance = 0.75) {
  return Math.abs(left - right) <= tolerance;
}

function run(command: string, args: string[]) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function normalizeCompareImage(inputPath: string, outputPath: string) {
  execFileSync(
    "magick",
    [
      inputPath,
      "-auto-orient",
      "-resize",
      "1280x720!",
      "-crop",
      "1280x500+0+0",
      "+repage",
      "-colorspace",
      "sRGB",
      `PNG24:${outputPath}`
    ],
    { cwd: process.cwd(), stdio: "pipe" }
  );
}

function commandOutput(error: unknown) {
  const value = error as { stdout?: string | Buffer; stderr?: string | Buffer };
  return `${value.stderr ?? ""}${value.stdout ?? ""}`;
}

function compareRmse(leftPath: string, rightPath: string) {
  try {
    run("magick", ["compare", "-metric", "RMSE", leftPath, rightPath, "null:"]);
    return 0;
  } catch (error) {
    const output = commandOutput(error);
    const match = output.match(/\(([^)]+)\)/);
    if (!match) throw new Error(`compare_failed ${output.trim().slice(0, 120)}`);
    return Number(match[1]);
  }
}

function checkVisibleImageSequence(
  videoPath: string,
  imagePaths: string[],
  audioTimeline: Array<{ order?: number; start_seconds?: number; duration_seconds?: number; audio_path?: string }>
) {
  const visualDir = path.join(outputDir, "visual-check");
  fs.rmSync(visualDir, { recursive: true, force: true });
  fs.mkdirSync(visualDir, { recursive: true });

  const referenceCrops = imagePaths.map((imagePath, index) => {
    const cropPath = path.join(visualDir, `ref-${String(index + 1).padStart(2, "0")}.png`);
    normalizeCompareImage(path.join(process.cwd(), imagePath), cropPath);
    return { label: String(index + 1).padStart(2, "0"), cropPath };
  });

  const matches = audioTimeline.map((entry, index) => {
    const expected = String(entry.order ?? index + 1).padStart(2, "0");
    const start = entry.start_seconds ?? 0;
    const duration = entry.duration_seconds ?? 0;
    const sampleTime = start + duration / 2;
    const framePath = path.join(visualDir, `frame-${expected}.png`);
    const frameCropPath = path.join(visualDir, `frame-${expected}-crop.png`);
    run("ffmpeg", ["-y", "-ss", sampleTime.toFixed(3), "-i", path.join(process.cwd(), videoPath), "-frames:v", "1", framePath]);
    normalizeCompareImage(framePath, frameCropPath);
    const scores = referenceCrops
      .map((reference) => ({ label: reference.label, score: compareRmse(frameCropPath, reference.cropPath) }))
      .sort((left, right) => left.score - right.score);
    const best = scores[0];
    return {
      expected,
      actual: best?.label ?? "missing",
      score: best?.score ?? Number.POSITIVE_INFINITY
    };
  });

  const ok = matches.every((match) => match.expected === match.actual && match.score < 0.2);
  return {
    ok,
    detail: matches.map((match) => `${match.expected}->${match.actual}(${match.score.toFixed(3)})`).join(",")
  };
}

function normalizeSubtitleText(value: string) {
  return value.replace(/\s+/g, "");
}

function parseSrtTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, ms] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(ms) / 1000;
}

function parseSrt(text: string) {
  const blocks = text.trim().split(/\r?\n\r?\n+/).filter(Boolean);
  return blocks.flatMap((block) => {
    const lines = block.split(/\r?\n/);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) return [];
    const [startRaw, endRaw] = lines[timingIndex].split("-->").map((item) => item.trim());
    const start = parseSrtTime(startRaw);
    const end = parseSrtTime(endRaw);
    if (start === null || end === null) return [];
    return [{ start, end, text: lines.slice(timingIndex + 1).join("") }];
  });
}

type AudioMode = "real_tts_completed" | "mock_fallback";

interface RealAudioManifest {
  ok?: boolean;
  provider?: string;
  media_type?: string;
  mode?: AudioMode;
  retry_policy?: { hard_cap?: number };
  timeline?: {
    aligned_to_audio_duration?: boolean;
    total_duration_seconds?: number;
    items?: Array<{ order?: number; start_seconds?: number; duration_seconds?: number; audio_path?: string }>;
  };
  audio?: Array<{ order?: number; status?: AudioMode; path?: string; duration_seconds?: number }>;
}

interface FinalVideoManifest {
  final_video?: { path?: string; duration_seconds?: number };
  real_provider_images?: string[];
  uses_provider_video?: boolean;
  storyboard_items?: number;
  audio_timeline?: Array<{ order?: number; start_seconds?: number; duration_seconds?: number; audio_path?: string }>;
  subtitle_assets?: {
    srt_path?: string;
    aligned_to_audio_timeline?: boolean;
    burned_in?: boolean;
    render_method?: string;
    image_paths?: string[];
    cue_count?: number;
  };
}

interface MediaManifest {
  media_tasks?: Array<{ media_id?: string; task_status?: string }>;
  failure_recovery?: {
    media_id?: string;
    forced_failure?: boolean;
    auto_retry?: boolean;
    requires_model_action?: boolean;
    retried?: boolean;
    final_status?: string;
  };
}

const checks: CheckItem[] = [];

for (const required of [
  videoRunFiles.request,
  videoRunFiles.researchNotes,
  videoRunFiles.storyboard,
  videoRunFiles.mediaPlan,
  videoRunFiles.taskRun,
  videoRunFiles.mediaManifest,
  videoRunFiles.subagentReview
]) {
  checks.push(item(`required:${required}`, existsProjectPath(required), existsProjectPath(required) ? "exists" : "missing"));
}

let storyboard: StoryboardFile | null = null;
try {
  storyboard = readJson<StoryboardFile>(videoRunFiles.storyboard);
  checks.push(item("storyboard:parse", true, "valid json"));
} catch (error) {
  checks.push(item("storyboard:parse", false, error instanceof Error ? error.message : String(error)));
}

if (storyboard) {
  const expectedTheme = process.env.VIDEO_TITLE ?? "快来看2026世界杯吧";
  checks.push(item("storyboard:theme", storyboard.theme === expectedTheme, storyboard.theme));
  checks.push(item("storyboard:item_count", storyboard.items.length === 3, String(storyboard.items.length)));
  checks.push(item("storyboard:duration", storyboard.total_duration_seconds >= 28 && storyboard.total_duration_seconds <= 34, String(storyboard.total_duration_seconds)));
  for (const storyboardItem of storyboard.items) {
    checks.push(item(`storyboard:image:${storyboardItem.order}`, existsProjectPath(storyboardItem.image_asset), storyboardItem.image_asset));
    checks.push(item(`storyboard:audio:${storyboardItem.order}`, existsProjectPath(storyboardItem.audio_manifest_path), storyboardItem.audio_manifest_path));
  }
}

if (existsProjectPath(videoRunFiles.mediaManifest)) {
  try {
    const mediaManifest = readJson<MediaManifest>(videoRunFiles.mediaManifest);
    const recovery = mediaManifest.failure_recovery;
    checks.push(item("media005:failure_injected", recovery?.media_id === "MEDIA_005" && recovery?.forced_failure === true, String(recovery?.media_id ?? "missing")));
    checks.push(item("media005:auto_retry_disabled", recovery?.auto_retry === false, String(recovery?.auto_retry)));
    checks.push(item("media005:explicit_recovery", recovery?.retried === true, `retried=${recovery?.retried}`));
    checks.push(item("media005:final_status", recovery?.final_status === "completed", String(recovery?.final_status)));
  } catch (error) {
    checks.push(item("media005:failure_recovery", false, error instanceof Error ? error.message : String(error)));
  }
}

if (process.env.REQUIRE_RESEARCH === "1") {
  try {
    const researchText = await import("node:fs").then((fs) => fs.readFileSync(path.join(process.cwd(), videoRunFiles.researchNotes), "utf8"));
    const hasSource = /https?:\/\/|官方|FIFA|世界杯|source|来源/i.test(researchText);
    const isPlaceholder = researchText.includes("待模型联网检索后补充") || researchText.includes("sources: []");
    checks.push(item("research:latest_sources", hasSource && !isPlaceholder, hasSource && !isPlaceholder ? "present" : "missing_or_placeholder"));
  } catch (error) {
    checks.push(item("research:latest_sources", false, error instanceof Error ? error.message : String(error)));
  }
}

if (existsProjectPath(videoRunFiles.finalVideoManifest)) {
  try {
    const finalManifest = readJson<FinalVideoManifest>(videoRunFiles.finalVideoManifest);
    const videoPath = finalManifest.final_video?.path ?? "";
    const duration = finalManifest.final_video?.duration_seconds ?? 0;
    checks.push(item("final_video:path", Boolean(videoPath) && existsProjectPath(videoPath), videoPath || "missing"));
    checks.push(item("final_video:duration", duration >= 28 && duration <= 34, String(duration)));
    checks.push(item("final_video:image_count", finalManifest.storyboard_items === 3, String(finalManifest.storyboard_items ?? "missing")));
    checks.push(item("final_video:no_provider_video", finalManifest.uses_provider_video === false, String(finalManifest.uses_provider_video)));
    const realImages = finalManifest.real_provider_images ?? [];
    checks.push(item("real_provider:images", process.env.REQUIRE_REAL_IMAGES === "1" ? realImages.length === 3 : true, String(realImages.length)));
    const audioTimeline = finalManifest.audio_timeline ?? [];
    const audioTimelineTotal = Number(sum(audioTimeline.map((entry) => entry.duration_seconds ?? 0)).toFixed(2));
    checks.push(item("final_video:audio_timeline_count", audioTimeline.length === 3, String(audioTimeline.length)));
    checks.push(item("final_video:audio_timeline_paths", audioTimeline.every((entry) => Boolean(entry.audio_path) && existsProjectPath(String(entry.audio_path))), String(audioTimeline.length)));
    checks.push(item("final_video:duration_matches_audio", duration > 0 && near(duration, audioTimelineTotal), `${duration} vs ${audioTimelineTotal}`));
    if (process.env.REQUIRE_REAL_IMAGES === "1" && videoPath && existsProjectPath(videoPath) && realImages.length === 3 && audioTimeline.length === 3) {
      try {
        const visibleSequence = checkVisibleImageSequence(videoPath, realImages, audioTimeline);
        checks.push(item("final_video:visible_image_sequence", visibleSequence.ok, visibleSequence.detail));
      } catch (error) {
        checks.push(item("final_video:visible_image_sequence", false, error instanceof Error ? error.message : String(error)));
      }
    }
    const subtitles = finalManifest.subtitle_assets;
    const srtPath = subtitles?.srt_path ?? "";
    checks.push(item("final_video:subtitles_srt", Boolean(srtPath) && existsProjectPath(srtPath), srtPath || "missing"));
    checks.push(item("final_video:subtitles_burned_in", subtitles?.burned_in === true, String(subtitles?.burned_in)));
    checks.push(item("final_video:subtitle_render_method", subtitles?.render_method === "imagemagick_png_overlay", String(subtitles?.render_method)));
    checks.push(item("final_video:subtitles_aligned", subtitles?.aligned_to_audio_timeline === true, String(subtitles?.aligned_to_audio_timeline)));
    const subtitleImagePaths = subtitles?.image_paths ?? [];
    checks.push(item("final_video:subtitle_image_count", subtitleImagePaths.length === (subtitles?.cue_count ?? -1) && subtitleImagePaths.length >= 3, `${subtitleImagePaths.length} vs ${subtitles?.cue_count ?? "missing"}`));
    checks.push(item("final_video:subtitle_image_paths", subtitleImagePaths.every((entry) => Boolean(entry) && existsProjectPath(entry)), String(subtitleImagePaths.length)));
    if (srtPath && existsProjectPath(srtPath)) {
      const srtText = fs.readFileSync(path.join(process.cwd(), srtPath), "utf8");
      const cues = parseSrt(srtText);
      const cueText = normalizeSubtitleText(cues.map((cue) => cue.text).join(""));
      const storyboardText = normalizeSubtitleText((storyboard?.items ?? []).map((entry) => entry.narration_cn).join(""));
      const firstCueStart = cues[0]?.start ?? -1;
      const lastCueEnd = cues.at(-1)?.end ?? 0;
      checks.push(item("final_video:subtitle_cue_count", cues.length === (subtitles?.cue_count ?? -1) && cues.length >= 3, `${cues.length} vs ${subtitles?.cue_count ?? "missing"}`));
      checks.push(item("final_video:subtitle_text_matches_storyboard", cueText === storyboardText, `${cueText.length} vs ${storyboardText.length}`));
      checks.push(item("final_video:subtitle_starts_at_zero", firstCueStart >= 0 && firstCueStart <= 0.1, String(firstCueStart)));
      checks.push(item("final_video:subtitle_duration_matches_video", duration > 0 && near(duration, lastCueEnd), `${duration} vs ${Number(lastCueEnd.toFixed(2))}`));
    }
  } catch (error) {
    checks.push(item("final_video:manifest", false, error instanceof Error ? error.message : String(error)));
  }
} else {
  checks.push(item("final_video:manifest", false, "missing"));
}

if (process.env.REQUIRE_REAL_AUDIO === "1") {
  checks.push(item("real_audio:manifest", existsProjectPath(videoRunFiles.realAudioManifest), videoRunFiles.realAudioManifest));
  if (existsProjectPath(videoRunFiles.realAudioManifest)) {
    const realAudio = readJson<RealAudioManifest>(videoRunFiles.realAudioManifest);
    const audioItems = realAudio.audio ?? [];
    const timelineItems = realAudio.timeline?.items ?? [];
    const audioTotal = Number(sum(audioItems.map((audio) => audio.duration_seconds ?? 0)).toFixed(2));
    const timelineTotal = Number(realAudio.timeline?.total_duration_seconds ?? 0);
    const validMode = realAudio.mode === "real_tts_completed" || realAudio.mode === "mock_fallback";
    checks.push(item("real_audio:ok", realAudio.ok === true, String(realAudio.ok)));
    checks.push(item("real_audio:provider", realAudio.provider === "elevenlabs", String(realAudio.provider)));
    checks.push(item("real_audio:type", realAudio.media_type === "audio", String(realAudio.media_type)));
    checks.push(item("real_audio:mode", validMode, String(realAudio.mode)));
    checks.push(item("real_audio:retry_cap", (realAudio.retry_policy?.hard_cap ?? 999) <= 30, String(realAudio.retry_policy?.hard_cap ?? "missing")));
    checks.push(item("real_audio:item_count", audioItems.length === (storyboard?.items.length ?? 3), String(audioItems.length)));
    checks.push(item("real_audio:paths", audioItems.every((audio) => Boolean(audio.path) && existsProjectPath(String(audio.path))), String(audioItems.length)));
    checks.push(item("real_audio:durations", audioItems.every((audio) => (audio.duration_seconds ?? 0) > 0), String(audioTotal)));
    checks.push(item("real_audio:timeline_aligned", realAudio.timeline?.aligned_to_audio_duration === true, String(realAudio.timeline?.aligned_to_audio_duration)));
    checks.push(item("real_audio:timeline_count", timelineItems.length === audioItems.length, `${timelineItems.length} vs ${audioItems.length}`));
    checks.push(item("real_audio:timeline_total", timelineTotal > 0 && near(timelineTotal, audioTotal), `${timelineTotal} vs ${audioTotal}`));
  }
}

if (process.env.REQUIRE_REAL_IMAGES === "1") {
  checks.push(item("real_provider:manifest", existsProjectPath(videoRunFiles.realProviderManifest), videoRunFiles.realProviderManifest));
  if (existsProjectPath(videoRunFiles.realProviderManifest)) {
    const realManifest = readJson<{ ok?: boolean; media_type?: string; images?: Array<{ ok?: boolean; path?: string | null }> }>(videoRunFiles.realProviderManifest);
    checks.push(item("real_provider:type", realManifest.media_type === "image", String(realManifest.media_type)));
    checks.push(item("real_provider:image_count", (realManifest.images ?? []).filter((image) => image.ok && image.path).length === 3, String((realManifest.images ?? []).filter((image) => image.ok && image.path).length)));
  }
}

const ok = checks.every((check) => check.ok);
const report = {
  ok,
  checked_at: new Date().toISOString(),
  checks
};

writeJson(path.join(process.cwd(), videoRunFiles.qualityCheck), report);

console.log("video:check");
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name} ${check.detail}`);
}

if (!ok) {
  process.exit(1);
}
