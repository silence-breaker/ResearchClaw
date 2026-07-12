import { createArtifact, producerFields } from "../evidence/types.js";

export async function runExperimentReviewWorkflow({
  adapter,
  projectId,
  plan,
  run,
  runRef,
  contract,
  ideas,
  review,
  inputRefs = [],
  evidenceRefs = []
}) {
  const result = await adapter.run({
    task_id: "experiment_review",
    project_id: projectId,
    phase: "experiment_review",
    instructions:
      "Judge whether the experiment run supports each claim. Reference the run and specific metrics. Be honest: a failed or inconclusive run must not be marked as supporting.",
    inputs: [
      { ref: "experiment_plan", type: "experiment_plan", content: plan },
      { ref: "experiment_run", type: "experiment_run", content: run },
      { ref: "approved_contract", type: "research_contract", content: contract },
      { ref: "idea_cards", type: "idea_cards", content: ideas },
      { ref: "idea_review_report", type: "idea_review_report", content: review }
    ],
    output_schema: "ExperimentReviewV1"
  });
  if (!result.ok) {
    throw new Error(result.error?.message || "experiment review failed");
  }
  const p = producerFields(result);
  return createArtifact({
    projectId,
    phase: "experiment_review",
    type: "experiment_review",
    workflow: "experimentReview",
    adapter: p.adapter,
    cli: p.cli,
    model: p.model,
    windowId: p.windowId,
    inputRefs,
    evidenceRefs,
    // Honest attribution: the run_ref in the artifact points at the actual run
    // artifact, overriding any placeholder the model/mock emitted.
    content: { ...result.output, run_ref: runRef }
  });
}
