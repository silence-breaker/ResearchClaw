import { createArtifact, producerFields } from "../evidence/types.js";

export async function runExperimentPlanningWorkflow({
  adapter,
  projectId,
  contract,
  literature,
  baseline,
  checklist,
  ideas,
  review,
  inputRefs = [],
  evidenceRefs = []
}) {
  const result = await adapter.run({
    task_id: "experiment_planning",
    project_id: projectId,
    phase: "experiment_planning",
    instructions:
      "Design a concrete, runnable experiment that validates the recommended idea against the selected baseline. Commands must run in the project workdir with relative paths only.",
    inputs: [
      { ref: "approved_contract", type: "research_contract", content: contract },
      { ref: "paper_cards", type: "paper_cards", content: literature },
      { ref: "baseline_decision", type: "baseline_decision", content: baseline },
      { ref: "reproduction_checklist", type: "reproduction_checklist", content: checklist },
      { ref: "idea_cards", type: "idea_cards", content: ideas },
      { ref: "idea_review_report", type: "idea_review_report", content: review }
    ],
    output_schema: "ExperimentPlanV1"
  });
  if (!result.ok) {
    throw new Error(result.error?.message || "experiment planning failed");
  }
  const p = producerFields(result);
  return createArtifact({
    projectId,
    phase: "experiment_planning",
    type: "experiment_plan",
    workflow: "experimentPlanning",
    adapter: p.adapter,
    cli: p.cli,
    model: p.model,
    windowId: p.windowId,
    inputRefs,
    evidenceRefs,
    content: result.output
  });
}
