import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventBus } from "../engine/events.js";
import { ResearchOrchestrator } from "../engine/orchestrator.js";
import { FileEvidenceStore } from "../evidence/store.js";
import { MockModelAdapter } from "../adapters/mock.js";

test("emit delivers an event to a subscriber of the same project", () => {
  const bus = new EventBus();
  const received = [];
  bus.subscribe("proj_a", (event) => received.push(event));

  bus.emit("proj_a", { type: "snapshot", data: { phase: "intake" } });

  assert.equal(received.length, 1);
  assert.equal(received[0].type, "snapshot");
  assert.deepEqual(received[0].data, { phase: "intake" });
});

test("a subscriber only receives events for its own project", () => {
  const bus = new EventBus();
  const received = [];
  bus.subscribe("proj_a", (event) => received.push(event));

  bus.emit("proj_b", { type: "snapshot", data: {} });

  assert.equal(received.length, 0);
});

test("unsubscribe stops further delivery", () => {
  const bus = new EventBus();
  const received = [];
  const unsubscribe = bus.subscribe("proj_a", (event) => received.push(event));

  bus.emit("proj_a", { type: "snapshot", data: { n: 1 } });
  unsubscribe();
  bus.emit("proj_a", { type: "snapshot", data: { n: 2 } });

  assert.equal(received.length, 1);
  assert.deepEqual(received[0].data, { n: 1 });
});

test("multiple subscribers on the same project all receive the event", () => {
  const bus = new EventBus();
  const a = [];
  const b = [];
  bus.subscribe("proj_a", (event) => a.push(event));
  bus.subscribe("proj_a", (event) => b.push(event));

  bus.emit("proj_a", { type: "phase_changed", data: { to: "summary" } });

  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
});

test("orchestrator emits a full-state snapshot after a state write", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "researchclaw-evt-"));
  const store = new FileEvidenceStore({ rootDir });
  const eventBus = new EventBus();
  const orchestrator = new ResearchOrchestrator({ store, adapter: new MockModelAdapter(), eventBus });
  const events = [];
  eventBus.subscribe("proj_evt", (event) => events.push(event));

  await orchestrator.startFromText("proj_evt", "Explore retrieval reranking");

  const snapshots = events.filter((event) => event.type === "snapshot");
  assert.ok(snapshots.length >= 1, "at least one snapshot must be emitted");
  const latest = snapshots.at(-1);
  // snapshot data is the complete state, not the trimmed public summary
  assert.equal(latest.data.project_id, "proj_evt");
  assert.equal(latest.data.phase, "contract_review");
  assert.ok(Array.isArray(latest.data.phase_history), "snapshot carries full phase_history");
  assert.ok(Array.isArray(latest.data.contract_versions), "snapshot carries contract_versions");
});

test("emit buffers cli_chunk events so a late subscriber can replay them", () => {
  const bus = new EventBus();
  bus.emit("proj_a", { type: "cli_chunk", data: { text: "a" } });
  bus.emit("proj_a", { type: "cli_chunk", data: { text: "b" } });

  const replayed = [];
  bus.replayCliChunks("proj_a", (event) => replayed.push(event));
  assert.equal(replayed.length, 2);
  assert.equal(replayed[0].data.text, "a");
  assert.equal(replayed[1].data.text, "b");
});

test("only cli_chunk events are buffered (not snapshots)", () => {
  const bus = new EventBus();
  bus.emit("proj_a", { type: "snapshot", data: { phase: "intake" } });
  bus.emit("proj_a", { type: "cli_chunk", data: { text: "a" } });

  const replayed = [];
  bus.replayCliChunks("proj_a", (event) => replayed.push(event));
  assert.equal(replayed.length, 1);
  assert.equal(replayed[0].type, "cli_chunk");
});

test("clearCliChunks empties a project's buffer (called at a new run start)", () => {
  const bus = new EventBus();
  bus.emit("proj_a", { type: "cli_chunk", data: { text: "old" } });
  bus.clearCliChunks("proj_a");

  const replayed = [];
  bus.replayCliChunks("proj_a", (event) => replayed.push(event));
  assert.equal(replayed.length, 0);
});

test("the cli_chunk buffer is capped (drops oldest)", () => {
  const bus = new EventBus();
  for (let i = 0; i < 250; i += 1) {
    bus.emit("proj_a", { type: "cli_chunk", data: { n: i } });
  }
  const replayed = [];
  bus.replayCliChunks("proj_a", (event) => replayed.push(event));
  assert.ok(replayed.length <= 200, "buffer must be capped");
  assert.equal(replayed.at(-1).data.n, 249, "newest is kept");
});

test("orchestrator works without an event bus injected", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "researchclaw-noevt-"));
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter: new MockModelAdapter() });

  const result = await orchestrator.startFromText("proj_noevt", "Explore retrieval reranking");

  assert.equal(result.phase, "contract_review");
});
