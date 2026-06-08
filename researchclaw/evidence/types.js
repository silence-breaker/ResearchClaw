import { makeId, nowIso } from "../util.js";

const artifactTypes = new Set([
  "contract",
  "paper_cards",
  "baseline_decision",
  "reproduction_checklist",
  "idea_cards",
  "idea_review_report",
  "summary",
  "raw_log",
  // M3: a human-promoted consult turn. Lives in the evidence store for
  // traceability + honest attribution, but is NEVER a gated conclusion and is
  // excluded from claim_evidence (两通道红线). See M3技术路线-后端 §6.
  "consult_note"
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
