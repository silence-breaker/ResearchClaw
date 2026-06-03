import { createArtifact } from "../evidence/types.js";

export async function runContractDraftWorkflow({
  adapter,
  projectId,
  userText,
  previousContract,
  feedback,
  inputRefs = [],
  evidenceRefs = []
}) {
  const inputs = [
    {
      ref: "user_text",
      type: "research_direction",
      content: userText
    }
  ];
  if (previousContract) {
    inputs.push({ ref: "previous_contract", type: "research_contract", content: previousContract });
  }
  if (feedback) {
    inputs.push({ ref: "revision_feedback", type: "revision_feedback", content: feedback });
  }
  const result = await adapter.run({
    task_id: "contract_draft",
    project_id: projectId,
    phase: "contract_draft",
    instructions: feedback
      ? "Revise the research contract to address the human feedback, keeping it machine-checkable."
      : "Draft a machine-checkable research contract.",
    inputs,
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
