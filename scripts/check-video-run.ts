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
  checks.push(item("storyboard:theme", storyboard.theme === "快来购买豆包高级套餐吧！", storyboard.theme));
  checks.push(item("storyboard:item_count", storyboard.items.length === 3, String(storyboard.items.length)));
  checks.push(item("storyboard:duration", storyboard.total_duration_seconds >= 28 && storyboard.total_duration_seconds <= 32, String(storyboard.total_duration_seconds)));
  for (const storyboardItem of storyboard.items) {
    checks.push(item(`storyboard:image:${storyboardItem.order}`, existsProjectPath(storyboardItem.image_asset), storyboardItem.image_asset));
    checks.push(item(`storyboard:audio:${storyboardItem.order}`, existsProjectPath(storyboardItem.audio_manifest_path), storyboardItem.audio_manifest_path));
  }
}

if (process.env.REQUIRE_RESEARCH === "1") {
  try {
    const researchText = await import("node:fs").then((fs) => fs.readFileSync(path.join(process.cwd(), videoRunFiles.researchNotes), "utf8"));
    const hasSource = /https?:\/\/|官方|doubao|豆包|source|来源/i.test(researchText);
    const isPlaceholder = researchText.includes("待模型联网检索后补充") || researchText.includes("sources: []");
    checks.push(item("research:latest_sources", hasSource && !isPlaceholder, hasSource && !isPlaceholder ? "present" : "missing_or_placeholder"));
  } catch (error) {
    checks.push(item("research:latest_sources", false, error instanceof Error ? error.message : String(error)));
  }
}

if (existsProjectPath(videoRunFiles.finalVideoManifest)) {
  try {
    const finalManifest = readJson<{
      final_video?: { path?: string; duration_seconds?: number };
      real_provider_images?: string[];
      uses_provider_video?: boolean;
      storyboard_items?: number;
    }>(videoRunFiles.finalVideoManifest);
    const videoPath = finalManifest.final_video?.path ?? "";
    const duration = finalManifest.final_video?.duration_seconds ?? 0;
    checks.push(item("final_video:path", Boolean(videoPath) && existsProjectPath(videoPath), videoPath || "missing"));
    checks.push(item("final_video:duration", duration >= 28 && duration <= 32, String(duration)));
    checks.push(item("final_video:image_count", finalManifest.storyboard_items === 3, String(finalManifest.storyboard_items ?? "missing")));
    checks.push(item("final_video:no_provider_video", finalManifest.uses_provider_video === false, String(finalManifest.uses_provider_video)));
    const realImages = finalManifest.real_provider_images ?? [];
    checks.push(item("real_provider:images", process.env.REQUIRE_REAL_IMAGES === "1" ? realImages.length === 3 : true, String(realImages.length)));
  } catch (error) {
    checks.push(item("final_video:manifest", false, error instanceof Error ? error.message : String(error)));
  }
} else {
  checks.push(item("final_video:manifest", false, "missing"));
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
