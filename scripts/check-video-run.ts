import path from "node:path";
import { existsProjectPath, readJson, videoRunFiles, writeJson, type StoryboardFile } from "./video-workflow-shared";

interface CheckItem {
  name: string;
  ok: boolean;
  detail: string;
}

function item(name: string, ok: boolean, detail: string): CheckItem {
  return { name, ok, detail };
}

const checks: CheckItem[] = [];

for (const required of [
  videoRunFiles.request,
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
  checks.push(item("storyboard:theme", storyboard.theme === "一句需求如何变成一条可交付视频", storyboard.theme));
  checks.push(item("storyboard:item_count", storyboard.items.length >= 6, String(storyboard.items.length)));
  checks.push(item("storyboard:duration", storyboard.total_duration_seconds >= 28 && storyboard.total_duration_seconds <= 32, String(storyboard.total_duration_seconds)));
  for (const storyboardItem of storyboard.items) {
    checks.push(item(`storyboard:image:${storyboardItem.order}`, existsProjectPath(storyboardItem.image_asset), storyboardItem.image_asset));
    checks.push(item(`storyboard:audio:${storyboardItem.order}`, existsProjectPath(storyboardItem.audio_manifest_path), storyboardItem.audio_manifest_path));
  }
}

if (existsProjectPath(videoRunFiles.finalVideoManifest)) {
  try {
    const finalManifest = readJson<{ final_video?: { path?: string; duration_seconds?: number }; real_provider_overlay?: boolean }>(videoRunFiles.finalVideoManifest);
    const videoPath = finalManifest.final_video?.path ?? "";
    const duration = finalManifest.final_video?.duration_seconds ?? 0;
    checks.push(item("final_video:path", Boolean(videoPath) && existsProjectPath(videoPath), videoPath || "missing"));
    checks.push(item("final_video:duration", duration >= 28 && duration <= 32, String(duration)));
    checks.push(
      item(
        "real_provider:overlay",
        process.env.REQUIRE_REAL_VIDEO === "1" ? finalManifest.real_provider_overlay === true : true,
        finalManifest.real_provider_overlay ? "present" : "not_present"
      )
    );
  } catch (error) {
    checks.push(item("final_video:manifest", false, error instanceof Error ? error.message : String(error)));
  }
} else {
  checks.push(item("final_video:manifest", false, "missing"));
}

if (process.env.REQUIRE_REAL_VIDEO === "1") {
  checks.push(item("real_provider:manifest", existsProjectPath(videoRunFiles.realProviderManifest), videoRunFiles.realProviderManifest));
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
