import test from "node:test";
import assert from "node:assert/strict";
import { MockModelAdapter } from "../adapters/mock.js";
import { runExperimentPlanningWorkflow } from "../workflows/experimentPlanning.js";
import { runExperimentReviewWorkflow } from "../workflows/experimentReview.js";

const adapter = new MockModelAdapter();

test("runExperimentPlanningWorkflow produces an experiment_plan artifact", async () => {
  const artifact = await runExperimentPlanningWorkflow({
    adapter,
    projectId: "p",
    contract: {},
    literature: [],
    baseline: {},
    checklist: {},
    ideas: [],
    review: {},
    inputRefs: ["a"],
    evidenceRefs: ["a"]
  });
  assert.equal(artifact.type, "experiment_plan");
  assert.equal(artifact.phase, "experiment_planning");
  assert.equal(artifact.content.idea_ref, "idea_structured_negatives");
  assert.equal(artifact.producer.adapter, "mock");
});

test("runExperimentReviewWorkflow injects the real run_ref into the artifact", async () => {
  const artifact = await runExperimentReviewWorkflow({
    adapter,
    projectId: "p",
    plan: {},
    run: {},
    runRef: "artifacts/experiment_execution/run_123.json",
    contract: {},
    ideas: [],
    review: {},
    inputRefs: ["a"],
    evidenceRefs: ["a"]
  });
  assert.equal(artifact.type, "experiment_review");
  assert.equal(artifact.phase, "experiment_review");
  assert.equal(artifact.content.run_ref, "artifacts/experiment_execution/run_123.json");
  assert.equal(artifact.content.decision, "accept_idea");
});
