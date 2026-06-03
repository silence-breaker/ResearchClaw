import { createArtifact } from "../evidence/types.js";

export async function runBaselineWorkflow({
  adapter,
  projectId,
  contract,
  paperCards,
  inputRefs = [],
  evidenceRefs = []
}) {
  const result = await adapter.run({
    task_id: "baseline_selection",
    project_id: projectId,
    phase: "baseline_selection",
    instructions: "Select a reproducible baseline before any idea generation.",
    inputs: [
      {
        ref: "approved_contract",
        type: "research_contract",
        content: contract
      },
      {
        ref: "paper_cards",
        type: "paper_cards",
        content: paperCards
      }
    ],
    output_schema: "BaselineDecision"
  });
  if (!result.ok) {
    throw new Error(result.error?.message || "baseline selection failed");
  }
  return createArtifact({
    projectId,
    phase: "baseline_selection",
    type: "baseline_decision",
    workflow: "baseline",
    adapter: result.adapter,
    inputRefs,
    evidenceRefs,
    content: result.output
  });
}

export async function runReproductionChecklistWorkflow({
  adapter,
  projectId,
  contract,
  baseline,
  inputRefs = [],
  evidenceRefs = []
}) {
  const result = await adapter.run({
    task_id: "baseline_reproduction_checklist",
    project_id: projectId,
    phase: "baseline_reproduction_checklist",
    instructions: "Create a baseline reproduction checklist before idea generation.",
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
      }
    ],
    output_schema: "ReproductionChecklist"
  });
  if (!result.ok) {
    throw new Error(result.error?.message || "reproduction checklist failed");
  }
  return createArtifact({
    projectId,
    phase: "baseline_reproduction_checklist",
    type: "reproduction_checklist",
    workflow: "baselineReproductionChecklist",
    adapter: result.adapter,
    inputRefs,
    evidenceRefs,
    content: result.output
  });
}
