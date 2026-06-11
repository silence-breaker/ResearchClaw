import test from "node:test";
import assert from "node:assert/strict";
import { createTempHarness } from "./helpers.js";
import { handleOpenClawPayload } from "../gateway.js";
import { MockModelAdapter } from "../adapters/mock.js";
import { readJsonUrl } from "../util.js";
import { ResearchOrchestrator } from "../engine/orchestrator.js";
import { FileEvidenceStore } from "../evidence/store.js";
import { CostTracker } from "../engine/cost.js";
import { createRoutingAdapter } from "../adapters/route.js";

const cliOutFixture = () => readJsonUrl(new URL("../../fixtures/cli/contract-draft.out.json", import.meta.url));

// A stand-in for ClaudeCodeAdapter that returns the claude-shaped result
// (output + usage + raw) without spawning anything. `fail` flips it to an error
// so the routing adapter degrades to mock.
class StubClaudeAdapter {
  name = "claude";
  available = true;
  fail = false;
  async run(request) {
    if (this.fail) {
      return { ok: false, adapter: "claude", error: { code: "schema_violation", message: "bad out.json", retryable: true } };
    }
    const output = cliOutFixture();
    output.project_id = request.project_id;
    return {
      ok: true,
      adapter: "claude",
      output,
      usage: { input_tokens: 1500, output_tokens: 520, model: "claude-haiku-4-5", turns: 3, duration_ms: 4200 },
      raw: {
        transcript: "line-1\nline-2\nline-3",
        summary: { model: "claude-haiku-4-5", time: "2026-06-04T00:00:00.000Z", role: "规划", summary: "Drafted contract", artifact_refs: [] }
      }
    };
  }
}

function claudeHarness({ fail = false } = {}) {
  const primary = new StubClaudeAdapter();
  primary.fail = fail;
  const costTracker = new CostTracker();
  const adapter = createRoutingAdapter({
    phases: ["contract_draft"],
    primary,
    fallback: new MockModelAdapter(),
    costTracker
  });
  return { ...createTempHarness(adapter, { costTracker }), costTracker };
}

test("a claude-produced contract_draft persists usage into state.usage", async () => {
  const { store, orchestrator } = claudeHarness();
  await orchestrator.startFromText("proj_demo_001", "improve retrieval reranking");
  const state = store.readState("proj_demo_001");
  assert.equal(state.phase, "contract_review");
  assert.ok(state.usage, "state.usage must be populated by the cost tracker");
  assert.equal(state.usage.input_tokens, 1500);
  assert.equal(state.usage.output_tokens, 520);
  assert.equal(state.usage.cli_calls, 1);
  assert.ok(state.usage.est_cost_usd > 0);
});

test("a claude-produced contract_draft lands a raw_log transcript artifact", async () => {
  const { store, orchestrator } = claudeHarness();
  await orchestrator.startFromText("proj_demo_001", "improve retrieval reranking");
  const state = store.readState("proj_demo_001");

  const contract = store.readArtifact("proj_demo_001", state.current.contract_artifact_ref);
  assert.equal(contract.producer.adapter, "claude");

  const rawRefs = state.current.raw_log_artifact_refs ?? [];
  assert.equal(rawRefs.length, 1);
  const rawLog = store.readArtifact("proj_demo_001", rawRefs[0]);
  assert.equal(rawLog.type, "raw_log");
  assert.equal(rawLog.producer.adapter, "claude");
  assert.equal(rawLog.content.role, "规划");
  assert.ok(rawLog.content.transcript_ref, "transcript should be saved as a referenced raw payload");
});

// --- async start/revise (non-blocking dashboard path) ---------------------

class CountingMockAdapter extends MockModelAdapter {
  constructor() {
    super();
    this.draftCalls = 0;
  }
  async run(request) {
    if (request.phase === "contract_draft") this.draftCalls += 1;
    return super.run(request);
  }
}

class ThrowingDraftAdapter extends MockModelAdapter {
  async run(request) {
    if (request.phase === "contract_draft") {
      return { ok: false, adapter: "mock", error: { code: "boom", message: "draft exploded", retryable: false } };
    }
    return super.run(request);
  }
}

