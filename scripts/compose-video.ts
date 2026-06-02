import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputDir, readJson, toProjectPath, videoRunFiles, writeJson, type StoryboardFile } from "./video-workflow-shared";

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

const storyboard = readJson<StoryboardFile>(videoRunFiles.storyboard);
const composeDir = path.join(outputDir, "compose");
const audioDir = path.join(outputDir, "audio");
fs.mkdirSync(composeDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });

const imageConcatFile = path.join(composeDir, "images.concat.txt");
const audioConcatFile = path.join(composeDir, "audio.concat.txt");
const tempVideo = path.join(composeDir, "silent-video.mp4");
const tempAudio = path.join(composeDir, "combined-audio.wav");
const baseVideoWithAudio = path.join(composeDir, "mock-workflow-video.mp4");
const finalVideo = path.join(outputDir, "final-video.mp4");
const realProviderImageDir = path.join(outputDir, "real-provider-images");

const imageConcatLines: string[] = [];
const audioConcatLines: string[] = [];
const generatedAudio: string[] = [];

storyboard.items.forEach((item, index) => {
  const realImagePath = path.join(realProviderImageDir, `${String(item.order).padStart(2, "0")}.png`);
  const imagePath = fs.existsSync(realImagePath) ? realImagePath : path.join(process.cwd(), item.image_asset);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Missing storyboard image: ${item.image_asset}`);
  }

  imageConcatLines.push(`file '${imagePath.replaceAll("'", "'\\''")}'`);
  imageConcatLines.push(`duration ${item.duration_seconds}`);

  const audioPath = path.join(process.cwd(), item.audio_manifest_path);
  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  const frequency = String(360 + index * 70);
  run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:duration=${item.duration_seconds}:sample_rate=44100`,
    "-af",
    "volume=0.018",
    audioPath
  ]);
  generatedAudio.push(toProjectPath(audioPath));
  audioConcatLines.push(`file '${audioPath.replaceAll("'", "'\\''")}'`);
});

const lastImage = path.join(process.cwd(), storyboard.items.at(-1)?.image_asset ?? "");
imageConcatLines.push(`file '${lastImage.replaceAll("'", "'\\''")}'`);

fs.writeFileSync(imageConcatFile, `${imageConcatLines.join("\n")}\n`);
fs.writeFileSync(audioConcatFile, `${audioConcatLines.join("\n")}\n`);

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

run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", audioConcatFile, "-c", "copy", tempAudio]);

run("ffmpeg", ["-y", "-i", tempVideo, "-i", tempAudio, "-c:v", "copy", "-c:a", "aac", "-shortest", baseVideoWithAudio]);
fs.copyFileSync(baseVideoWithAudio, finalVideo);

const duration = ffprobeDuration(finalVideo);
for (const tempFile of [imageConcatFile, audioConcatFile]) {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}
const manifest = {
  mock_only: !storyboard.items.every((item) => fs.existsSync(path.join(realProviderImageDir, `${String(item.order).padStart(2, "0")}.png`))),
  redacted: true,
  final_video: {
    path: toProjectPath(finalVideo),
    duration_seconds: Number(duration.toFixed(2)),
    target_duration_seconds: storyboard.target_duration_seconds,
    resolution: "1280x720",
    audio: true
  },
  source: storyboard.items.every((item) => fs.existsSync(path.join(realProviderImageDir, `${String(item.order).padStart(2, "0")}.png`)))
    ? "real_provider_images"
    : "image_assets_with_mock_fallback",
  uses_provider_video: false,
  real_provider_images: storyboard.items
    .map((item) => path.join(realProviderImageDir, `${String(item.order).padStart(2, "0")}.png`))
    .filter((filePath) => fs.existsSync(filePath))
    .map(toProjectPath),
  storyboard_items: storyboard.items.length,
  image_assets: storyboard.items.map((item) => {
    const realImagePath = path.join(realProviderImageDir, `${String(item.order).padStart(2, "0")}.png`);
    return fs.existsSync(realImagePath) ? toProjectPath(realImagePath) : item.image_asset;
  }),
  audio_assets: generatedAudio,
  compose_tool: "ffmpeg",
  note: "Video is stitched from three image assets only. No provider video URL, secret, env content, or absolute path is written."
};

writeJson(path.join(process.cwd(), videoRunFiles.finalVideoManifest), manifest);

console.log("video:compose completed");
console.log(`final_video=${manifest.final_video.path}`);
console.log(`duration_seconds=${manifest.final_video.duration_seconds}`);
