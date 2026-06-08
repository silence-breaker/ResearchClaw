import { describe, expect, it } from "vitest";
import { buildEventFeed, filterFeed, type EventSource } from "./eventFeed";
import type { CliChunk, SignalRef } from "../api/types";

const sig = (over: Partial<SignalRef>): SignalRef => ({
  id: "sig_1",
  intent: "noop",
  event: "session-start",
  routeKey: "session.started",
  timestamp: "2026-06-08T12:00:00.000Z",
  rawPayloadRef: "raw_payloads/x.json",
  ...over
});

const chunk = (over: Partial<CliChunk>): CliChunk => ({ role: "规划", ts: "2026-06-08T12:00:05.000Z", ...over });

describe("buildEventFeed", () => {
  it("classifies OpenClaw hook signals as openclaw", () => {
    const feed = buildEventFeed([sig({ event: "keyword-detector", intent: "start_research" })], []);
    expect(feed[0].source).toBe("openclaw");
    expect(feed[0].label).toContain("研究请求");
  });

  it("classifies manual-start signals as system", () => {
    const feed = buildEventFeed([sig({ event: "manual-start", intent: "start_research", routeKey: "manual.start" })], []);
    expect(feed[0].source).toBe("system");
  });

  it("tags cli chunks as claude", () => {
    const feed = buildEventFeed([], [chunk({ text: "Drafting contract" })]);
    expect(feed[0].source).toBe("claude");
    expect(feed[0].detail).toContain("Drafting");
  });

  it("renders a tool chunk with its tool name", () => {
    const feed = buildEventFeed([], [chunk({ tool: "Write" })]);
    expect(feed[0].detail).toContain("Write");
  });

  it("merges signals + chunks newest-first by timestamp", () => {
    const feed = buildEventFeed(
      [sig({ id: "s_old", timestamp: "2026-06-08T12:00:00.000Z" })],
      [chunk({ ts: "2026-06-08T12:00:10.000Z", text: "later" })]
    );
    expect(feed[0].ts).toBe("2026-06-08T12:00:10.000Z");
    expect(feed[1].ts).toBe("2026-06-08T12:00:00.000Z");
  });

  it("caps claude chunks so the feed never floods", () => {
    const many = Array.from({ length: 50 }, (_, i) => chunk({ text: `t${i}`, ts: `2026-06-08T12:00:${String(i).padStart(2, "0")}.000Z` }));
    const feed = buildEventFeed([], many, { claudeCap: 20 });
    expect(feed.filter((e) => e.source === "claude").length).toBe(20);
  });
});

describe("filterFeed", () => {
  const feed = buildEventFeed(
    [sig({ id: "a", event: "keyword-detector", intent: "start_research" }), sig({ id: "b", event: "manual-start", routeKey: "manual.start" })],
    [chunk({ text: "x" })]
  );
  it("returns everything for 'all'", () => {
    expect(filterFeed(feed, "all").length).toBe(3);
  });
  it.each<[EventSource, number]>([
    ["openclaw", 1],
    ["system", 1],
    ["claude", 1]
  ])("filters to %s", (source, count) => {
    expect(filterFeed(feed, source).every((e) => e.source === source)).toBe(true);
    expect(filterFeed(feed, source).length).toBe(count);
  });
});
