import test from "node:test";
import assert from "node:assert/strict";
import { CostTracker, HAIKU_PRICING, estimateCostUsd } from "../engine/cost.js";

test("estimateCostUsd applies Haiku per-token pricing", () => {
  // 1,000,000 input + 1,000,000 output at Haiku rates.
  const cost = estimateCostUsd({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, HAIKU_PRICING);
  const expected = 1_000_000 * HAIKU_PRICING.input + 1_000_000 * HAIKU_PRICING.output;
  assert.equal(cost, expected);
  assert.ok(cost > 0);
});

test("record accumulates tokens, cost, and call count per project", () => {
  const tracker = new CostTracker();
  tracker.record("proj_a", { input_tokens: 100, output_tokens: 50, phase: "contract_draft" });
  tracker.record("proj_a", { input_tokens: 200, output_tokens: 80, phase: "contract_draft" });

  const snap = tracker.snapshot("proj_a");
  assert.equal(snap.input_tokens, 300);
  assert.equal(snap.output_tokens, 130);
  assert.equal(snap.cli_calls, 2);
  assert.equal(snap.cli_failures, 0);
  assert.equal(snap.est_cost_usd, estimateCostUsd({ input_tokens: 300, output_tokens: 130 }, HAIKU_PRICING));
});

test("snapshot buckets usage by phase", () => {
  const tracker = new CostTracker();
  tracker.record("proj_a", { input_tokens: 100, output_tokens: 50, phase: "contract_draft" });
  tracker.record("proj_a", { input_tokens: 10, output_tokens: 5, phase: "literature_scouting" });

  const snap = tracker.snapshot("proj_a");
  assert.equal(snap.by_phase.contract_draft.input_tokens, 100);
  assert.equal(snap.by_phase.contract_draft.cli_calls, 1);
  assert.equal(snap.by_phase.literature_scouting.output_tokens, 5);
});

test("recordFailure increments cli_failures without changing token totals", () => {
  const tracker = new CostTracker();
  tracker.record("proj_a", { input_tokens: 100, output_tokens: 50, phase: "contract_draft" });
  tracker.recordFailure("proj_a", "contract_draft");

  const snap = tracker.snapshot("proj_a");
  assert.equal(snap.cli_failures, 1);
  assert.equal(snap.input_tokens, 100);
  assert.equal(snap.by_phase.contract_draft.cli_failures, 1);
});

test("overBudget is true once accumulated cost exceeds the session budget", () => {
  const tracker = new CostTracker({ sessionBudgetUsd: 0.001 });
  assert.equal(tracker.overBudget("proj_a"), false);
  // Enough output tokens to exceed $0.001 at Haiku output pricing.
  const tokensToExceed = Math.ceil(0.001 / HAIKU_PRICING.output) + 1;
  tracker.record("proj_a", { input_tokens: 0, output_tokens: tokensToExceed, phase: "contract_draft" });
  assert.equal(tracker.overBudget("proj_a"), true);
});

test("overBudget is always false when no session budget is configured", () => {
  const tracker = new CostTracker();
  tracker.record("proj_a", { input_tokens: 10_000_000, output_tokens: 10_000_000, phase: "contract_draft" });
  assert.equal(tracker.overBudget("proj_a"), false);
});

test("snapshot of an unknown project returns a zeroed shape", () => {
  const tracker = new CostTracker();
  const snap = tracker.snapshot("nope");
  assert.equal(snap.input_tokens, 0);
  assert.equal(snap.output_tokens, 0);
  assert.equal(snap.est_cost_usd, 0);
  assert.equal(snap.cli_calls, 0);
  assert.equal(snap.cli_failures, 0);
  assert.deepEqual(snap.by_phase, {});
});
