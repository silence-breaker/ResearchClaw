// Real M3 chain smoke test against ALL THREE real CLIs (Claude / Gemini / Codex).
// Local-only, gated behind RESEARCHCLAW_ENABLE_CLAUDE=1 — never in CI, spends real
// tokens on the yunwu.ai key from API.md.
//
// Why this shape: only the contract_draft phase has BOTH a registered output
// schema (ResearchContractV1) and a real validator. So we exercise all three
// providers through that one schema-backed phase by pinning the phase policy to
// each provider in turn and driving the SAME request through the SAME CliRouter.
// This is the M3 acceptance: one router, different CLI per policy, each producing
// a schema-valid, NON-degraded artifact.
//
// For each provider we assert:
//   result.ok === true
//   result.source.provider === <provider>   (routed to the intended adapter)
//   result.degraded !== true                 (a REAL CLI ran, not the mock fallback)
//   output passes validateResearchContract    (schema-valid, machine-checkable)
//
// A degraded/failed provider is reported honestly (not a hard crash) so one dead
// CLI does not mask the others. Exit code is nonzero if any provider failed.
//
// Usage:  RESEARCHCLAW_ENABLE_CLAUDE=1 node researchclaw/scripts/smoke-m3.js
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EventBus } from "../engine/events.js";
import { CostTracker } from "../engine/cost.js";
import { MockModelAdapter } from "../adapters/mock.js";
import { ClaudeCodeAdapter } from "../adapters/claudeCode.js";
import { GeminiCliAdapter } from "../adapters/geminiCli.js";
import { CodexCliAdapter } from "../adapters/codexCli.js";
import { resolveClaudeModel } from "../adapters/claudeConfig.js";
import { loadProviders } from "../adapters/providers.js";
import { createCliRouter } from "../adapters/cliRouter.js";
import { validateResearchContract } from "../contract/schema.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function log(step, data) {
  console.log(`\n=== ${step} ===`);
  console.log(JSON.stringify(data, null, 2));
}

// The one request we drive through every provider. contract_draft is the only
// phase with a registered schema + validator.
const request = () => ({
  task_id: "smoke_m3",
  project_id: `proj_smoke_m3_${process.pid}`,
  phase: "contract_draft",
  instructions: "Draft a machine-checkable research contract.",
  inputs: [
    { ref: "user_text", type: "research_direction", content: "Diffusion models for time-series forecasting" }
  ],
  output_schema: "ResearchContractV1"
});

