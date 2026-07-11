import { describe, expect, test } from "vitest";
import type { CliChunk } from "../api/types";
import { groupCliWindows, isDegradedChunk, reduceCliChunks } from "./cliStream";

const chunk = (over: Partial<CliChunk> = {}): CliChunk => ({
  phase: "contract_draft",
  role: "规划",
  ts: "2026-06-04T00:00:00.000Z",
  ...over
});

describe("reduceCliChunks", () => {
  test("appends a chunk to the buffer", () => {
    const next = reduceCliChunks([], chunk({ text: "hello" }));
    expect(next).toHaveLength(1);
    expect(next[0].text).toBe("hello");
  });

  test("keeps insertion order", () => {
    let buf: CliChunk[] = [];
    buf = reduceCliChunks(buf, chunk({ text: "a" }));
    buf = reduceCliChunks(buf, chunk({ text: "b" }));
    expect(buf.map((c) => c.text)).toEqual(["a", "b"]);
  });

  test("caps the buffer, dropping the oldest entries", () => {
    let buf: CliChunk[] = [];
    for (let i = 0; i < 130; i += 1) {
      buf = reduceCliChunks(buf, chunk({ text: String(i) }), 100);
    }
    expect(buf).toHaveLength(100);
    expect(buf[0].text).toBe("30");
    expect(buf.at(-1)?.text).toBe("129");
  });

  test("does not mutate the input buffer", () => {
    const original = [chunk({ text: "a" })];
    const next = reduceCliChunks(original, chunk({ text: "b" }));
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe("isDegradedChunk", () => {
  test("true when the chunk carries a degraded flag", () => {
    expect(isDegradedChunk(chunk({ degraded: true, text: "降级 mock" }))).toBe(true);
  });

  test("false for a normal chunk", () => {
    expect(isDegradedChunk(chunk({ text: "drafting" }))).toBe(false);
  });
});

describe("groupCliWindows", () => {
  const wf = (over: Partial<CliChunk>): CliChunk => ({ kind: "workflow", role: "规划", ts: "t", ...over });

  test("groups chunks by windowId, preserving first-seen order", () => {
    const wins = groupCliWindows([
      wf({ windowId: "w1", provider: "claude", cli: "claude-code", model: "h", phase: "contract_draft", text: "a" }),
      wf({ windowId: "w2", provider: "gemini", cli: "gemini-cli", phase: "literature_scouting", text: "b" }),
      wf({ windowId: "w1", text: "c" })
    ]);
    expect(wins.map((w) => w.windowId)).toEqual(["w1", "w2"]);
    expect(wins[0].chunks.map((c) => c.text)).toEqual(["a", "c"]);
    expect(wins[0].provider).toBe("claude");
    expect(wins[1].cli).toBe("gemini-cli");
  });

  test("marks a window degraded if any chunk is degraded", () => {
    const wins = groupCliWindows([
      wf({ windowId: "w1", provider: "codex", degraded: true, role: "系统", text: "超时，已降级 mock" })
    ]);
    expect(wins[0].degraded).toBe(true);
    expect(wins[0].provider).toBe("codex");
  });

  test("skips consult chunks", () => {
    const wins = groupCliWindows([
      { kind: "consult", role: "对话", ts: "t", text: "hi" },
      wf({ windowId: "w1", text: "a" })
    ]);
    expect(wins).toHaveLength(1);
    expect(wins[0].windowId).toBe("w1");
  });

  test("puts windowId-less workflow chunks into an ungrouped window", () => {
    const wins = groupCliWindows([wf({ text: "a" })]);
    expect(wins[0].windowId).toBe("ungrouped");
  });
});
