import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../engine/events.js";
import { CostTracker } from "../engine/cost.js";
import { createRoutingAdapter } from "../adapters/route.js";

// Minimal fake adapters to exercise routing without spawning anything.
function fakeClaude({ ok = true } = {}) {
  return {
    name: "claude",
    available: true,
    calls: [],
    async run(request) {
      this.calls.push(request);
      if (ok) {
        return {
          ok: true,
          adapter: "claude",
          output: { contract: true },
          usage: { input_tokens: 100, output_tokens: 50, model: "claude-haiku-4-5", turns: 2 }
        };
      }
      return { ok: false, adapter: "claude", error: { code: "schema_violation", message: "bad", retryable: true } };
    }
  };
}

function fakeMock() {
  return {
    name: "mock",
    calls: [],
    async run(request) {
      this.calls.push(request);
      return { ok: true, adapter: "mock", output: { contract: "mock" } };
    }
  };
}

const request = (phase = "contract_draft") => ({ project_id: "proj_a", phase, output_schema: "ResearchContractV1" });

test("routes opted-in phase to the primary adapter on success", async () => {
  const primary = fakeClaude();
  const fallback = fakeMock();
  const costTracker = new CostTracker();
  const adapter = createRoutingAdapter({ phases: ["contract_draft"], primary, fallback, costTracker });

  const result = await adapter.run(request("contract_draft"));
  assert.equal(result.ok, true);
  assert.equal(result.adapter, "claude");
  assert.equal(primary.calls.length, 1);
  assert.equal(fallback.calls.length, 0);
  assert.equal(costTracker.snapshot("proj_a").cli_calls, 1);
});

test("phases not opted-in go straight to the fallback (mock), marked degraded", async () => {
  const primary = fakeClaude();
  const fallback = fakeMock();
  const adapter = createRoutingAdapter({ phases: ["contract_draft"], primary, fallback, costTracker: new CostTracker() });

  const result = await adapter.run(request("literature_scouting"));
  assert.equal(result.adapter, "mock");
  assert.equal(result.degraded, true);
  assert.equal(primary.calls.length, 0);
  assert.equal(fallback.calls.length, 1);
});

test("primary failure degrades to fallback and counts a CLI failure", async () => {
  const primary = fakeClaude({ ok: false });
  const fallback = fakeMock();
  const costTracker = new CostTracker();
  const adapter = createRoutingAdapter({ phases: ["contract_draft"], primary, fallback, costTracker });

  const result = await adapter.run(request("contract_draft"));
  assert.equal(result.ok, true);
  assert.equal(result.adapter, "mock");
  assert.equal(result.degraded, true);
  assert.equal(costTracker.snapshot("proj_a").cli_failures, 1);
  assert.equal(fallback.calls.length, 1);
});

test("over-budget skips the primary and degrades to fallback", async () => {
  const primary = fakeClaude();
  const fallback = fakeMock();
  const costTracker = new CostTracker({ sessionBudgetUsd: 0 });
  costTracker.record("proj_a", { input_tokens: 1, output_tokens: 1, phase: "contract_draft" });
  const adapter = createRoutingAdapter({ phases: ["contract_draft"], primary, fallback, costTracker });

  const result = await adapter.run(request("contract_draft"));
  assert.equal(result.adapter, "mock");
  assert.equal(result.degraded, true);
  assert.equal(primary.calls.length, 0);
});

test("unavailable primary degrades to fallback", async () => {
  const primary = fakeClaude();
  primary.available = false;
  const fallback = fakeMock();
  const adapter = createRoutingAdapter({ phases: ["contract_draft"], primary, fallback, costTracker: new CostTracker() });

  const result = await adapter.run(request("contract_draft"));
  assert.equal(result.adapter, "mock");
  assert.equal(result.degraded, true);
  assert.equal(primary.calls.length, 0);
});

test("emits a degraded cli_chunk event so the panel can show a banner", async () => {
  const primary = fakeClaude({ ok: false });
  const fallback = fakeMock();
  const eventBus = new EventBus();
  const events = [];
  eventBus.subscribe("proj_a", (event) => events.push(event));
  const adapter = createRoutingAdapter({
    phases: ["contract_draft"],
    primary,
    fallback,
    costTracker: new CostTracker(),
    eventBus
  });

  await adapter.run(request("contract_draft"));
  const degraded = events.find((e) => e.type === "cli_chunk" && e.data.degraded);
  assert.ok(degraded, "expected a degraded cli_chunk event");
});
