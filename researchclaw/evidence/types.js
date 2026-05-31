import { makeId, nowIso } from "../util.js";

const artifactTypes = new Set([
  "contract",
  "paper_cards",
  "baseline_decision",
  "reproduction_checklist",
  "idea_cards",
  "idea_review_report",
  "summary",
  "raw_log"
]);

export function createArtifact({
  projectId,
  phase,
  type,
  workflow,
  adapter = "mock",
  inputRefs = [],
  evidenceRefs = [],
  content,
  status = "accepted"
}) {
  if (!artifactTypes.has(type)) {
    throw new Error(`Unsupported artifact type: ${type}`);
  }
  return {
    artifact_id: makeId(`artifact_${type}`),
    project_id: projectId,
    phase,
    type,
    created_at: nowIso(),
    producer: {
      workflow,
      adapter
    },
    input_refs: inputRefs,
    evidence_refs: evidenceRefs,
    content,
    status
  };
}
