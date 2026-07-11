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
  cli = null,
  model = null,
  windowId = null,
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
    producer: { workflow, adapter, cli, model, windowId },
    input_refs: inputRefs,
    evidence_refs: evidenceRefs,
    content,
    status
  };
}

// 从 router 结果算出诚实的 producer 归属。非降级：cli/model 取自 source（= 实跑）。
// 降级：实际跑的是 mock，故 cli/model 归 mock（null），但 windowId 仍保留以便追溯
// 「这个窗口本该是某 provider、降级成了 mock」。
export function producerFields(result) {
  const src = result?.source || {};
  if (result?.degraded) {
    return { adapter: "mock", cli: "mock", model: null, windowId: src.windowId ?? null };
  }
  return {
    adapter: result?.adapter ?? "mock",
    cli: src.cli ?? null,
    model: src.model ?? null,
    windowId: src.windowId ?? null
  };
}
