import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputDir, readJson, toProjectPath, videoRunFiles, writeJson, type StoryboardFile, type StoryboardItem } from "./video-workflow-shared";

function run(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: "pipe"
  });
}

function ffprobeDuration(filePath: string) {
  const output = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
    { encoding: "utf8" }
  ).trim();
  return Number(output);
}

function formatSrtTime(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function textLength(value: string) {
  return Array.from(value.replace(/\s+/g, "")).length || 1;
}

function splitLongChunk(value: string, maxChars: number) {
  const chunks: string[] = [];
  let remaining = value.trim();
  while (Array.from(remaining).length > maxChars) {
    const chars = Array.from(remaining);
    const preferred = chars
      .slice(0, maxChars + 1)
      .map((char, index) => ({ char, index }))
      .reverse()
      .find((entry) => entry.index >= Math.floor(maxChars * 0.35) && /[，,；;、\s]/.test(entry.char));
    const cutAt = preferred ? preferred.index + 1 : maxChars;
    const chunk = chars.slice(0, cutAt).join("").trim();
    if (chunk) chunks.push(chunk);
    remaining = chars.slice(cutAt).join("").trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitNarration(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sentenceChunks = normalized.match(/[^。！？!?；;]+[。！？!?；;]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [normalized];
  const chunks = sentenceChunks.flatMap((chunk) => splitLongChunk(chunk, 26)).filter(Boolean);
  return chunks.length > 0 ? chunks : [normalized];
}

function wrapSubtitleText(text: string) {
  const chars = Array.from(text);
  if (chars.length <= 26) return text;
  const preferred = chars
    .slice(0, 27)
    .map((char, index) => ({ char, index }))
    .reverse()
    .find((entry) => entry.index >= 10 && /[，,；;、\s]/.test(entry.char));
  const cutAt = preferred ? preferred.index + 1 : Math.ceil(chars.length / 2);
  return `${chars.slice(0, cutAt).join("").trim()}\n${chars.slice(cutAt).join("").trim()}`;
}

interface SubtitleCue {
  index: number;
  order: number;
  start_seconds: number;
  end_seconds: number;
  text: string;
  image_path?: string;
}

function buildSubtitleCues(items: StoryboardItem[]) {
  const cues: SubtitleCue[] = [];
  let cueIndex = 1;

  for (const item of items) {
    const segmentStart = item.timeline_start_seconds ?? 0;
    const segmentDuration = item.audio_duration_seconds ?? item.duration_seconds;
    const chunks = splitNarration(item.narration_cn);
    const weights = chunks.map(textLength);
    const totalWeight = weights.reduce((total, value) => total + value, 0) || chunks.length;
    let localCursor = 0;

    chunks.forEach((chunk, chunkIndex) => {
      const isLast = chunkIndex === chunks.length - 1;
      const duration = isLast ? segmentDuration - localCursor : segmentDuration * (weights[chunkIndex] / totalWeight);
      const start = segmentStart + localCursor;
      const end = segmentStart + Math.min(segmentDuration, localCursor + duration);
      if (end > start) {
        cues.push({
          index: cueIndex,
          order: item.order,
          start_seconds: Number(start.toFixed(3)),
          end_seconds: Number(end.toFixed(3)),
          text: chunk
        });
        cueIndex += 1;
      }
      localCursor += duration;
    });
  }

  return cues;
}

function writeSrt(filePath: string, cues: SubtitleCue[]) {
  const lines = cues.flatMap((cue) => [
    String(cue.index),
    `${formatSrtTime(cue.start_seconds)} --> ${formatSrtTime(cue.end_seconds)}`,
    wrapSubtitleText(cue.text),
    ""
  ]);
  fs.writeFileSync(filePath, `${lines.join("\n").trimEnd()}\n`, "utf8");
}

function findSubtitleFont() {
  try {
    const fonts = execFileSync("magick", ["-list", "font"], { encoding: "utf8" });
    const fontNames = ["PingFang-SC-Semibold", "Hiragino-Sans-GB-W6", "Heiti-SC-Medium"];
    const fontName = fontNames.find((candidate) => fonts.includes(`Font: ${candidate}`));
    if (fontName) return fontName;
  } catch {
    // Fall back to system font files below.
  }
  const candidates = [
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function renderSubtitleImages(cues: SubtitleCue[], fontPath: string | undefined) {
  const imageDir = path.join(composeDir, "subtitle-images");
  fs.rmSync(imageDir, { recursive: true, force: true });
  fs.mkdirSync(imageDir, { recursive: true });
  const panelWidth = 1240;
  const panelHeight = 132;
  const textWidth = 1176;
  const textHeight = 108;

  return cues.map((cue) => {
    const imagePath = path.join(imageDir, `${String(cue.index).padStart(3, "0")}.png`);
    const textLayerPath = path.join(imageDir, `${String(cue.index).padStart(3, "0")}.text.png`);
    const args = [
      "-size",
      `${panelWidth}x${panelHeight}`,
      "xc:none",
      "-fill",
      "rgba(0,0,0,0.16)",
      "-draw",
      `roundrectangle 5,8 ${panelWidth - 6},${panelHeight - 1} 22,22`,
      "-fill",
      "rgba(36,50,74,0.72)",
      "-draw",
      `roundrectangle 0,0 ${panelWidth - 1},${panelHeight - 8} 20,20`,
      "-stroke",
      "rgba(255,255,255,0.18)",
      "-strokewidth",
      "1",
      "-fill",
      "none",
      "-draw",
      `roundrectangle 1,1 ${panelWidth - 2},${panelHeight - 9} 20,20`,
      "-stroke",
      "none",
      "-fill",
      "rgba(255,255,255,0.10)",
      "-draw",
      `roundrectangle 34,10 ${panelWidth - 35},12 2,2`,
      imagePath
    ];
    run("magick", args);

    const textArgs = [
      "-size",
      `${textWidth}x${textHeight}`,
      "-background",
      "none",
      "-fill",
      "#FFFFFF",
      "-gravity",
      "center",
      "-pointsize",
      "44",
      "-interline-spacing",
      "-4"
    ];
    if (fontPath) textArgs.push("-font", fontPath);
    textArgs.push(`caption:${wrapSubtitleText(cue.text)}`, textLayerPath);
    run("magick", textArgs);

    run("magick", [imagePath, textLayerPath, "-gravity", "center", "-composite", imagePath]);
    fs.unlinkSync(textLayerPath);
    return {
      ...cue,
      image_path: imagePath
    };
  });
}

const storyboard = readJson<StoryboardFile>(videoRunFiles.storyboard);
const composeDir = path.join(outputDir, "compose");
const audioDir = path.join(outputDir, "audio");
fs.mkdirSync(composeDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });

const imageConcatFile = path.join(composeDir, "images.concat.txt");
const audioConcatFile = path.join(composeDir, "audio.concat.txt");
const tempVideo = path.join(composeDir, "silent-video.mp4");
const tempAudio = path.join(composeDir, "combined-audio.mp3");
const baseVideoWithAudio = path.join(composeDir, "mock-workflow-video.mp4");
const finalVideo = path.join(outputDir, "final-video.mp4");
const subtitlesSrt = path.join(process.cwd(), videoRunFiles.subtitlesSrt);
const realProviderImageDir = path.join(outputDir, "real-provider-images");
const realProviderImagePaths = storyboard.items.map((item) => path.join(realProviderImageDir, `${String(item.order).padStart(2, "0")}.png`));
const requestedImageSource = process.env.VIDEO_IMAGE_SOURCE?.trim();
const providerImagesAvailable = realProviderImagePaths.every((filePath) => fs.existsSync(filePath));
const useProviderImages = requestedImageSource === "asset" ? false : providerImagesAvailable;
const imageSourceMode = useProviderImages ? "provider" : "asset";

const imageConcatLines: string[] = [];
const audioConcatLines: string[] = [];
const generatedAudio: string[] = [];
const audioTimeline: Array<{ order: number; start_seconds: number; duration_seconds: number; audio_path: string; source: string }> = [];
const selectedImageAssets: string[] = [];
const syncedStoryboardItems: StoryboardFile["items"] = [];
let cursor = 0;
let lastImagePath = "";

storyboard.items.forEach((item, index) => {
  const realImagePath = path.join(realProviderImageDir, `${String(item.order).padStart(2, "0")}.png`);
  const imagePath = useProviderImages ? realImagePath : path.join(process.cwd(), item.image_asset);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Missing storyboard image: ${item.image_asset}`);
  }
  lastImagePath = imagePath;
  selectedImageAssets.push(toProjectPath(imagePath));

  const audioPath = path.join(process.cwd(), item.audio_manifest_path);
  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  let audioSource = "existing_audio";
  if (!fs.existsSync(audioPath)) {
    const frequency = String(360 + index * 70);
    run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:duration=${item.duration_seconds}:sample_rate=44100`,
      "-af",
      "volume=0.018",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      audioPath
    ]);
    audioSource = "mock_generated_by_compose";
  }
  const audioDuration = Number(ffprobeDuration(audioPath).toFixed(2));
  imageConcatLines.push(`file '${imagePath.replaceAll("'", "'\\''")}'`);
  imageConcatLines.push(`duration ${audioDuration}`);
  generatedAudio.push(toProjectPath(audioPath));
  audioConcatLines.push(`file '${audioPath.replaceAll("'", "'\\''")}'`);
  audioTimeline.push({
    order: item.order,
    start_seconds: Number(cursor.toFixed(2)),
    duration_seconds: audioDuration,
    audio_path: toProjectPath(audioPath),
    source: audioSource
  });
  syncedStoryboardItems.push({
    ...item,
    duration_seconds: audioDuration,
    audio_duration_seconds: audioDuration,
    timeline_start_seconds: Number(cursor.toFixed(2)),
    audio_manifest_path: toProjectPath(audioPath)
  });
  cursor += audioDuration;
});

imageConcatLines.push(`file '${lastImagePath.replaceAll("'", "'\\''")}'`);

fs.writeFileSync(imageConcatFile, `${imageConcatLines.join("\n")}\n`);
fs.writeFileSync(audioConcatFile, `${audioConcatLines.join("\n")}\n`);
writeJson(path.join(process.cwd(), videoRunFiles.storyboard), {
  ...storyboard,
  total_duration_seconds: Number(cursor.toFixed(2)),
  items: syncedStoryboardItems
});
const subtitleCues = buildSubtitleCues(syncedStoryboardItems);
writeSrt(subtitlesSrt, subtitleCues);
const subtitleFontPath = findSubtitleFont();
const renderedSubtitleCues = renderSubtitleImages(subtitleCues, subtitleFontPath);

run("ffmpeg", [
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  imageConcatFile,
  "-vf",
  "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
  "-r",
  "24",
  tempVideo
]);

run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", audioConcatFile, "-c:a", "libmp3lame", "-b:a", "128k", tempAudio]);

run("ffmpeg", ["-y", "-i", tempVideo, "-i", tempAudio, "-c:v", "copy", "-c:a", "aac", "-shortest", baseVideoWithAudio]);
const subtitleInputs = renderedSubtitleCues.flatMap((cue) => ["-loop", "1", "-i", cue.image_path ?? ""]);
const overlayChain = renderedSubtitleCues.reduce((parts, cue, index) => {
  const inputLabel = index === 0 ? "[0:v]" : `[v${index}]`;
  const outputLabel = index === renderedSubtitleCues.length - 1 ? "[vout]" : `[v${index + 1}]`;
  const start = cue.start_seconds.toFixed(3);
  const end = cue.end_seconds.toFixed(3);
  parts.push(`${inputLabel}[${index + 1}:v]overlay=x=(W-w)/2:y=H-h-24:enable='between(t,${start},${end})':eof_action=pass${outputLabel}`);
  return parts;
}, [] as string[]);
run("ffmpeg", [
  "-y",
  "-i",
  baseVideoWithAudio,
  ...subtitleInputs,
  "-filter_complex",
  overlayChain.join(";"),
  "-map",
  "[vout]",
  "-map",
  "0:a:0",
  "-c:v",
  "libx264",
  "-preset",
  "fast",
  "-crf",
  "20",
  "-c:a",
  "copy",
  "-t",
  cursor.toFixed(3),
  "-movflags",
  "+faststart",
  finalVideo
]);

const duration = ffprobeDuration(finalVideo);
for (const tempFile of [imageConcatFile, audioConcatFile]) {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}
const manifest = {
  mock_only: !useProviderImages,
  redacted: true,
  final_video: {
    path: toProjectPath(finalVideo),
    duration_seconds: Number(duration.toFixed(2)),
    target_duration_seconds: storyboard.target_duration_seconds,
    resolution: "1280x720",
    audio: true
  },
  source: useProviderImages ? "real_provider_images" : "image_assets",
  image_source_mode: imageSourceMode,
  uses_provider_video: false,
  real_provider_images: useProviderImages ? realProviderImagePaths.map(toProjectPath) : [],
  storyboard_items: storyboard.items.length,
  image_assets: selectedImageAssets,
  audio_assets: generatedAudio,
  audio_timeline: audioTimeline,
  subtitle_assets: {
    srt_path: toProjectPath(subtitlesSrt),
    source: "storyboard.narration_cn",
    aligned_to_audio_timeline: true,
    burned_in: true,
    render_method: "imagemagick_png_overlay",
    style: {
      panel_size: "1240x132",
      panel_margin_x: 24,
      panel_margin_bottom: 24,
      font_family: subtitleFontPath ? path.basename(subtitleFontPath) : "imagemagick-default",
      text_fill: "#FFFFFF",
      text_point_size: 44,
      text_shadow: false,
      text_stroke: false
    },
    image_paths: renderedSubtitleCues.map((cue) => toProjectPath(cue.image_path ?? "")),
    cue_count: renderedSubtitleCues.length
  },
  compose_tool: "ffmpeg",
  note: "Video is stitched from three image assets only. Image segment durations and burned-in subtitles are aligned to audio durations. No provider video URL, secret, env content, or absolute path is written."
};

writeJson(path.join(process.cwd(), videoRunFiles.finalVideoManifest), manifest);

console.log("video:compose completed");
console.log(`final_video=${manifest.final_video.path}`);
console.log(`duration_seconds=${manifest.final_video.duration_seconds}`);
