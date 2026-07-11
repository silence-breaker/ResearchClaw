import test from "node:test";
import assert from "node:assert/strict";
import { createArtifact, producerFields } from "../evidence/types.js";

test("createArtifact records cli/model/windowId in producer", () => {
  const a = createArtifact({
    projectId: "p", phase: "literature_scouting", type: "paper_cards", workflow: "literature",
    adapter: "gemini", cli: "gemini-cli", model: "gemini-3.1-flash-lite", windowId: "win_y", content: {}
  });
  assert.equal(a.producer.adapter, "gemini");
  assert.equal(a.producer.cli, "gemini-cli");
  assert.equal(a.producer.model, "gemini-3.1-flash-lite");
  assert.equal(a.producer.windowId, "win_y");
});

test("createArtifact producer cli/model/windowId default to null", () => {
  const a = createArtifact({ projectId: "p", phase: "intake", type: "raw_log", workflow: "intake", adapter: "manual", content: {} });
  assert.equal(a.producer.cli, null);
  assert.equal(a.producer.model, null);
  assert.equal(a.producer.windowId, null);
});

test("producerFields uses source cli/model for a real run", () => {
  const p = producerFields({ adapter: "claude", degraded: false, source: { cli: "claude-code", model: "claude-haiku-4-5", windowId: "win_x" } });
  assert.deepEqual(p, { adapter: "claude", cli: "claude-code", model: "claude-haiku-4-5", windowId: "win_x" });
});

test("producerFields reports mock honestly for a degraded run, keeping windowId", () => {
  const p = producerFields({ adapter: "mock", degraded: true, source: { provider: "gemini", cli: "gemini-cli", model: "g", windowId: "win_y" } });
  assert.deepEqual(p, { adapter: "mock", cli: "mock", model: null, windowId: "win_y" });
});

test("producerFields never impersonates a real provider on a degraded run", () => {
  const p = producerFields({ adapter: "gemini", degraded: true, source: { provider: "gemini", cli: "gemini-cli", model: "g", windowId: "win_y" } });
  assert.deepEqual(p, { adapter: "mock", cli: "mock", model: null, windowId: "win_y" });
});
