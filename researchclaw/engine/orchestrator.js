import { join } from "node:path";
import { approveContract } from "../contract/contract.js";
import { MockModelAdapter } from "../adapters/mock.js";
import { createArtifact } from "../evidence/types.js";
import { makeId, nowIso, publicStateSummary, redactSecrets } from "../util.js";
import { runBaselineWorkflow, runReproductionChecklistWorkflow } from "../workflows/baseline.js";
import { runContractDraftWorkflow } from "../workflows/contractDraft.js";
import { runIdeaWorkflow } from "../workflows/idea.js";
import { runLiteratureWorkflow } from "../workflows/literature.js";
import { runReviewWorkflow } from "../workflows/review.js";
import { runSummaryWorkflow } from "../workflows/summary.js";
import { runExperimentPlanningWorkflow } from "../workflows/experimentPlanning.js";
import { runExperimentExecutionWorkflow } from "../workflows/experimentExecution.js";
import { runExperimentReviewWorkflow } from "../workflows/experimentReview.js";
import { touchState, recordPhase, recordSignal } from "./state.js";
import {
  baselineGate,
  claimEvidenceGate,
  contractGate,
  evidenceGate,
  experimentPlanGate,
  experimentReviewGate,
  experimentRunGate,
  ideaGate,
  literatureGate,
  reproductionChecklistGate,
  reviewGate
} from "./gates.js";

// state.current ref key -> artifact type, used to tell claimEvidenceGate what evidence exists.
const artifactTypeByStateKey = {
  contract_artifact_ref: "contract",
  literature_artifact_ref: "paper_cards",
  baseline_artifact_ref: "baseline_decision",
  checklist_artifact_ref: "reproduction_checklist",
  idea_artifact_ref: "idea_cards",
  review_artifact_ref: "idea_review_report",
  experiment_plan_artifact_ref: "experiment_plan",
  experiment_run_artifact_ref: "experiment_run",
  experiment_review_artifact_ref: "experiment_review"
};

const phaseRunLabels = {
  literature_scouting: "Run literature scouting",
  baseline_selection: "Run baseline selection",
  baseline_reproduction_checklist: "Run reproduction checklist",
  idea_generation: "Run idea generation",
  idea_review: "Run idea review",
  experiment_planning: "Plan experiment",
  experiment_execution: "确认并执行实验命令",
  experiment_review: "Review experiment result",
  summary: "Write summary"
};

// When a phase gate fails, which re-runnable upstream phase to fall back to.
// blocked stays the visible state, but it carries this target so recover() can leave it.
const retreatTargets = {
  contract_draft: "contract_draft",
  literature_scouting: "literature_scouting",
  baseline_selection: "literature_scouting",
  baseline_reproduction_checklist: "baseline_selection",
  idea_generation: "idea_generation",
  idea_review: "idea_generation",
  experiment_planning: "idea_review",
  experiment_execution: "experiment_planning",
  experiment_review: "experiment_execution",
  summary: "experiment_review"
};

function setRunPhaseAction(state, phase) {
  state.pending_human_actions = [
    {
      type: "run_phase",
      phase,
      label: phaseRunLabels[phase] || `Run ${phase}`
    }
  ];
}

export class ResearchOrchestrator {
  constructor({ store, adapter = new MockModelAdapter(), eventBus = null, costTracker = null }) {
    this.store = store;
    this.adapter = adapter;
    this.eventBus = eventBus;
    this.costTracker = costTracker;
    // Per-project background contract run: promise (re-entrancy guard) + the
    // pending run context (draft vs revise inputs) set by begin*, read by execute.
    this.inflight = new Map();
    this.pendingRun = new Map();
    // Per-project consult turn chain: serializes executeConsult so multi-turn
    // --resume context stays ordered (M3技术路线-后端 §4). In-memory.
    this.consultChain = new Map();
    // Last persisted phase per project, so finish() can stamp
    // current.phase_started_at only when the phase actually changes (M4 §6). In-memory.
    this.lastPhase = new Map();
  }

  // Stamps current.phase_started_at when the phase changed since the last write,
  // so the panel can show "当前阶段已用时". consult metadata writes don't change
  // state.phase, so they never reset the timer.
  stampPhaseStart(state) {
    if (this.lastPhase.get(state.project_id) !== state.phase) {
      state.current = state.current || {};
      state.current.phase_started_at = nowIso();
      this.lastPhase.set(state.project_id, state.phase);
    }
  }

  // Lands a CLI transcript (process channel) as a raw_log artifact and records
  // its ref on state. The full transcript is redacted + saved as a raw payload;
  // the artifact content is the structured summary + a transcript_ref. This is
  // process transparency only — never a conclusion (两通道红线 §2.1).
  landCliRawLog(state, raw, phase, sourceRef, producer = { adapter: "mock", cli: null, model: null, windowId: null }) {
    if (!raw) {
      return;
    }
    const transcriptRef = this.store.saveRawPayload(state.project_id, `${phase}-transcript`, {
      transcript: raw.transcript
    });
    const artifact = createArtifact({
      projectId: state.project_id,
      phase,
      type: "raw_log",
      workflow: "cli_transcript",
      adapter: producer.adapter,
      cli: producer.cli,
      model: producer.model,
      windowId: producer.windowId,
      inputRefs: [sourceRef].filter(Boolean),
      evidenceRefs: [],
      content: redactSecrets({
        ...raw.summary,
        provider: producer.adapter,
        cli: producer.cli,
        model: producer.model,
        window_id: producer.windowId,
        transcript_ref: transcriptRef
      })
    });
    const ref = this.store.appendArtifact(artifact);
    state.current.raw_log_artifact_refs = [...(state.current.raw_log_artifact_refs || []), ref];
  }

