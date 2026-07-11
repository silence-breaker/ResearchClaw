import { createArtifact, producerFields } from "../evidence/types.js";

export async function runSummaryWorkflow({
  adapter,
  projectId,
  state,
  review,
  evidenceIndex = [],
  inputRefs = [],
  evidenceRefs = []
}) {
  const result = await adapter.run({
    task_id: "summary",
    project_id: projectId,
    phase: "summary",
    instructions: "Summarize only claims backed by stored artifact references.",
    inputs: [
      {
        ref: "state",
        type: "state",
        content: state
      },
      {
        ref: "idea_review_report",
        type: "idea_review_report",
        content: review
      },
      {
        ref: "evidence_index",
        type: "evidence_index",
        content: evidenceIndex
      }
    ],
    output_schema: "DemoSummary"
  });
  if (!result.ok) {
    throw new Error(result.error?.message || "summary failed");
  }
  const p = producerFields(result);
  return createArtifact({
    projectId,
    phase: "summary",
    type: "summary",
    workflow: "summary",
    adapter: p.adapter,
    cli: p.cli,
    model: p.model,
    windowId: p.windowId,
    inputRefs,
    evidenceRefs,
    content: result.output
  });
}
