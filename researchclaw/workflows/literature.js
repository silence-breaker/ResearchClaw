import { createArtifact, producerFields } from "../evidence/types.js";

export async function runLiteratureWorkflow({ adapter, projectId, contract, inputRefs = [], evidenceRefs = [] }) {
  const result = await adapter.run({
    task_id: "literature_scouting",
    project_id: projectId,
    phase: "literature_scouting",
    instructions: "Scout relevant papers and baseline candidates.",
    inputs: [
      {
        ref: "approved_contract",
        type: "research_contract",
        content: contract
      }
    ],
    output_schema: "PaperCard[]"
  });
  if (!result.ok) {
    throw new Error(result.error?.message || "literature scouting failed");
  }
  const p = producerFields(result);
  return createArtifact({
    projectId,
    phase: "literature_scouting",
    type: "paper_cards",
    workflow: "literature",
    adapter: p.adapter,
    cli: p.cli,
    model: p.model,
    windowId: p.windowId,
    inputRefs,
    evidenceRefs,
    content: result.output
  });
}
