import { beforeEach, describe, expect, it } from "vitest";
import { resetStore } from "../lib/mock-store";
import { pollRunningTasks, retryMedia, retrySegmentAudio, submitMedia, submitSegmentAudio } from "../lib/workflow-service";

describe("workflow-service", () => {
  beforeEach(() => {
    resetStore();
  });

  it("submit creates tasks", () => {
    const result = submitMedia("MEDIA_001");
    expect(result.created).toBe(true);
    expect(result.tasks).toHaveLength(1);
    expect(result.media.aggregate_status).toBe("processing");
  });

  it("poll changes processing to completed", () => {
    submitMedia("MEDIA_001");
    expect(pollRunningTasks().tasks[0].task_status).toBe("processing");
    const secondPoll = pollRunningTasks();
    expect(secondPoll.tasks[0].task_status).toBe("completed");
    expect(secondPoll.tasks[0].result_url).toBe("/mock-assets/MEDIA_001.png");
  });

  it("[FAIL] prompt changes task to failed", () => {
    submitMedia("MEDIA_005");
    pollRunningTasks();
    const secondPoll = pollRunningTasks();
    expect(secondPoll.tasks[0].task_status).toBe("failed");
  });

  it("retry failed task works", () => {
    submitMedia("MEDIA_005");
    pollRunningTasks();
    pollRunningTasks();
    const retry = retryMedia("MEDIA_005");
    expect(retry.retried).toBe(true);
    pollRunningTasks();
    const completed = pollRunningTasks();
    expect(completed.tasks[0].task_status).toBe("completed");
    expect(completed.tasks[0].result_url).toBe("/mock-assets/MEDIA_005.mp4");
  });

  it("duplicate submit does not create duplicate tasks", () => {
    submitMedia("MEDIA_001");
    const duplicate = submitMedia("MEDIA_001");
    expect(duplicate.created).toBe(false);
    expect(duplicate.tasks).toHaveLength(1);
  });

  it("segment audio task completes through polling", () => {
    const result = submitSegmentAudio("SEG_001", "测试音频文本");
    expect(result.created).toBe(true);
    expect(result.task.task_status).toBe("processing");
    expect(pollRunningTasks().audio_tasks[0].task_status).toBe("processing");
    const completed = pollRunningTasks();
    expect(completed.audio_tasks[0].task_status).toBe("completed");
    expect(completed.audio_tasks[0].result_url).toBe("/mock-assets/mock-audio.wav");
  });

  it("failed segment audio task can retry", () => {
    submitSegmentAudio("SEG_001", "测试音频文本 [FAIL]");
    pollRunningTasks();
    expect(pollRunningTasks().audio_tasks[0].task_status).toBe("failed");
    const retry = retrySegmentAudio("SEG_001");
    expect(retry.retried).toBe(true);
    pollRunningTasks();
    const completed = pollRunningTasks();
    expect(completed.audio_tasks[0].task_status).toBe("completed");
  });
});
