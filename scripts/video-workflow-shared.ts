import fs from "node:fs";
import path from "node:path";

export const outputDir = path.join(process.cwd(), "outputs", "video-run");
export const reportsDir = path.join(process.cwd(), "reports");

export function toProjectPath(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T>(relativePath: string): T {
  const fullPath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as T;
}

export function writeText(filePath: string, value: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`);
}

export function existsProjectPath(relativePath: string) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

export function nowIso() {
  return new Date().toISOString();
}

export function sanitizeText(value: string) {
  return value
    .replaceAll(process.cwd(), ".")
    .replace(/\/Users\/[^\s"')]+/g, "[redacted-local-path]")
    .replace(/https?:\/\/[^\s"')]+/g, "[redacted-url]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/(API[_-]?KEY|TOKEN|SECRET)=\S+/gi, "$1=[redacted]");
}

export const videoRunFiles = {
  request: "outputs/video-run/request.md",
  storyboard: "outputs/video-run/storyboard.json",
  mediaPlan: "outputs/video-run/media-plan.json",
  taskRun: "outputs/video-run/task-run.json",
  mediaManifest: "outputs/video-run/media-manifest.json",
  realProviderManifest: "outputs/video-run/real-provider-manifest.json",
  finalVideoManifest: "outputs/video-run/final-video-manifest.json",
  qualityCheck: "outputs/video-run/quality-check.json",
  subagentReview: "outputs/video-run/subagent-review.md",
  hookCheck: "outputs/video-run/hook-check.json",
  report: "reports/video-run-report.md"
};

export interface StoryboardItem {
  order: number;
  segment_id: string;
  title: string;
  duration_seconds: number;
  image_asset: string;
  audio_manifest_path: string;
  narration_cn: string;
  product_point: string;
}

export interface StoryboardFile {
  theme: string;
  target_duration_seconds: number;
  total_duration_seconds: number;
  items: StoryboardItem[];
}
