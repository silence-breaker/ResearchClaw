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

// --- M4: cache token pricing + budget status ---

test("HAIKU_PRICING includes cache write/read rates", () => {
  assert.equal(HAIKU_PRICING.cache_write, 1.25 / 1_000_000);
  assert.equal(HAIKU_PRICING.cache_read, 0.1 / 1_000_000);
});

test("estimateCostUsd includes cache creation + read tokens", () => {
  const usage = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 1000, cache_read_input_tokens: 40000 };
  const cost = estimateCostUsd(usage, HAIKU_PRICING);
  const expected =
    100 * HAIKU_PRICING.input +
    50 * HAIKU_PRICING.output +
    1000 * HAIKU_PRICING.cache_write +
    40000 * HAIKU_PRICING.cache_read;
  assert.equal(cost, expected);
});

test("record accumulates cache tokens and snapshot exposes them (no longer underestimates)", () => {
  const tracker = new CostTracker();
  tracker.record("proj_c", {
    input_tokens: 16,
    output_tokens: 520,
    cache_creation_input_tokens: 40885,
    cache_read_input_tokens: 36748,
    phase: "contract_draft"
  });
  const snap = tracker.snapshot("proj_c");
  assert.equal(snap.cache_creation_tokens, 40885);
  assert.equal(snap.cache_read_tokens, 36748);
  // cost must reflect the cache tokens that dominate real usage
  const onlyInOut = estimateCostUsd({ input_tokens: 16, output_tokens: 520 }, HAIKU_PRICING);
  assert.ok(snap.est_cost_usd > onlyInOut, "cost must include cache tokens, not just input/output");
});

test("budgetStatus reports ok when no budget configured", () => {
  const tracker = new CostTracker();
  tracker.record("proj_b", { input_tokens: 1_000_000, output_tokens: 0, phase: "contract_draft" });
  const status = tracker.budgetStatus("proj_b");
  assert.equal(status.limit, null);
  assert.equal(status.state, "ok");
});

test("budgetStatus warns near the limit and flags over above it", () => {
  const tracker = new CostTracker({ sessionBudgetUsd: 1.0, warnRatio: 0.8 });
  // ~$0.85 → warn (output at $5/1M → 170k tokens = $0.85)
  tracker.record("proj_w", { input_tokens: 0, output_tokens: 170_000, phase: "contract_draft" });
  let status = tracker.budgetStatus("proj_w");
  assert.equal(status.state, "warn");
  assert.ok(status.ratio >= 0.8 && status.ratio <= 1);
  // push over $1.00
  tracker.record("proj_w", { input_tokens: 0, output_tokens: 60_000, phase: "contract_draft" });
  status = tracker.budgetStatus("proj_w");
  assert.equal(status.state, "over");
  assert.equal(status.limit, 1.0);
});

test("snapshot carries the budget block", () => {
  const tracker = new CostTracker({ sessionBudgetUsd: 1.0 });
  tracker.record("proj_sb", { input_tokens: 0, output_tokens: 10, phase: "contract_draft" });
  const snap = tracker.snapshot("proj_sb");
  assert.ok(snap.budget);
  assert.equal(snap.budget.state, "ok");
});

// --- M4: by_provider 桶 ---

test("record buckets usage by provider when provider is given", () => {
  const tracker = new CostTracker();
  tracker.record("proj_p", { input_tokens: 100, output_tokens: 50, phase: "contract_draft", provider: "claude" });
  tracker.record("proj_p", { input_tokens: 10, output_tokens: 5, phase: "literature_scouting", provider: "gemini" });
  const snap = tracker.snapshot("proj_p");
  assert.equal(snap.by_provider.claude.input_tokens, 100);
  assert.equal(snap.by_provider.claude.cli_calls, 1);
  assert.equal(snap.by_provider.gemini.output_tokens, 5);
});

test("recordFailure buckets a failure under its provider", () => {
  const tracker = new CostTracker();
  tracker.recordFailure("proj_p", "literature_scouting", "gemini");
  const snap = tracker.snapshot("proj_p");
  assert.equal(snap.by_provider.gemini.cli_failures, 1);
});

test("record without a provider does not create a by_provider bucket", () => {
  const tracker = new CostTracker();
  tracker.record("proj_p", { input_tokens: 1, output_tokens: 1, phase: "contract_draft" });
  const snap = tracker.snapshot("proj_p");
  assert.deepEqual(snap.by_provider, {});
});

test("unknown project snapshot has an empty by_provider", () => {
  const tracker = new CostTracker();
  assert.deepEqual(tracker.snapshot("nope").by_provider, {});
});