test("beginDraftFromText returns a running snapshot without drafting yet", async () => {
  const { store, orchestrator } = createTempHarness();
  const result = await orchestrator.beginDraftFromText("proj_async", "Explore retrieval reranking");
  assert.equal(result.phase, "contract_draft");
  assert.equal(result.needs_draft, true);
  const state = store.readState("proj_async");
  assert.equal(state.phase, "contract_draft");
  assert.equal(state.pending_human_actions[0].type, "phase_running");
  assert.equal(state.current.contract_artifact_ref, undefined, "no contract should exist before executeContractRun");
});

test("executeContractRun completes the draft started by beginDraftFromText", async () => {
  const { store, orchestrator } = createTempHarness();
  await orchestrator.beginDraftFromText("proj_async", "Explore retrieval reranking");
  await orchestrator.executeContractRun("proj_async");
  const state = store.readState("proj_async");
  assert.equal(state.phase, "contract_review");
  assert.ok(state.current.contract_artifact_ref);
  assert.equal(state.pending_human_actions[0].type, "approve_or_revise");
});

test("executeContractRun runs the workflow only once under concurrent calls", async () => {
  const adapter = new CountingMockAdapter();
  const { orchestrator } = createTempHarness(adapter);
  await orchestrator.beginDraftFromText("proj_async", "Explore retrieval reranking");
  await Promise.all([
    orchestrator.executeContractRun("proj_async"),
    orchestrator.executeContractRun("proj_async")
  ]);
  assert.equal(adapter.draftCalls, 1, "inflight guard must prevent a double run");
});

test("a draft workflow failure lands the project in blocked, not a crash", async () => {
  const { store, orchestrator } = createTempHarness(new ThrowingDraftAdapter());
  await orchestrator.beginDraftFromText("proj_async", "Explore retrieval reranking");
  await orchestrator.executeContractRun("proj_async");
  const state = store.readState("proj_async");
  assert.equal(state.phase, "blocked");
  assert.ok((state.block.errors || []).some((e) => e.includes("draft exploded")));
});

test("a draft workflow failure leaves a recoverable retreat target", async () => {
  const { store, orchestrator } = createTempHarness(new ThrowingDraftAdapter());
  await orchestrator.beginDraftFromText("proj_async", "Explore retrieval reranking");
  await orchestrator.executeContractRun("proj_async");
  const state = store.readState("proj_async");
  assert.equal(state.block.failed_phase, "contract_draft");
  assert.equal(state.block.retreat_to, "contract_draft");
  assert.equal(state.pending_human_actions[0].retreat_to, "contract_draft");
});

class FailsOnceDraftAdapter extends MockModelAdapter {
  constructor() {
    super();
    this.failures = 0;
  }
  async run(request) {
    if (request.phase === "contract_draft" && this.failures === 0) {
      this.failures += 1;
      return { ok: false, adapter: "mock", error: { code: "boom", message: "draft exploded once", retryable: false } };
    }
    return super.run(request);
  }
}

test("recover from a contract_draft failure re-runs the draft", async () => {
  const { store, orchestrator } = createTempHarness(new FailsOnceDraftAdapter());
  await orchestrator.beginDraftFromText("proj_async", "Explore retrieval reranking");
  await orchestrator.executeContractRun("proj_async");
  assert.equal(store.readState("proj_async").phase, "blocked");

  const recoverResult = await orchestrator.recover("proj_async");
  assert.equal(recoverResult.needs_draft, true, "recover should signal that contract_draft needs a background run");
  const recovered = store.readState("proj_async");
  assert.equal(recovered.phase, "contract_draft");
  assert.equal(recovered.block, undefined);
  assert.equal(recovered.pending_human_actions[0].type, "phase_running");

  await orchestrator.executeContractRun("proj_async");
  const after = store.readState("proj_async");
  assert.equal(after.phase, "contract_review");
  assert.ok(after.current.contract_artifact_ref);
});

test("beginRevise + executeContractRun produces a revised version asynchronously", async () => {
  const { store, orchestrator } = createTempHarness();
  await orchestrator.startFromText("proj_async", "Explore retrieval reranking");
  const before = store.readArtifact("proj_async", store.readState("proj_async").current.contract_artifact_ref).content;

  const running = await orchestrator.beginRevise("proj_async", { target: "contract", feedback: "Add a latency failure signal." });
  assert.equal(running.needs_draft, true);
  assert.equal(store.readState("proj_async").pending_human_actions[0].type, "phase_running");

  await orchestrator.executeContractRun("proj_async");
  const after = store.readState("proj_async");
  assert.equal(after.phase, "contract_review");
  const revised = store.readArtifact("proj_async", after.current.contract_artifact_ref).content;
  assert.equal(revised.version, before.version + 1);
});

