import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../engine/events.js";
import { CostTracker } from "../engine/cost.js";
import { createCliRouter } from "../adapters/cliRouter.js";

// Fake adapters record their calls and return a canned success/failure. Each
// tags its result with its own provider so we can assert who actually ran.
function fakeAdapter(provider, { ok = true, throws = false } = {}) {
  return {
    name: provider,
    available: true,
    calls: [],
    async run(request) {
      this.calls.push(request);
      if (throws) throw new Error("boom");
      if (ok) {
        return {
          ok: true,
          adapter: provider,
          provider,
          cli: `${provider}-cli`,
          output: { from: provider },
          usage: { input_tokens: 10, output_tokens: 5, model: `${provider}-model` }
        };
      }
      return { ok: false, adapter: provider, error: { code: "schema_violation", message: "bad", retryable: true } };
    }
  };
}

function fakeMock() {
  return {
    name: "mock",
    calls: [],
    async run(request) {
      this.calls.push(request);
      return { ok: true, adapter: "mock", output: { from: "mock" } };
    }
  };
}

// A policy map keyed by phase, mimicking resolvePhasePolicy without touching disk.
function policyResolver(map) {
  return (phase) => map[phase] || null;
}

const POLICY = {
  contract_draft: { provider: "claude", cli: "claude-code", model: "claude-haiku-4-5-20251001" },
  literature_scouting: { provider: "gemini", cli: "gemini-cli", model: "gemini-3.1-flash-lite" },
  baseline_reproduction_checklist: { provider: "codex", cli: "codex-cli", model: "gpt-5.4-mini" },
  summary: { provider: "mock", cli: "mock", model: null }
};

function makeRouter({ adapters, costTracker, eventBus } = {}) {
  return createCliRouter({
    adapters,
    costTracker,
    eventBus,
    resolvePolicy: policyResolver(POLICY)
  });
}

function baseAdapters() {
  return {
    claude: fakeAdapter("claude"),
    gemini: fakeAdapter("gemini"),
    codex: fakeAdapter("codex"),
    mock: fakeMock()
  };
}

const req = (phase) => ({ project_id: "proj_a", phase, output_schema: "ResearchContractV1" });

// --- the core M3 acceptance: same router, different CLI per phase policy ---

test("routes contract_draft to the Claude adapter", async () => {
  const adapters = baseAdapters();
  const result = await makeRouter({ adapters }).run(req("contract_draft"));
  assert.equal(result.ok, true);
  assert.equal(result.provider, "claude");
  assert.equal(adapters.claude.calls.length, 1);
  assert.equal(adapters.gemini.calls.length, 0);
  assert.equal(adapters.codex.calls.length, 0);
  assert.deepEqual(result.source, { provider: "claude", cli: "claude-code", model: "claude-haiku-4-5-20251001", adapter: "claude" });
});

test("routes literature_scouting to the Gemini adapter", async () => {
  const adapters = baseAdapters();
  const result = await makeRouter({ adapters }).run(req("literature_scouting"));
  assert.equal(result.provider, "gemini");
  assert.equal(adapters.gemini.calls.length, 1);
  assert.equal(adapters.claude.calls.length, 0);
  assert.equal(result.source.cli, "gemini-cli");
});

test("routes baseline_reproduction_checklist to the Codex adapter", async () => {
  const adapters = baseAdapters();
  const result = await makeRouter({ adapters }).run(req("baseline_reproduction_checklist"));
  assert.equal(result.provider, "codex");
  assert.equal(adapters.codex.calls.length, 1);
  assert.equal(result.source.cli, "codex-cli");
});

test("mock configured for a phase runs mock as the real choice, not a degradation", async () => {
  const adapters = baseAdapters();
  const result = await makeRouter({ adapters }).run(req("summary"));
  assert.equal(result.adapter, "mock");
  assert.notEqual(result.degraded, true);
  assert.equal(result.source.provider, "mock");
  assert.equal(adapters.mock.calls.length, 1);
});

// --- honest fallback ---

