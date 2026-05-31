import { createArtifact } from "../evidence/types.js";

export async function runContractDraftWorkflow({ adapter, projectId, userText, inputRefs = [], evidenceRefs = [] }) {
  const result = await adapter.run({
    task_id: "contract_draft",
    project_id: projectId,
    phase: "contract_draft",
    instructions: "Draft a machine-checkable research contract.",
    inputs: [
      {
        ref: "user_text",
        type: "research_direction",
        content: userText
      }
    ],
    output_schema: "ResearchContractV1"
  });
  if (!result.ok) {
    throw new Error(result.error?.message || "contract draft failed");
  }
  return createArtifact({
    projectId,
    phase: "contract_draft",
    type: "contract",
    workflow: "contractDraft",
    adapter: result.adapter,
    inputRefs,
    evidenceRefs,
    content: result.output,
    status: "draft"
  });
}
