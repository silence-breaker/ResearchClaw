import { approveContract } from "../contract/contract.js";
import { MockModelAdapter } from "../adapters/mock.js";
import { createArtifact } from "../evidence/types.js";
import { makeId, nowIso, publicStateSummary } from "../util.js";
import { runBaselineWorkflow, runReproductionChecklistWorkflow } from "../workflows/baseline.js";
import { runContractDraftWorkflow } from "../workflows/contractDraft.js";
import { runIdeaWorkflow } from "../workflows/idea.js";
import { runLiteratureWorkflow } from "../workflows/literature.js";
import { runReviewWorkflow } from "../workflows/review.js";
import { runSummaryWorkflow } from "../workflows/summary.js";
import { touchState, recordPhase, recordSignal } from "./state.js";
import {
  baselineGate,
  claimEvidenceGate,
  contractGate,
  evidenceGate,
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
  review_artifact_ref: "idea_review_report"
};

const phaseRunLabels = {
  literature_scouting: "Run literature scouting",
  baseline_selection: "Run baseline selection",
  baseline_reproduction_checklist: "Run reproduction checklist",
  idea_generation: "Run idea generation",
  idea_review: "Run idea review",
  summary: "Write summary"
};

// When a phase gate fails, which re-runnable upstream phase to fall back to.
// blocked stays the visible state, but it carries this target so recover() can leave it.
const retreatTargets = {
  literature_scouting: "literature_scouting",
  baseline_selection: "literature_scouting",
  baseline_reproduction_checklist: "baseline_selection",
  idea_generation: "idea_generation",
  idea_review: "idea_generation",
  summary: "idea_review"
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
  constructor({ store, adapter = new MockModelAdapter(), eventBus = null }) {
    this.store = store;
    this.adapter = adapter;
    this.eventBus = eventBus;
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
      case "start_research":
        return this.startResearch(state, signal);
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

  async startResearch(state, signal) {
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
    if (userText) {
      state.current.research_direction = userText;
      recordPhase(state, "intake", [intakeRef], "pass");
    } else {
      state.pending_human_actions = [
        {
          type: "provide_research_direction",
          target: "intake",
          label: "Enter research direction"
        }
      ];
      recordPhase(state, "intake", [intakeRef], "manual");
      return this.finish(state, signal, ["researchclaw_panel_ready", "research_direction_required"]);
    }

    state.phase = "contract_draft";
    const draftArtifact = await runContractDraftWorkflow({
      adapter: this.adapter,
      projectId: state.project_id,
      userText,
      inputRefs: [intakeRef],
      evidenceRefs: [signal.rawPayloadRef]
    });
    const gate = contractGate(draftArtifact.content);
    const draftRef = this.store.appendArtifact(draftArtifact);
    state.current.contract_artifact_ref = draftRef;
    state.current.contract_artifact_id = draftArtifact.artifact_id;
    state.contract_versions.push({
      version: draftArtifact.content.version,
      artifact_ref: draftRef,
      status: draftArtifact.status
    });
    if (!gate.ok) {
      this.blockWithoutWrite(state, "contract_draft", [draftRef], gate.errors);
      return this.finish(state, signal, ["blocked"]);
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
    return this.finish(state, signal, ["human_approval_required"]);
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

  async revise(projectId, request) {
    const state = this.store.readState(projectId);
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
    const currentArtifact = this.store.readArtifact(projectId, currentRef);
    if (request.artifact_id && request.artifact_id !== currentArtifact.artifact_id) {
      throw new Error("Revision artifact_id does not match the active contract");
    }
    const revisedArtifact = await runContractDraftWorkflow({
      adapter: this.adapter,
      projectId,
      userText: state.current.research_direction,
      previousContract: currentArtifact.content,
      feedback: request.feedback,
      inputRefs: [currentRef],
      evidenceRefs: [currentRef]
    });
    const gate = contractGate(revisedArtifact.content);
    const revisedRef = this.store.appendArtifact(revisedArtifact);
    state.current.contract_artifact_ref = revisedRef;
    state.current.contract_artifact_id = revisedArtifact.artifact_id;
    state.contract_versions.push({
      version: revisedArtifact.content.version,
      artifact_ref: revisedRef,
      status: revisedArtifact.status
    });
    if (!gate.ok) {
      this.blockWithoutWrite(state, "contract_draft", [revisedRef], gate.errors);
      return this.finishManual(state, ["blocked"]);
    }
    recordPhase(state, "contract_draft", [revisedRef], "pass");
    state.phase = "contract_review";
    state.pending_human_actions = [
      {
        type: "approve_or_revise",
        target: "contract",
        artifact_id: revisedArtifact.artifact_id,
        artifact_ref: revisedRef,
        label: "Approve or revise contract"
      }
    ];
    recordPhase(state, "contract_review", [revisedRef], "manual");
    return this.finishManual(state, ["contract_revised", "human_approval_required"]);
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
      state.current.review_artifact_ref
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
    setRunPhaseAction(state, target);
    recordPhase(state, target, [], "manual");
    return this.finishManual(state, [`recovered_to_${target}`]);
  }

  block(state, signal, phase, artifactRefs, errors) {
    this.blockWithoutWrite(state, phase, artifactRefs, errors);
    return this.finish(state, signal, ["blocked"]);
  }

  finishManual(state, actions) {
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
