import path from "node:path";
import { existsProjectPath, readJson, videoRunFiles, writeJson } from "./video-workflow-shared";

const quality = existsProjectPath(videoRunFiles.qualityCheck)
  ? readJson<{ ok: boolean }>(videoRunFiles.qualityCheck)
  : { ok: false };
const security = existsProjectPath("outputs/video-run/security-check.json")
  ? readJson<{ ok: boolean }>("outputs/video-run/security-check.json")
  : { ok: false };

const checks = [
  {
    name: "quality_check",
    ok: quality.ok === true
  },
  {
    name: "security_check",
    ok: security.ok === true
  },
  {
    name: "final_video_manifest",
    ok: existsProjectPath(videoRunFiles.finalVideoManifest)
  },
  {
    name: "subagent_review",
    ok: existsProjectPath(videoRunFiles.subagentReview)
  },
  {
    name: "report",
    ok: existsProjectPath(videoRunFiles.report)
  }
];

const report = {
  ok: checks.every((check) => check.ok),
  checked_at: new Date().toISOString(),
  hook: "Stop",
  checks
};

writeJson(path.join(process.cwd(), videoRunFiles.hookCheck), report);

console.log("hook:check");
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
}

if (!report.ok) {
  process.exit(1);
}
