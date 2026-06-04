import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTempHarness } from "./helpers.js";

test("archive marks a project and unarchive clears it; listing carries the flag", async () => {
  const { store, orchestrator } = createTempHarness();
  await orchestrator.startFromText("proj_arch", "Explore retrieval reranking");

  store.archiveProject("proj_arch");
  let summary = store.listProjectSummaries().find((p) => p.project_id === "proj_arch");
  assert.equal(summary.archived, true);
  // archiving is a meta op — it must not disturb the research state machine
  const state = store.readState("proj_arch");
  assert.equal(state.archived, true);
  assert.ok(typeof state.archived_at === "string");
  assert.equal(state.phase, "contract_review");

  store.unarchiveProject("proj_arch");
  summary = store.listProjectSummaries().find((p) => p.project_id === "proj_arch");
  assert.equal(summary.archived, false);
  assert.equal(store.readState("proj_arch").archived, undefined);
});

test("deleteProject removes the project directory and drops it from listings", async () => {
  const { store, orchestrator, rootDir } = createTempHarness();
  await orchestrator.startFromText("proj_del", "Explore retrieval reranking");
  assert.ok(existsSync(join(rootDir, "projects", "proj_del")));

  store.deleteProject("proj_del");

  assert.equal(existsSync(join(rootDir, "projects", "proj_del")), false);
  assert.equal(
    store.listProjectSummaries().some((p) => p.project_id === "proj_del"),
    false
  );
});

test("deleteProject refuses ids that escape the projects directory", () => {
  const { store } = createTempHarness();
  assert.throws(() => store.deleteProject("../../etc"), /invalid project id/i);
  assert.throws(() => store.deleteProject("a/b"), /invalid project id/i);
});