  persistUsage(state) {
    if (this.costTracker) {
      state.usage = this.costTracker.snapshot(state.project_id);
    }
  }

  emitSnapshot(state) {
    if (!this.eventBus) {
      return;
    }
    this.eventBus.emit(state.project_id, { type: "snapshot", data: state });
  }

  async handle(signal) {
    this.store.ensureProject(signal.projectId);
    const state = this.store.readState(signal.projectId);
    recordSignal(state, signal);

    switch (signal.intent) {
      case "start_or_resume":
        return this.finish(state, signal, ["project_ready"]);
      case "start_research": {
        // Async like the dashboard /start: ack fast, draft in the background so
        // the OpenClaw hook doesn't block ~38s on a real CLI run (M4技术路线-后端 §7).
        const ack = this.beginResearch(state, signal);
        if (ack.needs_draft) {
          this.executeContractRun(signal.projectId).catch(() => {});
        }
        return ack;
      }
      case "human_feedback":
        state.pending_human_actions = state.pending_human_actions.length
          ? state.pending_human_actions
          : [{ type: "human_feedback_received", target: "unknown" }];
        return this.finish(state, signal, ["human_feedback_recorded"]);
      case "record_tool_result":
        this.recordRawLogArtifact(state, signal, "tool_result");
        return this.finish(state, signal, ["tool_result_recorded"]);
      case "checkpoint":
        this.recordRawLogArtifact(state, signal, "checkpoint");
        return this.finish(state, signal, ["checkpoint_written"]);
      case "noop":
      default:
        return this.finish(state, signal, ["noop"]);
    }
  }

  async startFromText(projectId, userText, metadata = {}) {
    this.store.ensureProject(projectId);
    const rawPayloadRef = this.store.saveRawPayload(projectId, "manual-start", {
      source: "manual",
      userText,
      metadata,
      timestamp: nowIso()
    });
    const signal = {
      id: makeId("sig"),
      source: "manual",
      intent: "start_research",
      event: "manual-start",
      routeKey: "manual.start",
      priority: "high",
      timestamp: nowIso(),
      projectId,
      userText,
      rawPayloadRef
    };
    const state = this.store.readState(projectId);
    recordSignal(state, signal);
    return this.startResearch(state, signal);
  }

  // Intake step: records the manual intake artifact and either marks the project
  // ready (research direction provided) or awaiting one. Mutates state; no write.
  _intake(state, signal) {
    const userText = signal.userText?.trim();
    state.current = {};
    state.pending_human_actions = [];
    state.phase = "intake";
    const intakeArtifact = createArtifact({
      projectId: state.project_id,
      phase: "intake",
      type: "raw_log",
      workflow: "intake",
      adapter: "manual",
      inputRefs: [signal.rawPayloadRef],
      evidenceRefs: [signal.rawPayloadRef],
      content: {
        user_text: userText || null,
        intake_status: userText ? "ready" : "awaiting_research_direction",
        source_signal_id: signal.id
      }
    });
    const intakeRef = this.store.appendArtifact(intakeArtifact);
    state.current.intake_artifact_ref = intakeRef;
    state.current.intake_raw_ref = signal.rawPayloadRef;
    if (userText) {
      state.current.research_direction = userText;
      recordPhase(state, "intake", [intakeRef], "pass");
      return { ready: true, intakeRef };
    }
    state.pending_human_actions = [
      { type: "provide_research_direction", target: "intake", label: "Enter research direction" }
    ];
    recordPhase(state, "intake", [intakeRef], "manual");
    return { ready: false, intakeRef };
  }

