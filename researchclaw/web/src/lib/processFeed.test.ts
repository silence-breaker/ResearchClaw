import { describe, expect, it, test } from "vitest";
import { adapterBadgeMeta, cliLabel, readRawLogSummary } from "./processFeed";

describe("adapterBadgeMeta", () => {
  test("maps known adapters to a label + tone", () => {
    expect(adapterBadgeMeta("claude")).toEqual({ label: "Claude", tone: "claude" });
    expect(adapterBadgeMeta("mock")).toEqual({ label: "Mock", tone: "mock" });
    expect(adapterBadgeMeta("manual")).toEqual({ label: "人工", tone: "manual" });
  });

  test("falls back gracefully for unknown / missing adapters", () => {
    expect(adapterBadgeMeta(undefined)).toEqual({ label: "—", tone: "unknown" });
  });

  test("maps gemini and codex to their own tone", () => {
    expect(adapterBadgeMeta("gemini")).toEqual({ label: "Gemini", tone: "gemini" });
    expect(adapterBadgeMeta("codex")).toEqual({ label: "Codex", tone: "codex" });
  });

  test("keeps claude/mock/manual", () => {
    expect(adapterBadgeMeta("claude").tone).toBe("claude");
    expect(adapterBadgeMeta("mock").tone).toBe("mock");
    expect(adapterBadgeMeta("manual").tone).toBe("manual");
  });
});

describe("adapterBadgeMeta — runner", () => {
  it("returns runner tone with a non-empty label", () => {
    const meta = adapterBadgeMeta("runner");
    expect(meta.tone).toBe("runner");
    expect(meta.label).toBe("执行器");
  });
});

describe("cliLabel", () => {
  test("maps cli ids to human labels", () => {
    expect(cliLabel("claude-code")).toBe("Claude Code");
    expect(cliLabel("gemini-cli")).toBe("Gemini CLI");
    expect(cliLabel("codex-cli")).toBe("Codex CLI");
    expect(cliLabel(undefined)).toBe("—");
  });
});

describe("readRawLogSummary", () => {
  test("reads a full CLI raw_log summary", () => {
    const summary = readRawLogSummary({
      model: "claude-haiku-4-5",
      time: "2026-06-04T00:00:00.000Z",
      role: "规划",
      summary: "Drafted contract",
      transcript_ref: "raw_payloads/x.json",
      artifact_refs: ["a", "b"]
    });
    expect(summary.model).toBe("claude-haiku-4-5");
    expect(summary.role).toBe("规划");
    expect(summary.summary).toBe("Drafted contract");
    expect(summary.transcriptRef).toBe("raw_payloads/x.json");
    expect(summary.artifactRefs).toEqual(["a", "b"]);
  });

  test("tolerates missing fields without throwing", () => {
    const summary = readRawLogSummary({ summary: "only a summary" });
    expect(summary.summary).toBe("only a summary");
    expect(summary.model).toBe("—");
    expect(summary.role).toBe("—");
    expect(summary.artifactRefs).toEqual([]);
    expect(summary.transcriptRef).toBeUndefined();
  });

  test("tolerates a non-object content", () => {
    const summary = readRawLogSummary("nope");
    expect(summary.model).toBe("—");
    expect(summary.summary).toBe("—");
    expect(summary.artifactRefs).toEqual([]);
  });
});
