import test from "node:test";
import assert from "node:assert/strict";
import { createTempHarness } from "./helpers.js";
import { handleOpenClawPayload } from "../gateway.js";
import { MockModelAdapter } from "../adapters/mock.js";
import { readJsonUrl } from "../util.js";
import { ResearchOrchestrator } from "../engine/orchestrator.js";
import { FileEvidenceStore } from "../evidence/store.js";

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

test("start research transitions to contract review and waits for approval", async () => {
  const { store, orchestrator } = createTempHarness();
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  const result = await handleOpenClawPayload({ payload, store, orchestrator });
  assert.equal(result.body.phase, "contract_review");
  const state = store.readState("proj_demo_001");
  assert.equal(state.phase, "contract_review");
  assert.ok(state.current.contract_artifact_ref);
  assert.equal(state.pending_human_actions[0].type, "approve_or_revise");
});

test("approve and advance run the mock pipeline one phase at a time", async () => {
  const { store, orchestrator } = createTempHarness();
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
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

test("baseline gate failure blocks the pipeline", async () => {
  const rootDir = createTempHarness(new BadBaselineAdapter()).rootDir;
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter: new BadBaselineAdapter() });
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
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

test("all-kill idea review blocks before summary", async () => {
  const rootDir = createTempHarness(new KillReviewAdapter()).rootDir;
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter: new KillReviewAdapter() });
  const payload = readJsonUrl(new URL("../../fixtures/openclaw/keyword-detector.json", import.meta.url));
  await handleOpenClawPayload({ payload, store, orchestrator });
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
