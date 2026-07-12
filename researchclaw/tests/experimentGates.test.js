import test from "node:test";
import assert from "node:assert/strict";
import { experimentPlanGate, experimentRunGate, experimentReviewGate } from "../engine/gates.js";

const contract = { metrics: [{ name: "recall@10" }, { name: "latency" }] };
const okPlan = {
  idea_ref: "idea_x",
  commands: ["python src/train.py --epochs 1"],
  metrics: ["recall@10"],
  success_criteria: ["recall@10 improves >= 1.0"],
  failure_criteria: ["recall@10 gain < 0.3"]
};

test("experimentPlanGate passes a well-formed plan referencing the recommended idea", () => {
  const r = experimentPlanGate(okPlan, { contract, recommendedIdeaId: "idea_x" });
  assert.equal(r.ok, true, r.errors.join("; "));
});

test("experimentPlanGate fails when idea_ref != recommended idea", () => {
  const r = experimentPlanGate(okPlan, { contract, recommendedIdeaId: "idea_other" });
  assert.equal(r.ok, false);
});

test("experimentPlanGate fails with no executable command", () => {
  const r = experimentPlanGate({ ...okPlan, commands: ["x"] }, { contract, recommendedIdeaId: "idea_x" });
  assert.equal(r.ok, false);
});

test("experimentPlanGate fails when metrics do not reference a contract metric", () => {
  const r = experimentPlanGate({ ...okPlan, metrics: ["f1"] }, { contract, recommendedIdeaId: "idea_x" });
  assert.equal(r.ok, false);
});

test("experimentRunGate passes a passed run with metrics and zero exits", () => {
  const run = {
    status: "passed",
    metrics_observed: { accuracy: 0.9 },
    commands_executed: [{ command: "c", exit_code: 0, stdout_ref: "r1", stderr_ref: "r2" }]
  };
  assert.equal(experimentRunGate(run).ok, true);
});

test("experimentRunGate fails a passed run with a non-zero exit", () => {
  const run = {
    status: "passed",
    metrics_observed: { accuracy: 0.9 },
    commands_executed: [{ command: "c", exit_code: 1, stdout_ref: "r1", stderr_ref: "r2" }]
  };
  assert.equal(experimentRunGate(run).ok, false);
});

test("experimentRunGate fails a passed run with empty metrics_observed", () => {
  const run = {
    status: "passed",
    metrics_observed: {},
    commands_executed: [{ command: "c", exit_code: 0, stdout_ref: "r1", stderr_ref: "r2" }]
  };
  assert.equal(experimentRunGate(run).ok, false);
});

test("experimentRunGate does NOT block a structurally valid failed run (honest failure proceeds)", () => {
  const run = {
    status: "failed",
    metrics_observed: {},
    failure_reason: "exit 3",
    commands_executed: [{ command: "c", exit_code: 3, stdout_ref: "r1", stderr_ref: "r2" }]
  };
  assert.equal(experimentRunGate(run).ok, true);
});

test("experimentRunGate fails when a command lacks raw_log refs", () => {
  const run = {
    status: "failed",
    commands_executed: [{ command: "c", exit_code: 3 }]
  };
  assert.equal(experimentRunGate(run).ok, false);
});

test("experimentReviewGate passes a well-formed review", () => {
  const review = {
    run_ref: "artifacts/experiment_execution/x.json",
    claim_support: [{ claim_id: "C1", metric_ref: "recall@10", support_type: "supports", rationale: "r", evidence_excerpt: "e" }],
    decision: "accept_idea",
    next_actions: ["write up"]
  };
  assert.equal(experimentReviewGate(review).ok, true);
});

test("experimentReviewGate fails an unknown support_type or decision", () => {
  assert.equal(experimentReviewGate({
    run_ref: "x",
    claim_support: [{ claim_id: "C1", metric_ref: "m", support_type: "maybe" }],
    decision: "accept_idea",
    next_actions: ["a"]
  }).ok, false);
  assert.equal(experimentReviewGate({
    run_ref: "x",
    claim_support: [{ claim_id: "C1", metric_ref: "m", support_type: "supports" }],
    decision: "ship_it",
    next_actions: ["a"]
  }).ok, false);
});