async function main() {
  // Cost guard. Opt-in via the env var OR the --enable-claude CLI flag. The flag
  // exists because `VAR=1 node ...` in an npm script is POSIX-only and fails on
  // Windows cmd.exe; the flag is portable across every OS.
  if (process.env.RESEARCHCLAW_ENABLE_CLAUDE !== "1" && !process.argv.includes("--enable-claude")) {
    console.error("Refusing to run: pass --enable-claude (or set RESEARCHCLAW_ENABLE_CLAUDE=1). This spends real tokens.");
    process.exit(2);
  }

  const providers = loadProviders();
  const timeoutMs = process.env.RESEARCHCLAW_TIMEOUT_MS ? Number(process.env.RESEARCHCLAW_TIMEOUT_MS) : 120000;
  const eventBus = new EventBus();
  const costTracker = new CostTracker();

  // Build the three real adapters + mock, exactly like server.buildAdapter but
  // without the router's default policy resolver (we inject our own per run).
  const claudeModel = providers.claude?.model || resolveClaudeModel();
  const claude = new ClaudeCodeAdapter({
    eventBus,
    costTracker,
    config: {
      model: claudeModel,
      maxTurns: 20,
      timeoutMs,
      available: ClaudeCodeAdapter.isAvailable(),
      baseUrl: providers.claude?.baseUrl || null,
      apiKey: providers.claude?.apiKey || null
    }
  });
  const gemini = new GeminiCliAdapter({
    eventBus,
    costTracker,
    config: {
      model: providers.gemini?.model || "gemini-3.1-flash-lite",
      timeoutMs,
      available: Boolean(providers.gemini) && GeminiCliAdapter.isAvailable(),
      baseUrl: providers.gemini?.baseUrl || null,
      apiKey: providers.gemini?.apiKey || null
    }
  });
  const codex = new CodexCliAdapter({
    eventBus,
    costTracker,
    config: {
      model: providers.codex?.model || "gpt-5.4-mini",
      timeoutMs,
      available: Boolean(providers.codex) && CodexCliAdapter.isAvailable(),
      baseUrl: providers.codex?.baseUrl || null,
      apiKey: providers.codex?.apiKey || null
    }
  });
  const adapters = { claude, gemini, codex, mock: new MockModelAdapter() };

  // Live CLI output to the console so a human can watch the real process channel.
  const req0 = request();
  eventBus.subscribe(req0.project_id, (event) => {
    if (event.type === "cli_chunk" && event.data?.text) {
      const tag = event.data.degraded ? "降级" : event.data.provider || "cli";
      process.stdout.write(`[${tag}] ${String(event.data.text).slice(0, 200)}\n`);
    }
  });

  const targets = ["claude", "gemini", "codex"];
  const results = [];
  for (const provider of targets) {
    // A router whose policy pins contract_draft to THIS provider. Same schema,
    // same request — only the routed CLI changes.
    const policy = {
      contract_draft: {
        provider,
        cli: { claude: "claude-code", gemini: "gemini-cli", codex: "codex-cli" }[provider],
        model: adapters[provider].config.model
      }
    };
    const router = createCliRouter({
      adapters,
      costTracker,
      eventBus,
      resolvePolicy: (phase) => policy[phase] || null
    });

    console.log(`\n\n########## routing contract_draft -> ${provider} ##########`);
    const startedAt = Date.now();
    let result;
    try {
      result = await router.run(req0);
    } catch (err) {
      result = { ok: false, error: { code: "threw", message: String(err?.message || err) } };
    }
    const elapsedMs = Date.now() - startedAt;

    // Evaluate the four acceptance conditions.
    const routedRight = result?.source?.provider === provider;
    const notDegraded = result?.degraded !== true;
    let schemaOk = false;
    let schemaErrors = [];
    if (result?.ok && result.output) {
      const v = validateResearchContract(result.output);
      schemaOk = v.ok;
      schemaErrors = v.errors || [];
    }
    const pass = Boolean(result?.ok && routedRight && notDegraded && schemaOk);

    log(`${provider} result`, {
      ok: result?.ok,
      adapter: result?.adapter,
      source: result?.source,
      degraded: result?.degraded === true,
      model: result?.model,
      elapsed_ms: elapsedMs,
      error: result?.error || null,
      checks: { routed_to_intended: routedRight, not_degraded: notDegraded, schema_valid: schemaOk },
      schema_errors: schemaErrors,
      VERDICT: pass ? "PASS (real CLI, schema-valid)" : "FAIL"
    });

    results.push({
      provider,
      pass,
      ok: Boolean(result?.ok),
      degraded: result?.degraded === true,
      routed_to_intended: routedRight,
      schema_valid: schemaOk,
      elapsed_ms: elapsedMs,
      error: result?.error || null
    });
  }

  const allPass = results.every((r) => r.pass);
  const summary = {
    finished_at: new Date().toISOString(),
    project_id: req0.project_id,
    all_pass: allPass,
    results,
    usage: costTracker.snapshot(req0.project_id)
  };
  log("M3 SMOKE SUMMARY", summary);

  mkdirSync(join(repoRoot, "logs"), { recursive: true });
  const file = join(repoRoot, "logs", `smoke-m3-${summary.finished_at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\nM3 smoke log written to ${file}`);

  if (!allPass) {
    console.error("\nAt least one provider FAILED the real M3 chain. See per-provider VERDICT above.");
    process.exit(1);
  }
  console.log("\nAll three real CLIs passed the M3 chain (routed, non-degraded, schema-valid).");
}

main().catch((err) => {
  console.error("M3 smoke run crashed:", err);
  process.exit(1);
});
