import { nowIso } from "../util.js";

export function createInitialState(projectId) {
  const timestamp = nowIso();
  return {
    state_version: 1,
    project_id: projectId,
    phase: "idle",
    created_at: timestamp,
    updated_at: timestamp,
    current: {},
    pending_human_actions: [],
    phase_history: [],
    signals: [],
    contract_versions: []
  };
}

export function touchState(state) {
  state.updated_at = nowIso();
  return state;
}

export function recordSignal(state, signal) {
  state.latest_signal_id = signal.id;
  state.signals.push({
    id: signal.id,
    intent: signal.intent,
    event: signal.event,
    routeKey: signal.routeKey,
    timestamp: signal.timestamp,
    rawPayloadRef: signal.rawPayloadRef
  });
}

export function recordPhase(state, phase, artifactRefs, gateResult) {
  state.phase_history.push({
    phase,
    artifact_refs: artifactRefs,
    gate_result: gateResult,
    timestamp: nowIso()
  });
}