test("a failed claude run degrades to mock honestly and counts the failure", async () => {
  const { store, orchestrator } = claudeHarness({ fail: true });
  await orchestrator.startFromText("proj_demo_001", "improve retrieval reranking");
  const state = store.readState("proj_demo_001");
  assert.equal(state.phase, "contract_review");

  const contract = store.readArtifact("proj_demo_001", state.current.contract_artifact_ref);
  assert.equal(contract.producer.adapter, "mock", "degraded product must be labelled mock");
  assert.equal(state.usage.cli_failures, 1);
  // mock fallback produced no transcript → no raw_log landed.
  assert.equal((state.current.raw_log_artifact_refs ?? []).length, 0);
});

class BadBaselineAdapter extends MockModelAdapter {
  outputFor(request) {
    if (request.phase === "baseline_selection") {
      return {
        selected: {
          paper_id: "paper_contrastive_vl_retrieval",
          name: "Only Baseline",
          reason: "temporary"
        },
        candidates: [
          {
            paper_id: "paper_contrastive_vl_retrieval",
            name: "Only Baseline",
            pros: ["open code"],
            cons: [],
            reproducibility_risk: "low"
          }
        ],
        rejected: []
      };
    }
    return super.outputFor(request);
  }
}

class KillReviewAdapter extends MockModelAdapter {
  outputFor(request) {
    if (request.phase === "idea_review") {
      const review = readJsonUrl(new URL("../../fixtures/workflows/idea-review-output.json", import.meta.url));
      return {
        ...review,
        reviews: review.reviews.map((item) => ({
          ...item,
          decision: "kill"
        })),
        recommended_idea_id: undefined
      };
    }
    return super.outputFor(request);
  }
}

test("start research acks running fast then drafts the contract in the background", async () => {
  const { store, orchestrator } = createTempHarness();
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  const result = await handleOpenClawPayload({ payload, store, orchestrator });
  // Fast ack: running, not blocking on the draft (hook must not block ~38s on a real CLI run).
  assert.equal(result.body.phase, "contract_draft");
  assert.ok(result.body.actions.includes("contract_draft_running"));
  // Background draft settles into contract_review.
  await orchestrator.executeContractRun("proj_demo_001");
  const state = store.readState("proj_demo_001");
  assert.equal(state.phase, "contract_review");
  assert.ok(state.current.contract_artifact_ref);
  assert.equal(state.pending_human_actions[0].type, "approve_or_revise");
});

test("approve and advance run the mock pipeline one phase at a time", async () => {
  const { store, orchestrator } = createTempHarness();
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
  await orchestrator.executeContractRun("proj_demo_001");
  const stateBefore = store.readState("proj_demo_001");
  const result = await orchestrator.approve("proj_demo_001", {
    target: "contract",
    artifact_id: stateBefore.current.contract_artifact_id,
    approved_by: "human",
    note: "approve"
  });
  assert.equal(result.phase, "literature_scouting");
  const state = store.readState("proj_demo_001");
  assert.equal(state.phase, "literature_scouting");
  await orchestrator.advance("proj_demo_001");
  assert.equal(store.readState("proj_demo_001").phase, "baseline_selection");
  await orchestrator.advance("proj_demo_001");
  assert.equal(store.readState("proj_demo_001").phase, "baseline_reproduction_checklist");
  await orchestrator.advance("proj_demo_001");
  assert.equal(store.readState("proj_demo_001").phase, "idea_generation");
  await orchestrator.advance("proj_demo_001");
  assert.equal(store.readState("proj_demo_001").phase, "idea_review");
  await orchestrator.advance("proj_demo_001");
  assert.equal(store.readState("proj_demo_001").phase, "summary");
  await orchestrator.advance("proj_demo_001");
  const finalState = store.readState("proj_demo_001");
  assert.equal(finalState.phase, "idle");
  assert.ok(finalState.current.summary_artifact_ref);
  assert.ok(finalState.current.review_artifact_ref);
  assert.ok(finalState.phase_history.some((item) => item.phase === "summary"));
});

