import { createArtifact } from "../evidence/types.js";

export async function runReviewWorkflow({
  adapter,
  projectId,
  contract,
  baseline,
  ideas,
  inputRefs = [],
  evidenceRefs = []
}) {
  const result = await adapter.run({
    task_id: "idea_review",
    project_id: projectId,
    phase: "idea_review",
    instructions: "Independently review each idea for novelty, feasibility, reproducibility, and evidence consistency.",
    inputs: [
      {
        ref: "approved_contract",
        type: "research_contract",
        content: contract
      },
      {
        ref: "baseline_decision",
        type: "baseline_decision",
        content: baseline
      },
      {
        ref: "idea_cards",
        type: "idea_cards",
        content: ideas
      }
    ],
    output_schema: "IdeaReviewReport"
  });
  if (!result.ok) {
    throw new Error(result.error?.message || "idea review failed");
  }
  return createArtifact({
    projectId,
    phase: "idea_review",
    type: "idea_review_report",
    workflow: "review",
    adapter: result.adapter,
    inputRefs,
    evidenceRefs,
    content: result.output
  });
}
