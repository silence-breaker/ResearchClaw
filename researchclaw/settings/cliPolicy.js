import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getProviderStatus } from "../adapters/providers.js";
import { researchPhases } from "../engine/phases.js";

// V3 phases that may be configured before they are wired into the orchestrator
// (experiment phases land in M5). This list is the policy contract surface.
export const V3_POLICY_PHASES = [
  ...researchPhases.filter((p) => p !== "idle" && p !== "intake" && p !== "blocked" && p !== "contract_review"),
  "experiment_planning",
  "experiment_execution",
  "experiment_review"
];

export const CLI_BY_PROVIDER = {
  claude: "claude-code",
  gemini: "gemini-cli",
  codex: "codex-cli",
  mock: "mock"
};

// Sensible defaults that keep CI/demo green when no real CLI is configured.
export const DEFAULT_PHASE_CLI_POLICY = {
  contract_draft: { provider: "claude", cli: "claude-code", model: "claude-haiku-4-5-20251001" },
  literature_scouting: { provider: "gemini", cli: "gemini-cli", model: "gemini-3.1-flash-lite" },
  baseline_selection: { provider: "claude", cli: "claude-code", model: "claude-haiku-4-5-20251001" },
  baseline_reproduction_checklist: { provider: "codex", cli: "codex-cli", model: "gpt-5.4-mini" },
  idea_generation: { provider: "gemini", cli: "gemini-cli", model: "gemini-3.1-flash-lite" },
  idea_review: { provider: "claude", cli: "claude-code", model: "claude-haiku-4-5-20251001" },
  experiment_planning: { provider: "codex", cli: "codex-cli", model: "gpt-5.4-mini" },
  experiment_execution: { provider: "codex", cli: "codex-cli", model: "gpt-5.4-mini" },
  experiment_review: { provider: "claude", cli: "claude-code", model: "claude-haiku-4-5-20251001" },
  summary: { provider: "claude", cli: "claude-code", model: "claude-haiku-4-5-20251001" }
};

const VALID_PROVIDERS = Object.keys(CLI_BY_PROVIDER);
const VALID_CLIS = Object.values(CLI_BY_PROVIDER);

function settingsPath(settingsDir) {
  return join(settingsDir, "settings.json");
}

function ensureSettingsDir(settingsDir) {
  mkdirSync(settingsDir, { recursive: true });
}

function readSettings(settingsDir) {
  const path = settingsPath(settingsDir);
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settingsDir, settings) {
  ensureSettingsDir(settingsDir);
  writeFileSync(settingsPath(settingsDir), `${JSON.stringify(settings, null, 2)}\n`);
}

// Validates a single phase policy entry. `context.providers` is the sanitized
// provider status from getProviderStatus(); `context.cliStatus` is optional and
// only used for informational warnings (we do not block on CLI availability).
export function validatePhasePolicyEntry(phase, entry, context = {}) {
  const errors = [];
  if (!V3_POLICY_PHASES.includes(phase)) {
    errors.push(`unknown phase: ${phase}`);
  }
  if (!entry || typeof entry !== "object") {
    errors.push("policy entry must be an object");
    return errors;
  }
  if (!VALID_PROVIDERS.includes(entry.provider)) {
    errors.push(`invalid provider: ${entry.provider}`);
  }
  if (!VALID_CLIS.includes(entry.cli)) {
    errors.push(`invalid cli: ${entry.cli}`);
  }
  if (entry.provider !== "mock" && CLI_BY_PROVIDER[entry.provider] !== entry.cli) {
    errors.push(`cli ${entry.cli} does not match provider ${entry.provider}`);
  }
  if (entry.provider === "mock") {
    if (entry.model !== undefined && entry.model !== "" && entry.model !== null) {
      errors.push("mock provider must not specify a model");
    }
  } else {
    if (!entry.model || typeof entry.model !== "string") {
      errors.push(`model is required for provider ${entry.provider}`);
    } else {
      const providerStatus = (context.providers || []).find((p) => p.id === entry.provider);
      if (providerStatus && providerStatus.configured && !providerStatus.models.includes(entry.model)) {
        errors.push(`model ${entry.model} is not available for provider ${entry.provider}`);
      }
    }
  }
  return errors;
}

// Validates a full or partial policy map. Returns an array of error strings.
export function validateCliPolicy(partialPolicy, context = {}) {
  const errors = [];
  for (const [phase, entry] of Object.entries(partialPolicy)) {
    const entryErrors = validatePhasePolicyEntry(phase, entry, context);
    errors.push(...entryErrors.map((e) => `${phase}: ${e}`));
  }
  return errors;
}

function mergePolicy(base, overlay) {
  const merged = { ...base };
  for (const [phase, entry] of Object.entries(overlay)) {
    if (entry) {
      merged[phase] = { ...entry };
    }
  }
  return merged;
}

// Returns the effective policy (defaults + user overrides), the raw defaults,
// and the user overrides. The orchestrator/router should call this to decide
// which adapter/model to use for a phase.
export function resolveCliPolicy({
  settingsDir = resolve(process.cwd(), ".researchclaw"),
  context = null
} = {}) {
  const ctx = context || { providers: getProviderStatus() };
  const settings = readSettings(settingsDir);
  const overlay = settings.phase_cli_policy || {};
  const policy = mergePolicy(DEFAULT_PHASE_CLI_POLICY, overlay);
  return {
    policy,
    defaults: { ...DEFAULT_PHASE_CLI_POLICY },
    fallbackPolicy: { ...DEFAULT_PHASE_CLI_POLICY },
    context: ctx
  };
}

// Persists a partial policy overlay. Validation runs against the submitted
// entries only; valid entries are merged with existing overrides, invalid
// submissions are rejected atomically.
export function saveCliPolicy(
  partialPolicy,
  { settingsDir = resolve(process.cwd(), ".researchclaw"), context = null } = {}
) {
  const ctx = context || { providers: getProviderStatus() };
  const errors = validateCliPolicy(partialPolicy, ctx);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const settings = readSettings(settingsDir);
  const overlay = settings.phase_cli_policy || {};
  settings.phase_cli_policy = mergePolicy(overlay, partialPolicy);
  writeSettings(settingsDir, settings);
  return { ok: true, ...resolveCliPolicy({ settingsDir, context: ctx }) };
}

// Convenience: resolve a single phase's effective entry.
export function resolvePhasePolicy(phase, options = {}) {
  const { policy } = resolveCliPolicy(options);
  return policy[phase] || DEFAULT_PHASE_CLI_POLICY[phase] || null;
}