test("summary evidence_index is computed from the contract claim map", async () => {
  const { store, orchestrator } = createTempHarness();
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
  await orchestrator.executeContractRun("proj_demo_001");
  const stateBefore = store.readState("proj_demo_001");
  await orchestrator.approve("proj_demo_001", {
    target: "contract",
    artifact_id: stateBefore.current.contract_artifact_id,
    approved_by: "human"
  });
  for (let i = 0; i < 6; i += 1) {
    await orchestrator.advance("proj_demo_001"); // literature..summary
  }
  const finalState = store.readState("proj_demo_001");
  const summary = store.readArtifact("proj_demo_001", finalState.current.summary_artifact_ref);
  const index = summary.content.evidence_index;
  const c1 = index.find((entry) => entry.claim_id === "C1");
  assert.ok(c1, "evidence_index must carry the contract claim id");
  assert.ok(Array.isArray(c1.pending));
  assert.ok(Array.isArray(c1.satisfied));
});

test("previewEvidence returns ready:false before any contract exists", async () => {
  const { orchestrator } = createTempHarness();
  const preview = await orchestrator.previewEvidence("proj_fresh");
  assert.equal(preview.ok, true);
  assert.equal(preview.ready, false);
  assert.deepEqual(preview.evidence_index, []);
});

test("previewEvidence computes real satisfied/pending claims mid-pipeline", async () => {
  const { store, orchestrator } = createTempHarness();
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
  await orchestrator.executeContractRun("proj_demo_001");
  const stateBefore = store.readState("proj_demo_001");
  await orchestrator.approve("proj_demo_001", {
    target: "contract",
    artifact_id: stateBefore.current.contract_artifact_id,
    approved_by: "human"
  });
  await orchestrator.advance("proj_demo_001"); // literature scouting -> paper_cards artifact
  await orchestrator.advance("proj_demo_001"); // baseline selection -> baseline_decision artifact

  const preview = await orchestrator.previewEvidence("proj_demo_001");
  assert.equal(preview.ready, true);
  assert.ok(preview.evidence_index.length > 0, "evidence_index must carry the contract claims");
  // Real claimEvidenceGate output: some claim is satisfied by a stored artifact ref,
  // and at least one demo-scope claim is still pending (e.g. experiment results).
  const allSatisfied = preview.evidence_index.flatMap((entry) => entry.satisfied);
  const allPending = preview.evidence_index.flatMap((entry) => entry.pending);
  assert.ok(allSatisfied.some((item) => typeof item.artifact_ref === "string" && item.artifact_ref.length > 0));
  assert.ok(allPending.some((item) => typeof item.reason === "string" && item.reason.length > 0));
});

test("baseline gate failure blocks the pipeline", async () => {
  const rootDir = createTempHarness(new BadBaselineAdapter()).rootDir;
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter: new BadBaselineAdapter() });
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
  await orchestrator.executeContractRun("proj_demo_001");
  const stateBefore = store.readState("proj_demo_001");
  await orchestrator.approve("proj_demo_001", {
    target: "contract",
    artifact_id: stateBefore.current.contract_artifact_id,
    approved_by: "human",
    note: "approve"
  });
  assert.equal(store.readState("proj_demo_001").phase, "literature_scouting");
  await orchestrator.advance("proj_demo_001");
  assert.equal(store.readState("proj_demo_001").phase, "baseline_selection");
  await orchestrator.advance("proj_demo_001");
  const state = store.readState("proj_demo_001");
  assert.equal(state.phase, "blocked");
  assert.equal(state.pending_human_actions[0].phase, "baseline_selection");
});

test("a blocked gate failure records a retreat target", async () => {
  const rootDir = createTempHarness(new BadBaselineAdapter()).rootDir;
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter: new BadBaselineAdapter() });
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
  await orchestrator.executeContractRun("proj_demo_001");
  const stateBefore = store.readState("proj_demo_001");
  await orchestrator.approve("proj_demo_001", {
    target: "contract",
    artifact_id: stateBefore.current.contract_artifact_id,
    approved_by: "human"
  });
  await orchestrator.advance("proj_demo_001"); // literature scouting
  await orchestrator.advance("proj_demo_001"); // baseline selection -> blocked
  const state = store.readState("proj_demo_001");
  assert.equal(state.phase, "blocked");
  assert.equal(state.block.retreat_to, "literature_scouting");
  assert.equal(state.pending_human_actions[0].retreat_to, "literature_scouting");
});

