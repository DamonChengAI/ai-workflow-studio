import { initialSample } from "../lib/mock-data";
import { resetStore } from "../lib/mock-store";
import { validateSample } from "../lib/validator";
import { pollRunningTasks, retryMedia, submitMedia } from "../lib/workflow-service";

resetStore();

const validation = validateSample(initialSample);
const submit = submitMedia("MEDIA_005");
pollRunningTasks();
const failedPoll = pollRunningTasks();
const retry = retryMedia("MEDIA_005");
pollRunningTasks();
const completedPoll = pollRunningTasks();

console.log("AI Workflow Studio Agent Demo");
console.log("");
console.log("Status:");
console.log(`- sample validation: ${validation.ok ? "passed" : "failed"}`);
console.log(`- mock submit: ${submit.created ? "created task" : "not created"}`);
console.log(`- failed path: ${failedPoll.tasks[0]?.task_status ?? "none"}`);
console.log(`- retry path: ${retry.retried ? "retried" : "not retried"}`);
console.log(`- completed after retry: ${completedPoll.tasks[0]?.task_status ?? "none"}`);
console.log("");
console.log("Capabilities:");
console.log("- Idea / Scene / Segment / Media Card / Media Task hierarchy");
console.log("- mock provider submission");
console.log("- polling");
console.log("- aggregate status update");
console.log("- failed task retry");
console.log("- preview_url callback");
console.log("");
console.log("Safety boundary:");
console.log("- no external APIs called");
console.log("- no environment variables read");
console.log("- mock providers only");
