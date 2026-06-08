import { describe, expect, test } from "vitest";
import type { CliChunk } from "../api/types";
import { isDegradedChunk, reduceCliChunks } from "./cliStream";

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
