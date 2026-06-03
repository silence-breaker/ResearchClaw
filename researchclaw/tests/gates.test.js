import test from "node:test";
import assert from "node:assert/strict";
import { readJsonUrl } from "../util.js";
import {
  baselineGate,
  claimEvidenceGate,
  ideaGate,
  reproductionChecklistGate,
  reviewGate
} from "../engine/gates.js";

const ideaFixture = () => readJsonUrl(new URL("../../fixtures/workflows/idea-output.json", import.meta.url));
const baselineFixture = () => readJsonUrl(new URL("../../fixtures/workflows/baseline-output.json", import.meta.url));
const checklistFixture = () => readJsonUrl(new URL("../../fixtures/workflows/reproduction-checklist-output.json", import.meta.url));
const reviewFixture = () => readJsonUrl(new URL("../../fixtures/workflows/idea-review-output.json", import.meta.url));
const contractFixture = () => readJsonUrl(new URL("../../fixtures/contracts/valid.json", import.meta.url));
const paperFixture = () => readJsonUrl(new URL("../../fixtures/workflows/literature-output.json", import.meta.url));

test("ideaGate passes valid idea cards", () => {
  const result = ideaGate(ideaFixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("ideaGate fails when fewer than minimum idea cards", () => {
  const result = ideaGate(ideaFixture().slice(0, 2));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("at least 3")));
});

test("ideaGate fails when an idea lacks baseline_compatibility", () => {
  const ideas = ideaFixture();
  delete ideas[0].baseline_compatibility;
  const result = ideaGate(ideas);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("baseline_compatibility")));
});

test("ideaGate fails when an idea has empty evidence_refs", () => {
  const ideas = ideaFixture();
  ideas[1].evidence_refs = [];
  const result = ideaGate(ideas);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("evidence_refs")));
});

test("baselineGate passes when selected paper is among candidates", () => {
  const result = baselineGate(baselineFixture(), { paperCards: paperFixture() });
  assert.equal(result.ok, true);
});

test("baselineGate fails when selected paper_id is not in candidates or paper cards", () => {
  const decision = baselineFixture();
  decision.selected.paper_id = "paper_not_real";
  const result = baselineGate(decision, { paperCards: paperFixture() });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("selected.paper_id")));
});

test("reproductionChecklistGate passes a real checklist against the contract", () => {
  const result = reproductionChecklistGate(checklistFixture(), { contract: contractFixture() });
  assert.equal(result.ok, true);
});

test("reproductionChecklistGate fails when commands are not executable-looking", () => {
  const checklist = checklistFixture();
  checklist.commands = ["todo"];
  const result = reproductionChecklistGate(checklist, { contract: contractFixture() });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("commands")));
});

test("reproductionChecklistGate fails when expected_metrics miss every contract metric", () => {
  const checklist = checklistFixture();
  checklist.expected_metrics = ["some unrelated number"];
  const result = reproductionChecklistGate(checklist, { contract: contractFixture() });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("expected_metrics")));
});

test("reviewGate passes a consistent review report", () => {
  const ideas = ideaFixture();
  const result = reviewGate(reviewFixture(), ideas);
  assert.equal(result.ok, true);
});

test("reviewGate fails when recommended idea was killed", () => {
  const ideas = ideaFixture();
  const report = reviewFixture();
  report.recommended_idea_id = "idea_late_fusion_score"; // this one is decision: kill
  const result = reviewGate(report, ideas);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("recommended")));
});

test("reviewGate fails when ranking omits a reviewed idea", () => {
  const ideas = ideaFixture();
  const report = reviewFixture();
  report.ranking = report.ranking.slice(0, 1);
  const result = reviewGate(report, ideas);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("ranking")));
});

test("claimEvidenceGate passes when unmatched evidence is future or out-of-scope", () => {
  const result = claimEvidenceGate(contractFixture(), {
    availableArtifacts: [
      { type: "contract", ref: "artifacts/contract_review/c.json" },
      { type: "paper_cards", ref: "artifacts/literature_scouting/l.json" },
      { type: "baseline_decision", ref: "artifacts/baseline_selection/b.json" }
    ],
    completedPhases: ["literature_scouting", "baseline_selection"]
  });
  assert.equal(result.ok, true);
  const claim = result.evidence_index.find((c) => c.claim_id === "C1");
  assert.ok(claim.pending.length >= 1); // experiment-derived evidence is pending
});

test("claimEvidenceGate blocks when a completed phase owes evidence it never produced", () => {
  const contract = {
    ...contractFixture(),
    claim_evidence_map: [
      { claim_id: "C2", claim: "Literature supports the direction.", required_evidence: ["literature survey"] }
    ]
  };
  const result = claimEvidenceGate(contract, {
    availableArtifacts: [],
    completedPhases: ["literature_scouting"]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("C2")));
});

test("claimEvidenceGate marks in-scope evidence satisfied when its artifact exists", () => {
  const contract = {
    ...contractFixture(),
    claim_evidence_map: [
      { claim_id: "C3", claim: "Baseline chosen.", required_evidence: ["selected baseline"] }
    ]
  };
  const result = claimEvidenceGate(contract, {
    availableArtifacts: [{ type: "baseline_decision", ref: "artifacts/baseline_selection/b.json" }],
    completedPhases: ["baseline_selection"]
  });
  assert.equal(result.ok, true);
  const claim = result.evidence_index.find((c) => c.claim_id === "C3");
  assert.equal(claim.satisfied.length, 1);
  assert.equal(claim.satisfied[0].artifact_ref, "artifacts/baseline_selection/b.json");
});