  _runDraftWorkflow(state, { intakeRef, evidenceRef }) {
    return runContractDraftWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      userText: state.current.research_direction,
      inputRefs: [intakeRef],
      evidenceRefs: [evidenceRef]
    });
  }

  _runReviseWorkflow(state, { currentRef, currentContract, feedback }) {
    return runContractDraftWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      userText: state.current.research_direction,
      previousContract: currentContract,
      feedback,
      inputRefs: [currentRef],
      evidenceRefs: [currentRef]
    });
  }

  // Commits a draft/revise workflow result: appends the contract + CLI raw_log,
  // runs the gate, and transitions to contract_review (pass) or blocked (fail).
  // Returns true on pass. Mutates state; the caller writes.
  _commitDraft(state, { contract: draftArtifact, raw, producer }) {
    const gate = contractGate(draftArtifact.content);
    const draftRef = this.store.appendArtifact(draftArtifact);
    state.current.contract_artifact_ref = draftRef;
    state.current.contract_artifact_id = draftArtifact.artifact_id;
    this.landCliRawLog(state, raw, "contract_draft", draftRef, producer);
    state.contract_versions.push({
      version: draftArtifact.content.version,
      artifact_ref: draftRef,
      status: draftArtifact.status
    });
    if (!gate.ok) {
      this.blockWithoutWrite(state, "contract_draft", [draftRef], gate.errors);
      return false;
    }
    recordPhase(state, "contract_draft", [draftRef], "pass");
    state.phase = "contract_review";
    state.pending_human_actions = [
      {
        type: "approve_or_revise",
        target: "contract",
        artifact_id: draftArtifact.artifact_id,
        artifact_ref: draftRef,
        label: "Approve or revise contract"
      }
    ];
    recordPhase(state, "contract_review", [draftRef], "manual");
    return true;
  }

  // Synchronous full start (used by the OpenClaw hook path + startFromText). The
  // async dashboard path uses beginDraftFromText + executeContractRun instead.
  async startResearch(state, signal) {
    const { ready, intakeRef } = this._intake(state, signal);
    if (!ready) {
      return this.finish(state, signal, ["researchclaw_panel_ready", "research_direction_required"]);
    }
    state.phase = "contract_draft";
    const result = await this._runDraftWorkflow(state, { intakeRef, evidenceRef: signal.rawPayloadRef });
    const ok = this._commitDraft(state, result);
    return this.finish(state, signal, ok ? ["human_approval_required"] : ["blocked"]);
  }

  // Async hook path: intake + mark running, return a fast ack. The caller
  // schedules executeContractRun in the background. Reuses the dashboard's
  // begin/execute machinery but works from an already-recorded hook signal.
  beginResearch(state, signal) {
    const { ready } = this._intake(state, signal);
    if (!ready) {
      return this.finish(state, signal, ["researchclaw_panel_ready", "research_direction_required"]);
    }
    this.eventBus?.clearCliChunks?.(state.project_id);
    this.pendingRun.set(state.project_id, { kind: "draft" });
    state.phase = "contract_draft";
    state.pending_human_actions = [
      { type: "phase_running", phase: "contract_draft", label: "Claude 起草研究契约中…" }
    ];
    const result = this.finish(state, signal, ["contract_draft_running"]);
    return { ...result, needs_draft: true };
  }

  // --- async dashboard path: return a "running" snapshot fast, draft in bg ---

  _startSignal(projectId, userText, metadata) {
    const rawPayloadRef = this.store.saveRawPayload(projectId, "manual-start", {
      source: "manual",
      userText,
      metadata,
      timestamp: nowIso()
    });
    return {
      id: makeId("sig"),
      source: "manual",
      intent: "start_research",
      event: "manual-start",
      routeKey: "manual.start",
      priority: "high",
      timestamp: nowIso(),
      projectId,
      userText,
      rawPayloadRef
    };
  }

  async beginDraftFromText(projectId, userText, metadata = {}) {
    this.store.ensureProject(projectId);
    const signal = this._startSignal(projectId, userText, metadata);
    const state = this.store.readState(projectId);
    recordSignal(state, signal);
    const { ready } = this._intake(state, signal);
    if (!ready) {
      return this.finish(state, signal, ["researchclaw_panel_ready", "research_direction_required"]);
    }
    this.eventBus?.clearCliChunks?.(projectId);
    this.pendingRun.set(projectId, { kind: "draft" });
    state.phase = "contract_draft";
    state.pending_human_actions = [
      { type: "phase_running", phase: "contract_draft", label: "Claude 起草研究契约中…" }
    ];
    const result = this.finish(state, signal, ["contract_draft_running"]);
    return { ...result, needs_draft: true };
  }

  async beginRevise(projectId, request) {
    const state = this.store.readState(projectId);
    const { currentRef } = this._validateRevise(state, request);
    this.eventBus?.clearCliChunks?.(projectId);
    this.pendingRun.set(projectId, { kind: "revise", currentRef, feedback: request.feedback });
    state.phase = "contract_draft";
    state.pending_human_actions = [
      { type: "phase_running", phase: "contract_draft", label: "Claude 修订研究契约中…" }
    ];
    const result = this.finishManual(state, ["contract_revise_running"]);
    return { ...result, needs_draft: true };
  }

  // Runs the pending draft/revise in the background. Re-entrancy-guarded so a
  // double-submit (or double executeContractRun) runs the workflow only once.
  executeContractRun(projectId) {
    if (this.inflight.has(projectId)) {
      return this.inflight.get(projectId);
    }
    const run = this._executeContractRun(projectId)
      .catch((err) => this._failContractRun(projectId, err))
      .finally(() => {
        this.inflight.delete(projectId);
        this.pendingRun.delete(projectId);
      });
    this.inflight.set(projectId, run);
    return run;
  }

  async _executeContractRun(projectId) {
    const ctx = this.pendingRun.get(projectId);
    const state = this.store.readState(projectId);
    if (!ctx || state.phase !== "contract_draft") {
      return;
    }
    let result;
    if (ctx.kind === "revise") {
      const currentArtifact = this.store.readArtifact(projectId, ctx.currentRef);
      result = await this._runReviseWorkflow(state, {
        currentRef: ctx.currentRef,
        currentContract: currentArtifact.content,
        feedback: ctx.feedback
      });
    } else {
      result = await this._runDraftWorkflow(state, {
        intakeRef: state.current.intake_artifact_ref,
        evidenceRef: state.current.intake_raw_ref
      });
    }
    this._commitDraft(state, result);
    this.finishManual(state, [ctx.kind === "revise" ? "contract_revised" : "contract_drafted"]);
  }

  _failContractRun(projectId, err) {
    const state = this.store.readState(projectId);
    const retreatTo = retreatTargets.contract_draft;
    state.phase = "blocked";
    state.block = { failed_phase: "contract_draft", retreat_to: retreatTo, errors: [String(err?.message || err)] };
    state.pending_human_actions = [
      {
        type: "revise_required",
        phase: "contract_draft",
        retreat_to: retreatTo,
        errors: state.block.errors,
        label: "契约起草失败，可重新发起"
      }
    ];
    recordPhase(state, "contract_draft", [], "fail");
    this.finishManual(state, ["contract_draft_failed"]);
  }

  async approve(projectId, request) {
    const state = this.store.readState(projectId);
    if (request.target !== "contract") {
      throw new Error("Only contract approval is supported in the first demo");
    }
    const draftRef = state.current.contract_artifact_ref;
    if (!draftRef) {
      throw new Error("No contract artifact is waiting for approval");
    }
    const draftArtifact = this.store.readArtifact(projectId, draftRef);
    if (request.artifact_id && request.artifact_id !== draftArtifact.artifact_id) {
      throw new Error("Approval artifact_id does not match the active contract");
    }
    const approved = approveContract(draftArtifact.content);
    if (!approved.ok) {
      throw new Error(`Contract approval failed: ${approved.errors.join("; ")}`);
    }

    const approvedArtifact = createArtifact({
      projectId,
      phase: "contract_review",
      type: "contract",
      workflow: "manualApproval",
      adapter: "manual",
      inputRefs: [draftRef],
      evidenceRefs: [draftRef],
      content: approved.contract,
      status: "accepted"
    });
    const approvedRef = this.store.appendArtifact(approvedArtifact);
    state.current.contract_artifact_ref = approvedRef;
    state.current.contract_artifact_id = approvedArtifact.artifact_id;
    state.contract_versions.push({
      version: approved.contract.version,
      artifact_ref: approvedRef,
      status: "approved"
    });
    recordPhase(state, "contract_review", [approvedRef], "pass");

    state.phase = "literature_scouting";
    setRunPhaseAction(state, "literature_scouting");
    return this.finishManual(state, ["contract_approved", "run_literature_scouting"]);
  }

  _validateRevise(state, request) {
    if (request.target !== "contract") {
      throw new Error("Only contract revision is supported in the first demo");
    }
    if (!request.feedback || !request.feedback.trim()) {
      throw new Error("Revision feedback is required");
    }
    const currentRef = state.current.contract_artifact_ref;
    if (!currentRef) {
      throw new Error("No contract artifact is available for revision");
    }
    const currentArtifact = this.store.readArtifact(state.project_id, currentRef);
    if (request.artifact_id && request.artifact_id !== currentArtifact.artifact_id) {
      throw new Error("Revision artifact_id does not match the active contract");
    }
    return { currentRef, currentArtifact };
  }

  // Synchronous full revise (used directly by tests). The dashboard path uses
  // beginRevise + executeContractRun for a non-blocking, live-streamed run.
  async revise(projectId, request) {
    const state = this.store.readState(projectId);
    const { currentRef, currentArtifact } = this._validateRevise(state, request);
    const result = await this._runReviseWorkflow(state, {
      currentRef,
      currentContract: currentArtifact.content,
      feedback: request.feedback
    });
    const ok = this._commitDraft(state, result);
    return this.finishManual(state, ok ? ["contract_revised", "human_approval_required"] : ["blocked"]);
  }

  async advance(projectId) {
    const state = this.store.readState(projectId);
    switch (state.phase) {
      case "literature_scouting":
        await this.runLiteratureStep(state);
        break;
      case "baseline_selection":
        await this.runBaselineStep(state);
        break;
      case "baseline_reproduction_checklist":
        await this.runChecklistStep(state);
        break;
      case "idea_generation":
        await this.runIdeaStep(state);
        break;
      case "idea_review":
        await this.runReviewStep(state);
        break;
      case "experiment_planning":
        await this.runExperimentPlanningStep(state);
        break;
      case "experiment_execution":
        await this.runExperimentExecutionStep(state);
        break;
      case "experiment_review":
        await this.runExperimentReviewStep(state);
        break;
      case "summary":
        await this.runSummaryStep(state);
        break;
      default:
        throw new Error(`Phase ${state.phase} has no runnable workflow step`);
    }
    return this.finishManual(state, [`advanced_${state.phase}`]);
  }

  async runLiteratureStep(state) {
    const { contract, ref: contractRef } = this.getContract(state);
    const literatureArtifact = await runLiteratureWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      contract,
      inputRefs: [contractRef],
      evidenceRefs: [contractRef]
    });
    const literatureRef = this.store.appendArtifact(literatureArtifact);
    state.current.literature_artifact_ref = literatureRef;
    const check = literatureGate(literatureArtifact.content);
    if (!check.ok) {
      this.blockWithoutWrite(state, "literature_scouting", [literatureRef], check.errors);
      return;
    }
    recordPhase(state, "literature_scouting", [literatureRef], "pass");
    state.phase = "baseline_selection";
    setRunPhaseAction(state, "baseline_selection");
  }

  async runBaselineStep(state) {
    const { contract, ref: contractRef } = this.getContract(state);
    const literature = this.readCurrentArtifact(state, "literature_artifact_ref");
    const baselineArtifact = await runBaselineWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      contract,
      paperCards: literature.content,
      inputRefs: [contractRef, state.current.literature_artifact_ref],
      evidenceRefs: [state.current.literature_artifact_ref]
    });
    const baselineRef = this.store.appendArtifact(baselineArtifact);
    state.current.baseline_artifact_ref = baselineRef;
    const check = baselineGate(baselineArtifact.content, { paperCards: literature.content });
    if (!check.ok) {
      this.blockWithoutWrite(state, "baseline_selection", [baselineRef], check.errors);
      return;
    }
    recordPhase(state, "baseline_selection", [baselineRef], "pass");
    state.phase = "baseline_reproduction_checklist";
    setRunPhaseAction(state, "baseline_reproduction_checklist");
  }

  async runChecklistStep(state) {
    const { contract, ref: contractRef } = this.getContract(state);
    const baseline = this.readCurrentArtifact(state, "baseline_artifact_ref");
    const checklistArtifact = await runReproductionChecklistWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      contract,
      baseline: baseline.content,
      inputRefs: [contractRef, state.current.baseline_artifact_ref],
      evidenceRefs: [state.current.baseline_artifact_ref]
    });
    const checklistRef = this.store.appendArtifact(checklistArtifact);
    state.current.checklist_artifact_ref = checklistRef;
    const check = reproductionChecklistGate(checklistArtifact.content, { contract });
    if (!check.ok) {
      this.blockWithoutWrite(state, "baseline_reproduction_checklist", [checklistRef], check.errors);
      return;
    }
    recordPhase(state, "baseline_reproduction_checklist", [checklistRef], "pass");
    state.phase = "idea_generation";
    setRunPhaseAction(state, "idea_generation");
  }

  async runIdeaStep(state) {
    const { contract, ref: contractRef } = this.getContract(state);
    const literature = this.readCurrentArtifact(state, "literature_artifact_ref");
    const baseline = this.readCurrentArtifact(state, "baseline_artifact_ref");
    const checklist = this.readCurrentArtifact(state, "checklist_artifact_ref");
    const ideaArtifact = await runIdeaWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      contract,
      baseline: baseline.content,
      paperCards: literature.content,
      checklist: checklist.content,
      inputRefs: [
        contractRef,
        state.current.literature_artifact_ref,
        state.current.baseline_artifact_ref,
        state.current.checklist_artifact_ref
      ],
      evidenceRefs: [
        contractRef,
        state.current.literature_artifact_ref,
        state.current.baseline_artifact_ref,
        state.current.checklist_artifact_ref
      ]
    });
    const ideaRef = this.store.appendArtifact(ideaArtifact);
    state.current.idea_artifact_ref = ideaRef;
    const check = ideaGate(ideaArtifact.content);
    if (!check.ok) {
      this.blockWithoutWrite(state, "idea_generation", [ideaRef], check.errors);
      return;
    }
    recordPhase(state, "idea_generation", [ideaRef], "pass");
    state.phase = "idea_review";
    setRunPhaseAction(state, "idea_review");
  }

  async runReviewStep(state) {
    const { contract, ref: contractRef } = this.getContract(state);
    const baseline = this.readCurrentArtifact(state, "baseline_artifact_ref");
    const ideas = this.readCurrentArtifact(state, "idea_artifact_ref");
    const reviewArtifact = await runReviewWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      contract,
      baseline: baseline.content,
      ideas: ideas.content,
      inputRefs: [contractRef, state.current.baseline_artifact_ref, state.current.idea_artifact_ref],
      evidenceRefs: [contractRef, state.current.baseline_artifact_ref, state.current.idea_artifact_ref]
    });
    const reviewRef = this.store.appendArtifact(reviewArtifact);
    state.current.review_artifact_ref = reviewRef;
    const check = reviewGate(reviewArtifact.content, ideas.content);
    if (!check.ok) {
      this.blockWithoutWrite(state, "idea_review", [reviewRef], check.errors);
      return;
    }
    recordPhase(state, "idea_review", [reviewRef], "pass");
    state.phase = "experiment_planning";
    setRunPhaseAction(state, "experiment_planning");
  }

  async runExperimentPlanningStep(state) {
    const { contract, ref: contractRef } = this.getContract(state);
    const literature = this.readCurrentArtifact(state, "literature_artifact_ref");
    const baseline = this.readCurrentArtifact(state, "baseline_artifact_ref");
    const checklist = this.readCurrentArtifact(state, "checklist_artifact_ref");
    const ideas = this.readCurrentArtifact(state, "idea_artifact_ref");
    const review = this.readCurrentArtifact(state, "review_artifact_ref");
    const inputRefs = [
      contractRef,
      state.current.literature_artifact_ref,
      state.current.baseline_artifact_ref,
      state.current.checklist_artifact_ref,
      state.current.idea_artifact_ref,
      state.current.review_artifact_ref
    ];
    const planArtifact = await runExperimentPlanningWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      contract,
      literature: literature.content,
      baseline: baseline.content,
      checklist: checklist.content,
      ideas: ideas.content,
      review: review.content,
      inputRefs,
      evidenceRefs: inputRefs
    });
    const planRef = this.store.appendArtifact(planArtifact);
    state.current.experiment_plan_artifact_ref = planRef;
    const check = experimentPlanGate(planArtifact.content, {
      contract,
      recommendedIdeaId: review.content?.recommended_idea_id
    });
    if (!check.ok) {
      this.blockWithoutWrite(state, "experiment_planning", [planRef], check.errors);
      return;
    }
    recordPhase(state, "experiment_planning", [planRef], "pass");
    state.phase = "experiment_execution";
    // The execution pending action carries the command list so the panel can
    // show exactly what will run before the human confirms (M5b). advance() is
    // the confirm point — the panel POSTs advance to actually run the commands.
    state.pending_human_actions = [
      {
        type: "run_phase",
        phase: "experiment_execution",
        label: phaseRunLabels.experiment_execution,
        commands: Array.isArray(planArtifact.content?.commands) ? planArtifact.content.commands : []
      }
    ];
  }

  async runExperimentExecutionStep(state) {
    const plan = this.readCurrentArtifact(state, "experiment_plan_artifact_ref");
    const planRef = state.current.experiment_plan_artifact_ref;
    const workdir = join(this.store.rootDir, "experiments", state.project_id);
    const runArtifact = await runExperimentExecutionWorkflow({
      store: this.store,
      projectId: state.project_id,
      plan: plan.content,
      planRef,
      workdir,
      eventBus: this.eventBus,
      inputRefs: [planRef],
      evidenceRefs: [planRef]
    });
    const runRef = this.store.appendArtifact(runArtifact);
    state.current.experiment_run_artifact_ref = runRef;
    const check = experimentRunGate(runArtifact.content);
    if (!check.ok) {
      this.blockWithoutWrite(state, "experiment_execution", [runRef], check.errors);
      return;
    }
    // Honest failure proceeds: a failed/blocked-but-structurally-valid run passes
    // the gate and advances to review, where its meaning gets judged.
    recordPhase(state, "experiment_execution", [runRef], "pass");
    state.phase = "experiment_review";
    setRunPhaseAction(state, "experiment_review");
  }

  async runExperimentReviewStep(state) {
    const { contract, ref: contractRef } = this.getContract(state);
    const plan = this.readCurrentArtifact(state, "experiment_plan_artifact_ref");
    const run = this.readCurrentArtifact(state, "experiment_run_artifact_ref");
    const ideas = this.readCurrentArtifact(state, "idea_artifact_ref");
    const review = this.readCurrentArtifact(state, "review_artifact_ref");
    const runRef = state.current.experiment_run_artifact_ref;
    const inputRefs = [
      contractRef,
      state.current.experiment_plan_artifact_ref,
      runRef,
      state.current.idea_artifact_ref,
      state.current.review_artifact_ref
    ];
    const reviewArtifact = await runExperimentReviewWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      plan: plan.content,
      run: run.content,
      runRef,
      contract,
      ideas: ideas.content,
      review: review.content,
      inputRefs,
      evidenceRefs: inputRefs
    });
    const reviewRef = this.store.appendArtifact(reviewArtifact);
    state.current.experiment_review_artifact_ref = reviewRef;
    const check = experimentReviewGate(reviewArtifact.content);
    if (!check.ok) {
      this.blockWithoutWrite(state, "experiment_review", [reviewRef], check.errors);
      return;
    }
    recordPhase(state, "experiment_review", [reviewRef], "pass");
    state.phase = "summary";
    setRunPhaseAction(state, "summary");
  }

  async runSummaryStep(state) {
    const evidenceCheck = evidenceGate(state);
    if (!evidenceCheck.ok) {
      this.blockWithoutWrite(state, "summary", [], evidenceCheck.errors);
      return;
    }
    const { contract } = this.getContract(state);
    const claimCheck = claimEvidenceGate(contract, {
      availableArtifacts: this.availableArtifacts(state),
      completedPhases: state.phase_history
        .filter((entry) => entry.gate_result === "pass")
        .map((entry) => entry.phase)
    });
    if (!claimCheck.ok) {
      this.blockWithoutWrite(state, "summary", [], claimCheck.errors);
      return;
    }
    const review = this.readCurrentArtifact(state, "review_artifact_ref");
    const refs = [
      state.current.contract_artifact_ref,
      state.current.literature_artifact_ref,
      state.current.baseline_artifact_ref,
      state.current.checklist_artifact_ref,
      state.current.idea_artifact_ref,
      state.current.review_artifact_ref,
      state.current.experiment_plan_artifact_ref,
      state.current.experiment_run_artifact_ref,
      state.current.experiment_review_artifact_ref
    ];
    const summaryArtifact = await runSummaryWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      state,
      review: review.content,
      evidenceIndex: claimCheck.evidence_index,
      inputRefs: refs,
      evidenceRefs: refs
    });
    const summaryRef = this.store.appendArtifact(summaryArtifact);
    state.current.summary_artifact_ref = summaryRef;
    recordPhase(state, "summary", [summaryRef], "pass");
    state.phase = "idle";
    state.pending_human_actions = summaryArtifact.content.next_human_actions.map((description) => ({
      type: "next_human_action",
      description
    }));
  }

  // Read-only evidence preview: runs claimEvidenceGate against the current
  // stored artifacts so the panel can show live claim->evidence coverage before
  // the summary phase exists. Never writes state or emits events.
  async previewEvidence(projectId) {
    const state = this.store.readState(projectId);
    if (!state.current?.contract_artifact_ref) {
      return { ok: true, ready: false, evidence_index: [], reason: "contract not approved" };
    }
    const { contract } = this.getContract(state);
    const check = claimEvidenceGate(contract, {
      availableArtifacts: this.availableArtifacts(state),
      completedPhases: state.phase_history
        .filter((entry) => entry.gate_result === "pass")
        .map((entry) => entry.phase)
    });
    return { ok: true, ready: true, gate_ok: check.ok, evidence_index: check.evidence_index };
  }

  // --- consult mode (人机一问一答, M3) ----------------------------------------
  // consult NEVER advances research state: no phase / phase_history / gate /
  // claim_evidence. It writes only state.consult (session metadata) + a consult
  // raw_log (process channel). See M3技术路线-后端 §3/§4.

  consultAvailable() {
    return typeof this.adapter.consult === "function";
  }

  // Fast ack for the panel; the actual turn runs in executeConsult. consult does
  // NOT degrade to mock — if Claude is unavailable it honestly refuses (a fake
  // reply would break the two-channel red line; there is no pipeline to keep alive).
  async beginConsult(projectId, message) {
    this.store.ensureProject(projectId);
    if (!message || !message.trim()) {
      return { ok: false, running: false, error: { code: "empty_message", message: "消息不能为空" } };
    }
    if (!this.consultAvailable()) {
      return { ok: false, running: false, error: { code: "unavailable", message: "Claude 未接入，一问一答不可用" } };
    }
    return { ok: true, running: true, project_id: projectId };
  }

  // Runs one consult turn, serialized per project so --resume context stays
  // ordered across concurrent sends.
  executeConsult(projectId, message) {
    const prev = this.consultChain.get(projectId) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => this._executeConsult(projectId, message));
    this.consultChain.set(projectId, next.catch(() => {}));
    return next;
  }

  async _executeConsult(projectId, message) {
    const state = this.store.readState(projectId);
    const sessionId = state.consult?.session_id || undefined;
    const result = await this.adapter.consult({ project_id: projectId, message, session_id: sessionId });
    if (!result.ok) {
      this.eventBus?.emit(projectId, {
        type: "consult_message",
        data: { ok: false, question: message, error: result.error, ts: nowIso() }
      });
      return result;
    }
    const rawLogRef = this.landConsultRawLog(state, result, message);
    state.consult = {
      session_id: result.session_id || sessionId || null,
      turn_count: (state.consult?.turn_count || 0) + 1,
      last_turn_at: nowIso(),
      raw_log_refs: [...(state.consult?.raw_log_refs || []), rawLogRef]
    };
    if (this.costTracker) {
      this.costTracker.record(projectId, { ...result.usage, phase: "consult" });
    }
    this.persistUsage(state);
    touchState(state);
    this.store.writeState(state);
    this.eventBus?.emit(projectId, {
      type: "consult_message",
      data: {
        ok: true,
        raw_log_ref: rawLogRef,
        question: message,
        answer_summary: (result.text || "").slice(0, 280),
        session_id: state.consult.session_id,
        ts: nowIso()
      }
    });
    this.emitSnapshot(state);
    return { ...result, raw_log_ref: rawLogRef };
  }

  // Lands one consult turn as a consult raw_log (process channel only). Stores
  // question + answer_text so a later promote can build the consult_note.
  // Records the ref on both raw_log_artifact_refs (shared feed) and
  // consult.raw_log_refs (consult thread). Never a conclusion.
  landConsultRawLog(state, result, question) {
    const transcriptRef = this.store.saveRawPayload(state.project_id, "consult-transcript", {
      transcript: result.raw?.transcript || ""
    });
    const artifact = createArtifact({
      projectId: state.project_id,
      phase: state.phase,
      type: "raw_log",
      workflow: "consult",
      adapter: "claude",
      inputRefs: [],
      evidenceRefs: [],
      content: redactSecrets({
        model: result.usage?.model,
        time: nowIso(),
        role: "对话",
        question,
        answer_text: result.text,
        summary: (result.text || "").slice(0, 280),
        session_id: result.session_id,
        transcript_ref: transcriptRef
      })
    });
    const ref = this.store.appendArtifact(artifact);
    state.current.raw_log_artifact_refs = [...(state.current.raw_log_artifact_refs || []), ref];
    return ref;
  }

  // Human promote of a consult turn → a consult_note artifact. Lands in the
  // evidence store for traceability + honest attribution, but does NOT advance
  // research state, does NOT pass a gate, and is NOT counted as claim evidence
  // (两通道红线 §2.1 / M3技术路线-后端 §6). Idempotent per source raw_log.
  promoteConsult(projectId, rawLogRef, note = null) {
    const state = this.store.readState(projectId);
    const source = this.store.readArtifact(projectId, rawLogRef);
    if (source.type !== "raw_log" || source.producer?.workflow !== "consult") {
      throw new Error("promoteConsult target must be a consult raw_log");
    }
    const existing = (state.current.consult_note_refs || []).find((ref) => {
      const note = this.store.readArtifact(projectId, ref);
      return note.content?.source_raw_log_ref === rawLogRef;
    });
    if (existing) {
      return { ...this.finishManual(state, ["consult_note_exists"]), artifact_ref: existing };
    }
    const artifact = createArtifact({
      projectId,
      phase: state.phase,
      type: "consult_note",
      workflow: "consult_promote",
      adapter: "claude",
      inputRefs: [rawLogRef],
      evidenceRefs: [rawLogRef],
      content: redactSecrets({
        source_raw_log_ref: rawLogRef,
        question: source.content?.question ?? null,
        answer_text: source.content?.answer_text ?? source.content?.summary ?? null,
        transcript_ref: source.content?.transcript_ref ?? null,
        session_id: source.content?.session_id ?? null,
        note,
        promoted_at: nowIso()
      })
    });
    const ref = this.store.appendArtifact(artifact);
    state.current.consult_note_refs = [...(state.current.consult_note_refs || []), ref];
    return { ...this.finishManual(state, ["consult_note_promoted"]), artifact_ref: ref };
  }

  getContract(state) {
    const ref = state.current.contract_artifact_ref;
    if (!ref) {
      throw new Error("Approved contract artifact is missing");
    }
    const artifact = this.store.readArtifact(state.project_id, ref);
    return { contract: artifact.content, ref, artifact };
  }

  availableArtifacts(state) {
    return Object.entries(artifactTypeByStateKey)
      .filter(([key]) => state.current?.[key])
      .map(([key, type]) => ({ type, ref: state.current[key] }));
  }

  readCurrentArtifact(state, key) {
    const ref = state.current[key];
    if (!ref) {
      throw new Error(`Required artifact missing: ${key}`);
    }
    return this.store.readArtifact(state.project_id, ref);
  }

  recordRawLogArtifact(state, signal, kind) {
    const artifact = createArtifact({
      projectId: state.project_id,
      phase: state.phase,
      type: "raw_log",
      workflow: kind,
      adapter: "manual",
      inputRefs: [signal.rawPayloadRef],
      evidenceRefs: [signal.rawPayloadRef],
      content: {
        signal_id: signal.id,
        routeKey: signal.routeKey,
        event: signal.event,
        toolName: signal.toolName,
        userText: signal.userText
      }
    });
    const ref = this.store.appendArtifact(artifact);
    state.current.raw_log_artifact_refs = [...(state.current.raw_log_artifact_refs || []), ref];
    recordPhase(state, state.phase, [ref], "pass");
  }

  blockWithoutWrite(state, phase, artifactRefs, errors) {
    const retreatTo = retreatTargets[phase];
    state.phase = "blocked";
    state.block = { failed_phase: phase, retreat_to: retreatTo, errors };
    state.pending_human_actions = [
      {
        type: "revise_required",
        phase,
        retreat_to: retreatTo,
        errors,
        label: retreatTo ? `Fix and re-run from ${retreatTo}` : "Manual revision required"
      }
    ];
    recordPhase(state, phase, artifactRefs, "fail");
  }

  async recover(projectId, request = {}) {
    const state = this.store.readState(projectId);
    if (state.phase !== "blocked") {
      throw new Error("recover is only available from a blocked state");
    }
    const target = request.to || state.block?.retreat_to;
    if (!target) {
      throw new Error("No retreat target is available to recover to");
    }
    state.phase = target;
    delete state.block;

    // contract_draft is special: it is run asynchronously via executeContractRun
    // (like /start and /revise), not via advance(). Set up the pending run context
    // and signal that the caller should schedule executeContractRun.
    if (target === "contract_draft") {
      this.eventBus?.clearCliChunks?.(projectId);
      this.pendingRun.set(projectId, { kind: "draft" });
      state.pending_human_actions = [
        { type: "phase_running", phase: "contract_draft", label: "Claude 重新起草研究契约中…" }
      ];
      const result = this.finishManual(state, ["contract_draft_running"]);
      return { ...result, needs_draft: true };
    }

    setRunPhaseAction(state, target);
    recordPhase(state, target, [], "manual");
    return this.finishManual(state, [`recovered_to_${target}`]);
  }

  block(state, signal, phase, artifactRefs, errors) {
    this.blockWithoutWrite(state, phase, artifactRefs, errors);
    return this.finish(state, signal, ["blocked"]);
  }

  finishManual(state, actions) {
    this.stampPhaseStart(state);
    this.persistUsage(state);
    touchState(state);
    this.store.writeState(state);
    this.emitSnapshot(state);
    return {
      ok: true,
      project_id: state.project_id,
      phase: state.phase,
      actions,
      panel_url: `/panel/${state.project_id}`,
      state: publicStateSummary(state)
    };
  }

  finish(state, signal, actions) {
    this.stampPhaseStart(state);
    this.persistUsage(state);
    touchState(state);
    this.store.writeState(state);
    this.emitSnapshot(state);
    return {
      ok: true,
      project_id: state.project_id,
      phase: state.phase,
      signal_id: signal.id,
      actions,
      panel_url: `/panel/${state.project_id}`,
      state: publicStateSummary(state)
    };
  }
}
