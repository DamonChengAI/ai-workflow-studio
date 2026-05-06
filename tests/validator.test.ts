import { describe, expect, it } from "vitest";
import { initialSample } from "../lib/mock-data";
import { validateSample } from "../lib/validator";
import type { BulkSample } from "../lib/types";

function cloneSample(): BulkSample {
  return JSON.parse(JSON.stringify(initialSample)) as BulkSample;
}

describe("validateSample", () => {
  it("passes the valid sample", () => {
    const report = validateSample(cloneSample());
    expect(report.ok).toBe(true);
    expect(report.counts.ideas).toBe(2);
    expect(report.counts.media_cards).toBe(10);
  });

  it("fails on missing scene reference", () => {
    const sample = cloneSample();
    sample.segments[0].scene_id = "SCENE_MISSING";
    const report = validateSample(sample);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "missing_reference")).toBe(true);
  });

  it("fails when video generate_count is greater than 1", () => {
    const sample = cloneSample();
    const video = sample.media_cards.find((media) => media.media_type === "video");
    expect(video).toBeDefined();
    video!.generate_count = 2;
    const report = validateSample(sample);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "invalid_generate_count")).toBe(true);
  });

  it("fails when image duration is set", () => {
    const sample = cloneSample();
    sample.media_cards[0].duration = 6;
    const report = validateSample(sample);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "invalid_duration")).toBe(true);
  });

  it("fails on unsupported provider", () => {
    const sample = cloneSample() as unknown as { media_cards: Array<Record<string, unknown>> };
    sample.media_cards[0].provider = "unsupported";
    const report = validateSample(sample);
    expect(report.ok).toBe(false);
  });
});