test("unavailable provider CLI degrades to mock, tagged degraded, source keeps the intended provider", async () => {
  const adapters = baseAdapters();
  adapters.gemini.available = false;
  const result = await makeRouter({ adapters }).run(req("literature_scouting"));
  assert.equal(result.adapter, "mock");
  assert.equal(result.degraded, true);
  assert.equal(result.source.provider, "gemini");
  assert.equal(result.source.adapter, "mock");
  assert.equal(adapters.mock.calls.length, 1);
});

test("provider run failure degrades to mock and records a CLI failure", async () => {
  const adapters = baseAdapters();
  adapters.codex = fakeAdapter("codex", { ok: false });
  const costTracker = new CostTracker();
  const result = await makeRouter({ adapters, costTracker }).run(req("baseline_reproduction_checklist"));
  assert.equal(result.adapter, "mock");
  assert.equal(result.degraded, true);
  assert.equal(costTracker.snapshot("proj_a").cli_failures, 1);
});

test("provider run throwing degrades to mock and records a CLI failure", async () => {
  const adapters = baseAdapters();
  adapters.gemini = fakeAdapter("gemini", { throws: true });
  const costTracker = new CostTracker();
  const result = await makeRouter({ adapters, costTracker }).run(req("literature_scouting"));
  assert.equal(result.adapter, "mock");
  assert.equal(result.degraded, true);
  assert.equal(costTracker.snapshot("proj_a").cli_failures, 1);
});

test("successful run records usage under the phase", async () => {
  const adapters = baseAdapters();
  const costTracker = new CostTracker();
  await makeRouter({ adapters, costTracker }).run(req("contract_draft"));
  const snap = costTracker.snapshot("proj_a");
  assert.equal(snap.cli_calls, 1);
  assert.equal(snap.by_phase.contract_draft.cli_calls, 1);
});

test("over budget degrades to mock without calling the provider", async () => {
  const adapters = baseAdapters();
  const costTracker = new CostTracker({ sessionBudgetUsd: 0 });
  costTracker.record("proj_a", { input_tokens: 1, output_tokens: 1, phase: "contract_draft" });
  const result = await makeRouter({ adapters, costTracker }).run(req("contract_draft"));
  assert.equal(result.adapter, "mock");
  assert.equal(result.degraded, true);
  assert.equal(adapters.claude.calls.length, 0);
});

test("emits a degraded cli_chunk so the panel can show a banner", async () => {
  const adapters = baseAdapters();
  adapters.gemini.available = false;
  const eventBus = new EventBus();
  const events = [];
  eventBus.subscribe("proj_a", (e) => events.push(e));
  await makeRouter({ adapters, eventBus }).run(req("literature_scouting"));
  assert.ok(events.find((e) => e.type === "cli_chunk" && e.data.degraded), "expected a degraded cli_chunk");
});

// --- consult stays Claude-only, never mock ---

test("consult delegates to the Claude adapter and records usage under consult", async () => {
  const adapters = baseAdapters();
  adapters.claude.consult = async function (request) {
    this.consultCalls = (this.consultCalls || 0) + 1;
    return { ok: true, adapter: "claude", session_id: "s1", text: "hi", usage: { input_tokens: 3, output_tokens: 1, model: "claude-haiku-4-5" } };
  };
  const costTracker = new CostTracker();
  const result = await makeRouter({ adapters, costTracker }).consult({ project_id: "proj_a", message: "hi?" });
  assert.equal(result.ok, true);
  assert.equal(adapters.claude.consultCalls, 1);
  assert.equal(costTracker.snapshot("proj_a").by_phase.consult.cli_calls, 1);
});

test("consult refuses honestly (no mock) when Claude is unavailable", async () => {
  const adapters = baseAdapters();
  adapters.claude.available = false;
  const result = await makeRouter({ adapters }).consult({ project_id: "proj_a", message: "hi?" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unavailable");
  assert.equal(adapters.mock.calls.length, 0);
});

test("createCliRouter requires a mock adapter", () => {
  assert.throws(() => createCliRouter({ adapters: { claude: fakeAdapter("claude") } }), /mock adapter/);
});
