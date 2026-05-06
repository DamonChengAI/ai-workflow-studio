import { initialSample } from "../lib/mock-data";
import { resetStore } from "../lib/mock-store";
import { pollRunningTasks, submitMedia } from "../lib/workflow-service";

resetStore();

console.log("AI Workflow Studio Demo");
console.log("");
console.log(
  `loaded: ${initialSample.ideas.length} ideas, ${initialSample.scenes.length} scenes, ${initialSample.segments.length} segments, ${initialSample.media_cards.length} media cards`
);

const submit = submitMedia("MEDIA_001");
console.log(`submit: MEDIA_001 -> ${submit.media.aggregate_status}`);

const poll1 = pollRunningTasks();
console.log(`poll #1: ${poll1.tasks[0]?.task_status ?? "none"}`);

const poll2 = pollRunningTasks();
console.log(`poll #2: ${poll2.tasks[0]?.task_status ?? "none"}`);

console.log(`preview: ${poll2.tasks[0]?.result_url ?? "none"}`);
