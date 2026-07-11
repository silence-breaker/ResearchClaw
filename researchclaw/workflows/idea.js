import { createArtifact, producerFields } from "../evidence/types.js";

export async function runIdeaWorkflow({
  adapter,
  projectId,
  contract,
  baseline,
  paperCards,
  checklist,
  inputRefs = [],
  evidenceRefs = []
}) {
  const result = await adapter.run({
    task_id: "idea_generation",
    project_id: projectId,
    phase: "idea_generation",
    instructions: "Generate ideas only after contract, literature, baseline, and checklist artifacts exist.",
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
        ref: "paper_cards",
        type: "paper_cards",
        content: paperCards
      },
      {
        ref: "reproduction_checklist",
        type: "reproduction_checklist",
        content: checklist
      }
    ],
    output_schema: "IdeaCard[]"
  });
  if (!result.ok) {
    throw new Error(result.error?.message || "idea generation failed");
  }
  const p = producerFields(result);
  return createArtifact({
    projectId,
    phase: "idea_generation",
    type: "idea_cards",
    workflow: "idea",
    adapter: p.adapter,
    cli: p.cli,
    model: p.model,
    windowId: p.windowId,
    inputRefs,
    evidenceRefs,
    content: result.output
  });
}