test("recover returns a blocked project to its retreat phase and lets it re-run", async () => {
  const rootDir = createTempHarness(new BadBaselineAdapter()).rootDir;
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter: new BadBaselineAdapter() });
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
  await orchestrator.executeContractRun("proj_demo_001");
  const stateBefore = store.readState("proj_demo_001");
  await orchestrator.approve("proj_demo_001", {
    target: "contract",
    artifact_id: stateBefore.current.contract_artifact_id,
    approved_by: "human"
  });
  await orchestrator.advance("proj_demo_001"); // literature scouting
  await orchestrator.advance("proj_demo_001"); // baseline selection -> blocked
  assert.equal(store.readState("proj_demo_001").phase, "blocked");

  await orchestrator.recover("proj_demo_001");
  const recovered = store.readState("proj_demo_001");
  assert.equal(recovered.phase, "literature_scouting");
  assert.equal(recovered.block, undefined);
  assert.equal(recovered.pending_human_actions[0].type, "run_phase");

  await orchestrator.advance("proj_demo_001"); // re-run literature
  assert.equal(store.readState("proj_demo_001").phase, "baseline_selection");
});

test("all-kill idea review blocks before summary", async () => {
  const rootDir = createTempHarness(new KillReviewAdapter()).rootDir;
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter: new KillReviewAdapter() });
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
  await orchestrator.executeContractRun("proj_demo_001");
  const stateBefore = store.readState("proj_demo_001");
  await orchestrator.approve("proj_demo_001", {
    target: "contract",
    artifact_id: stateBefore.current.contract_artifact_id,
    approved_by: "human",
    note: "approve"
  });
  await orchestrator.advance("proj_demo_001");
  await orchestrator.advance("proj_demo_001");
  await orchestrator.advance("proj_demo_001");
  await orchestrator.advance("proj_demo_001");
  await orchestrator.advance("proj_demo_001");
  const state = store.readState("proj_demo_001");
  assert.equal(state.phase, "blocked");
  assert.equal(state.current.summary_artifact_ref, undefined);
});

test("revise re-runs the contract draft workflow and reflects feedback", async () => {
  const { store, orchestrator } = createTempHarness();
  await orchestrator.startFromText("proj_demo_001", "Explore retrieval reranking");
  const before = store.readState("proj_demo_001");
  const beforeContract = store.readArtifact("proj_demo_001", before.current.contract_artifact_ref).content;

  await orchestrator.revise("proj_demo_001", {
    target: "contract",
    feedback: "Add a clearer latency failure signal."
  });

  const after = store.readState("proj_demo_001");
  const revisedArtifact = store.readArtifact("proj_demo_001", after.current.contract_artifact_ref);
  assert.equal(after.phase, "contract_review");
  // routed through the contract-draft workflow / model adapter, not a pure manual stamp
  assert.equal(revisedArtifact.producer.workflow, "contractDraft");
  assert.equal(revisedArtifact.producer.adapter, "mock");
  assert.equal(revisedArtifact.content.version, beforeContract.version + 1);
  assert.ok(revisedArtifact.content.human_notes.includes("Add a clearer latency failure signal."));
});

test("keyword-detector trigger can bootstrap without a topic", async () => {
  const { store, orchestrator } = createTempHarness();
  const payload = {
    ...readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url)),
    context: {
      sessionId: "sess_bootstrap",
      projectPath: "/home/wj/openclaw",
      prompt: "start researchclaw"
    },
    instruction: "start researchclaw"
  };
  const result = await handleOpenClawPayload({ payload, store, orchestrator });
  assert.equal(result.body.phase, "intake");
  const state = store.readState("proj_demo_001");
  assert.equal(state.phase, "intake");
  assert.equal(state.pending_human_actions[0].type, "provide_research_direction");
});

test("providing a research direction unsticks an intake project (panel re-entry path)", async () => {
  const { store, orchestrator } = createTempHarness();
  const payload = {
    ...readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url)),
    context: { sessionId: "sess_stuck", projectPath: "/home/wj/openclaw", prompt: "start researchclaw" },
    instruction: "start researchclaw"
  };
  await handleOpenClawPayload({ payload, store, orchestrator });
  assert.equal(store.readState("proj_demo_001").phase, "intake");

  // Same call the panel's intake input makes: re-run /start with a direction.
  await orchestrator.startFromText("proj_demo_001", "Explore retrieval reranking");

  const after = store.readState("proj_demo_001");
  assert.equal(after.phase, "contract_review");
  assert.ok(after.current.contract_artifact_ref);
  assert.equal(after.pending_human_actions[0].type, "approve_or_revise");
});
