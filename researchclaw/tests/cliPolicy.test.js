import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PHASE_CLI_POLICY,
  resolveCliPolicy,
  resolvePhasePolicy,
  saveCliPolicy,
  validateCliPolicy,
  validatePhasePolicyEntry,
  V3_POLICY_PHASES
} from "../settings/cliPolicy.js";

function fakeContext() {
  return {
    providers: [
      { id: "claude", configured: true, baseUrlHost: "yunwu.ai", models: ["claude-haiku-4-5-20251001"] },
      { id: "gemini", configured: true, baseUrlHost: "yunwu.ai", models: ["gemini-3.1-flash-lite"] },
      { id: "codex", configured: true, baseUrlHost: "yunwu.ai", models: ["gpt-5.4-mini"] }
    ]
  };
}

test("DEFAULT_PHASE_CLI_POLICY covers all V3_POLICY_PHASES", () => {
  for (const phase of V3_POLICY_PHASES) {
    assert.ok(DEFAULT_PHASE_CLI_POLICY[phase], `missing default policy for ${phase}`);
  }
});

test("validatePhasePolicyEntry accepts a valid entry", () => {
  const errors = validatePhasePolicyEntry(
    "literature_scouting",
    { provider: "gemini", cli: "gemini-cli", model: "gemini-3.1-flash-lite" },
    fakeContext()
  );
  assert.deepEqual(errors, []);
});

test("validatePhasePolicyEntry rejects unknown phase", () => {
  const errors = validatePhasePolicyEntry("bad_phase", { provider: "mock", cli: "mock" }, fakeContext());
  assert.ok(errors.some((e) => e.includes("unknown phase")));
});

test("validatePhasePolicyEntry rejects provider/cli mismatch", () => {
  const errors = validatePhasePolicyEntry(
    "literature_scouting",
    { provider: "claude", cli: "gemini-cli", model: "claude-haiku-4-5-20251001" },
    fakeContext()
  );
  assert.ok(errors.some((e) => e.includes("does not match provider")));
});

test("validatePhasePolicyEntry rejects model not available for provider", () => {
  const errors = validatePhasePolicyEntry(
    "literature_scouting",
    { provider: "gemini", cli: "gemini-cli", model: "claude-haiku-4-5-20251001" },
    fakeContext()
  );
  assert.ok(errors.some((e) => e.includes("not available")));
});

test("validatePhasePolicyEntry rejects model for mock provider", () => {
  const errors = validatePhasePolicyEntry("literature_scouting", { provider: "mock", cli: "mock", model: "x" }, fakeContext());
  assert.ok(errors.some((e) => e.includes("mock provider must not specify a model")));
});

test("validatePhasePolicyEntry accepts mock without model", () => {
  const errors = validatePhasePolicyEntry("literature_scouting", { provider: "mock", cli: "mock" }, fakeContext());
  assert.deepEqual(errors, []);
});

test("validateCliPolicy validates multiple phases", () => {
  const errors = validateCliPolicy(
    {
      literature_scouting: { provider: "gemini", cli: "gemini-cli", model: "gemini-3.1-flash-lite" },
      idea_generation: { provider: "claude", cli: "gemini-cli", model: "claude-haiku-4-5-20251001" }
    },
    fakeContext()
  );
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("idea_generation"));
});

test("resolveCliPolicy returns defaults when no settings file exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "rc-policy-"));
  const result = resolveCliPolicy({ settingsDir: dir, context: fakeContext() });
  assert.deepEqual(result.policy, DEFAULT_PHASE_CLI_POLICY);
  assert.deepEqual(result.defaults, DEFAULT_PHASE_CLI_POLICY);
});

test("saveCliPolicy merges valid overlay and persists it", () => {
  const dir = mkdtempSync(join(tmpdir(), "rc-policy-"));
  const ctx = fakeContext();
  const result = saveCliPolicy(
    { literature_scouting: { provider: "mock", cli: "mock" } },
    { settingsDir: dir, context: ctx }
  );
  assert.equal(result.ok, true);
  assert.equal(result.policy.literature_scouting.provider, "mock");
  assert.equal(result.policy.contract_draft.provider, "claude");

  const reloaded = resolveCliPolicy({ settingsDir: dir, context: ctx });
  assert.equal(reloaded.policy.literature_scouting.provider, "mock");
});

test("saveCliPolicy rejects invalid overlay and does not persist", () => {
  const dir = mkdtempSync(join(tmpdir(), "rc-policy-"));
  const result = saveCliPolicy(
    { literature_scouting: { provider: "claude", cli: "gemini-cli", model: "claude-haiku-4-5-20251001" } },
    { settingsDir: dir, context: fakeContext() }
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);

  const reloaded = resolveCliPolicy({ settingsDir: dir, context: fakeContext() });
  assert.equal(reloaded.policy.literature_scouting.provider, "gemini");
});

test("resolvePhasePolicy returns effective entry for a phase", () => {
  const dir = mkdtempSync(join(tmpdir(), "rc-policy-"));
  saveCliPolicy({ idea_generation: { provider: "mock", cli: "mock" } }, { settingsDir: dir, context: fakeContext() });
  assert.deepEqual(resolvePhasePolicy("idea_generation", { settingsDir: dir, context: fakeContext() }), {
    provider: "mock",
    cli: "mock"
  });
  assert.equal(resolvePhasePolicy("summary", { settingsDir: dir, context: fakeContext() }).provider, "claude");
});
