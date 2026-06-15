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
  | { type: "phase_running"; phase: ResearchPhase; label: string }
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
  consult_note_refs?: string[];
  phase_started_at?: string;
}

export interface ProjectBlock {
  failed_phase: ResearchPhase;
  retreat_to?: ResearchPhase;
  errors: string[];
}

// Session-level CLI usage, mirrored from the backend CostTracker snapshot. Rides
// the SSE snapshot (state.usage); absent until a real CLI run happens.
export interface BudgetStatus {
  limit: number | null;
  spent: number;
  ratio: number | null;
  state: "ok" | "warn" | "over";
}

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  est_cost_usd: number;
  cli_calls: number;
  cli_failures: number;
  by_phase?: Record<string, { input_tokens: number; output_tokens: number; cli_calls: number; cli_failures: number }>;
  budget?: BudgetStatus;
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
  usage?: UsageSummary;
  consult?: ConsultState;
}

// One process-feed event from a CLI run (SSE `cli_chunk`). Process channel only —
// never a conclusion (两通道红线). `degraded` marks an auto-fallback to mock.
// `kind:"consult"` routes the chunk to the consult chat view instead of the
// workflow process feed (workflow chunks carry no kind). See M3技术路线-前端 §3.1.
export interface CliChunk {
  phase?: string;
  role: string;
  text?: string;
  tool?: string;
  ts: string;
  degraded?: boolean;
  kind?: "consult" | "workflow";
}

// SSE `consult_message`: one consult turn settled (ok) or failed. The panel uses
// it to replace the streaming placeholder. M3技术路线-前端 §2.
export interface ConsultMessage {
  ok: boolean;
  raw_log_ref?: string;
  question: string;
  answer_summary?: string;
  session_id?: string;
  error?: { code: string; message: string };
  ts: string;
}

// Per-project consult thread metadata (rides the SSE snapshot). NEVER research
// state — it does not participate in phase/gate/evidence. M3技术路线-后端 §4.
export interface ConsultState {
  session_id: string | null;
  turn_count: number;
  last_turn_at?: string;
  raw_log_refs: string[];
}

// Defensive shape for a CLI transcript raw_log artifact's content. Every field is
// optional — render must tolerate older/leaner raw_logs.
export interface CliRawLogSummary {
  model?: string;
  time?: string;
  role?: string;
  summary?: string;
  artifact_refs?: string[];
  transcript_ref?: string;
  question?: string;
  answer_text?: string;
  session_id?: string;
}

export interface ProjectSummary {
  project_id: string;
  phase: ResearchPhase;
  updated_at: string;
  pending_human_actions: PendingAction[];
  archived?: boolean;
}

export interface HealthStatus {
  ok: boolean;
  service?: string;
  projects?: number;
}

// V3-M1: sanitized provider status from API.md claude/codex/gemini section.
export type CliProvider = "claude" | "gemini" | "codex" | "mock";
export type CliId = "claude-code" | "gemini-cli" | "codex-cli" | "mock";

export interface ProviderStatus {
  id: CliProvider;
  configured: boolean;
  baseUrlHost: string;
  models: string[];
}

// V3-M1: CLI binary availability on the server host.
export interface CliStatus {
  id: CliId;
  provider: CliProvider;
  available: boolean;
  command: string;
}

export interface PhaseCliEntry {
  provider: CliProvider;
  cli: CliId;
  model?: string;
}

export interface PhaseCliPolicyResponse {
  ok: boolean;
  policy: Partial<Record<ResearchPhase, PhaseCliEntry>>;
  defaults: Partial<Record<ResearchPhase, PhaseCliEntry>>;
  fallbackPolicy: Partial<Record<ResearchPhase, PhaseCliEntry>>;
}

export type ArtifactType =
  | "contract"
  | "paper_cards"
  | "baseline_decision"
  | "reproduction_checklist"
  | "idea_cards"
  | "idea_review_report"
  | "summary"
  | "raw_log"
  | "consult_note";

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

// Read-only preview from GET /projects/:id/evidence — live claimEvidenceGate
// output. ready:false before a contract exists (nothing to map yet).
export interface EvidencePreview {
  ready: boolean;
  gate_ok?: boolean;
  evidence_index: EvidenceIndexEntry[];
  reason?: string;
}

// A success criterion / failure signal entry (backend shape, not a bare string).
export interface ContractCriterion {
  id: string;
  description: string;
  metric?: string;
  threshold?: string;
}

// Shape of an approved/draft research contract's content (subset we render).
export interface ResearchContract {
  contract_id?: string;
  version?: number;
  topic?: string;
  research_question?: string;
  hypothesis?: string;
  success_criteria?: ContractCriterion[];
  failure_signals?: ContractCriterion[];
  metrics?: { name: string; direction?: string; reason?: string }[];
  data_split?: Record<string, unknown> | string;
  claim_evidence_map?: { claim_id: string; claim: string; required_evidence: string[] }[];
  human_notes?: string;
}
