import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileEvidenceStore } from "../evidence/store.js";
import { runExperimentExecutionWorkflow } from "../workflows/experimentExecution.js";

function harness() {
  const rootDir = mkdtempSync(join(tmpdir(), "rc-exec-"));
  const store = new FileEvidenceStore({ rootDir });
  store.ensureProject("p");
  const workdir = join(rootDir, "experiments", "p");
  return { store, workdir };
}

const passingPlan = {
  idea_ref: "idea_x",
  commands: ["node -e \"require('fs').writeFileSync('metrics.json', JSON.stringify({ accuracy: 0.9 }))\""]
};

test("execution runs commands, reads metrics.json, and lands a passed experiment_run", async () => {
  const { store, workdir } = harness();
  const artifact = await runExperimentExecutionWorkflow({
    store,
    projectId: "p",
    plan: passingPlan,
    planRef: "artifacts/experiment_planning/plan_1.json",
    workdir,
    inputRefs: ["artifacts/experiment_planning/plan_1.json"],
    evidenceRefs: ["artifacts/experiment_planning/plan_1.json"]
  });
  assert.equal(artifact.type, "experiment_run");
  assert.equal(artifact.producer.adapter, "runner");
  assert.equal(artifact.content.status, "passed");
  assert.equal(artifact.content.plan_ref, "artifacts/experiment_planning/plan_1.json");
  assert.deepEqual(artifact.content.metrics_observed, { accuracy: 0.9 });
  assert.equal(artifact.content.commands_executed.length, 1);
  assert.ok(artifact.content.commands_executed[0].stdout_ref);
  assert.ok(artifact.content.commands_executed[0].stderr_ref);
  assert.equal(artifact.content.commands_executed[0].exit_code, 0);
  assert.ok(artifact.content.raw_log_ref);
});

test("execution reports failed and empty metrics on a non-zero exit", async () => {
  const { store, workdir } = harness();
  const artifact = await runExperimentExecutionWorkflow({
    store,
    projectId: "p",
    plan: { idea_ref: "idea_x", commands: ["node -e \"process.exit(2)\""] },
    planRef: "plan_ref",
    workdir,
    inputRefs: [],
    evidenceRefs: []
  });
  assert.equal(artifact.content.status, "failed");
  assert.deepEqual(artifact.content.metrics_observed, {});
  assert.ok(artifact.content.failure_reason);
});
