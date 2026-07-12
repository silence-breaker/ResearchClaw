import test from "node:test";
import assert from "node:assert/strict";
import { researchPhases, isResearchPhase } from "../engine/phases.js";
import { createArtifact } from "../evidence/types.js";

test("experiment phases are inserted between idea_review and summary", () => {
  const iReview = researchPhases.indexOf("idea_review");
  const iSummary = researchPhases.indexOf("summary");
  assert.deepEqual(researchPhases.slice(iReview + 1, iSummary), [
    "experiment_planning",
    "experiment_execution",
    "experiment_review"
  ]);
});

test("isResearchPhase accepts the three experiment phases", () => {
  assert.equal(isResearchPhase("experiment_planning"), true);
  assert.equal(isResearchPhase("experiment_execution"), true);
  assert.equal(isResearchPhase("experiment_review"), true);
});

test("createArtifact accepts the three experiment artifact types", () => {
  for (const type of ["experiment_plan", "experiment_run", "experiment_review"]) {
    const artifact = createArtifact({ projectId: "p", phase: "experiment_execution", type, workflow: "w", content: {} });
    assert.equal(artifact.type, type);
  }
});
