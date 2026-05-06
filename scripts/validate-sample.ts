import { initialSample } from "../lib/mock-data";
import { validateSample } from "../lib/validator";

const report = validateSample(initialSample);

console.log("AI Workflow Studio Validate");
console.log("");
console.log(`ideas count: ${report.counts.ideas}`);
console.log(`scenes count: ${report.counts.scenes}`);
console.log(`segments count: ${report.counts.segments}`);
console.log(`media cards count: ${report.counts.media_cards}`);
console.log(`covers count: ${report.counts.covers}`);
console.log("");

if (report.ok) {
  console.log("validation: passed");
} else {
  console.log("validation: failed");
  for (const issue of report.issues) {
    console.log(`- [${issue.code}] ${issue.path ?? "root"}: ${issue.message}`);
  }
  process.exitCode = 1;
}
