import fs from "node:fs";
import path from "node:path";
import { outputDir, reportsDir, sanitizeText, writeJson } from "./video-workflow-shared";

const scanDirs = [outputDir, reportsDir].filter((dir) => fs.existsSync(dir));
const sensitivePatterns = [
  { name: "local_absolute_path", pattern: /\/Users\/[A-Za-z0-9_.-]+/ },
  { name: "api_key_assignment", pattern: /(API[_-]?KEY|TOKEN|SECRET)\s*=\s*[^"'\s]+/i },
  { name: "bearer_token", pattern: /Bearer\s+[A-Za-z0-9._-]+/ },
  { name: "external_url", pattern: /https?:\/\/[^\s"')]+/i },
  { name: "openai_style_secret", pattern: /sk-[A-Za-z0-9_-]{16,}/i }
];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const findings: Array<{ file: string; pattern: string; sample: string }> = [];

for (const dir of scanDirs) {
  for (const filePath of walk(dir)) {
    if (path.extname(filePath) === ".mp4" || path.extname(filePath) === ".wav") {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const projectPath = path.relative(process.cwd(), filePath).split(path.sep).join("/");
    for (const sensitive of sensitivePatterns) {
      if (sensitive.name === "external_url" && (projectPath === "outputs/video-run/research-notes.md" || projectPath === "reports/video-run-report.md")) {
        continue;
      }
      const match = content.match(sensitive.pattern);
      if (match) {
        findings.push({
          file: projectPath,
          pattern: sensitive.name,
          sample: sanitizeText(match[0])
        });
      }
    }
  }
}

const report = {
  ok: findings.length === 0,
  checked_at: new Date().toISOString(),
  scan_dirs: scanDirs.map((dir) => path.relative(process.cwd(), dir).split(path.sep).join("/")),
  findings
};

writeJson(path.join(process.cwd(), "outputs", "video-run", "security-check.json"), report);

console.log("security:check");
console.log(`findings=${findings.length}`);
for (const finding of findings) {
  console.log(`FAIL ${finding.pattern} ${finding.file} ${finding.sample}`);
}

if (findings.length > 0) {
  process.exit(1);
}
