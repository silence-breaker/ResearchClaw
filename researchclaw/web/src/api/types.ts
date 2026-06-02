// Mirrors the backend data contract (M1技术路线-前端详化 §4.1). Engine is the
// single source of truth — do not add UI-only fields here; add them in the
// backend with tests first.

export type ResearchPhase =
  | "idle"
  | "intake"
  | "contract_draft"
  | "contract_review"
  | "literature_scouting"
  | "baseline_selection"
  | "baseline_reproduction_checklist"
  | "idea_generation"
  | "idea_review"
  | "summary"
  | "blocked";

export type GateResult = "pass" | "fail" | "manual";

export interface PhaseHistoryEntry {
  phase: ResearchPhase;
  artifact_refs: string[];
  gate_result: GateResult;
  timestamp: string;
}

export interface SignalRef {
  id: string;
  intent: string;
  event: string;
  routeKey: string;
  timestamp: string;
  rawPayloadRef: string;
}

export type PendingAction =
  | { type: "provide_research_direction"; target: string; label: string }
  | {
      type: "approve_or_revise";
      target: "contract";
      artifact_id: string;
      artifact_ref: string;
      label: string;
    }
  | { type: "run_phase"; phase: ResearchPhase; label: string }
  | {
      type: "revise_required";
      phase: ResearchPhase;
      retreat_to?: ResearchPhase;
      errors: string[];
      label: string;
    }
  | { type: "next_human_action"; description: string }
  | { type: string; [k: string]: unknown };

export interface ProjectCurrent {
  research_direction?: string;
  intake_artifact_ref?: string;
  contract_artifact_ref?: string;
  contract_artifact_id?: string;
  literature_artifact_ref?: string;
  baseline_artifact_ref?: string;
  checklist_artifact_ref?: string;
  idea_artifact_ref?: string;
  review_artifact_ref?: string;
  summary_artifact_ref?: string;
  raw_log_artifact_refs?: string[];
}

export interface ProjectBlock {
  failed_phase: ResearchPhase;
  retreat_to?: ResearchPhase;
  errors: string[];
}

export interface ProjectState {
  state_version: number;
  project_id: string;
  phase: ResearchPhase;
  created_at: string;
  updated_at: string;
  current: ProjectCurrent;
  pending_human_actions: PendingAction[];
  phase_history: PhaseHistoryEntry[];
  signals: SignalRef[];
  contract_versions: { version: number; artifact_ref: string; status: string }[];
  latest_signal_id?: string;
  block?: ProjectBlock;
}

export interface ProjectSummary {
  project_id: string;
  phase: ResearchPhase;
  updated_at: string;
  pending_human_actions: PendingAction[];
}

export type ArtifactType =
  | "contract"
  | "paper_cards"
  | "baseline_decision"
  | "reproduction_checklist"
  | "idea_cards"
  | "idea_review_report"
  | "summary"
  | "raw_log";

export interface Artifact<T = unknown> {
  artifact_id: string;
  project_id: string;
  phase: ResearchPhase;
  type: ArtifactType;
  created_at: string;
  producer: { workflow: string; adapter: "mock" | "claude" | "gemini" | "codex" | "manual" };
  input_refs: string[];
  evidence_refs: string[];
  content: T;
  status: "draft" | "accepted" | "rejected" | "superseded";
}

export interface EvidenceIndexEntry {
  claim_id: string;
  claim: string;
  satisfied: { evidence: string; artifact_ref: string }[];
  pending: { evidence: string; reason: string }[];
}

// Shape of an approved/draft research contract's content (subset we render).
export interface ResearchContract {
  contract_id?: string;
  version?: number;
  topic?: string;
  research_question?: string;
  hypothesis?: string;
  success_criteria?: string[];
  failure_signals?: string[];
  metrics?: { name: string; direction?: string }[];
  data_split?: Record<string, unknown> | string;
  claim_evidence_map?: { claim_id: string; claim: string; required_evidence: string[] }[];
  human_notes?: string;
}
