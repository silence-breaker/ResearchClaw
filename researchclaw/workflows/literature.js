import { createArtifact } from "../evidence/types.js";

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
  return createArtifact({
    projectId,
    phase: "literature_scouting",
    type: "paper_cards",
    workflow: "literature",
    adapter: result.adapter,
    inputRefs,
    evidenceRefs,
    content: result.output
  });
}
