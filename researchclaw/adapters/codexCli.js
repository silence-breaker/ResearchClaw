import { spawn, execSync } from "node:child_process";
import { getOutputSchema, validateOutput } from "./schemas.js";
import { buildJsonPrompt, extractJsonObject, roleForPhase } from "./cliShared.js";

const PROVIDER = "codex";
const CLI = "codex-cli";
// The named model_provider registered on the codex command line. Codex's default
// built-in `openai` provider 403s against yunwu.ai (docs/CLI接入配置.md §3.1), so
// a named provider with an explicit base_url + wire_api is mandatory.
const DEFAULT_PROVIDER_NAME = "yunwu";

function fail(code, message, retryable = true) {
  return { ok: false, adapter: PROVIDER, provider: PROVIDER, cli: CLI, error: { code, message, retryable } };
}

function defaultWhich(bin) {
  try {
    return execSync(`command -v ${bin}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch {
    return null;
  }
}

// Codex CLI adapter (docs/CLI接入配置.md §3). Non-interactive invocation:
//   codex exec --skip-git-repo-check \
//     -c model_providers.<name>.name="<name>" \
//     -c model_providers.<name>.base_url="<openai_base_url>" \
//     -c model_providers.<name>.env_key="OPENAI_API_KEY" \
//     -c model_providers.<name>.wire_api="responses" \
//     -c model_provider="<name>" \
//     --model <model> "<prompt>"
// The key never appears in argv — codex reads it from the env var named by
// env_key (OPENAI_API_KEY), injected into the child env only. wire_api MUST be
// "responses" ("chat" 403s against yunwu.ai, verified 2026-07-11). Output is
// plain text → extract + schema-validate the JSON object. Subprocess injectable
// for deterministic testing.
export class CodexCliAdapter {
  name = PROVIDER;

  constructor({
    eventBus = null,
    costTracker = null,
    config = {},
    spawnImpl = spawn,
    now = () => new Date().toISOString()
  } = {}) {
    this.eventBus = eventBus;
    this.costTracker = costTracker;
    this.config = {
      model: "gpt-5.4-mini",
      timeoutMs: 120000,
      bin: "codex",
      baseUrl: null,
      apiKey: null,
      providerName: DEFAULT_PROVIDER_NAME,
      wireApi: "responses",
      ...config
    };
    this.spawnImpl = spawnImpl;
    this.now = now;
    this.available = config.available ?? true;
  }

  static isAvailable({ which = defaultWhich } = {}) {
    return Boolean(which("codex"));
  }

  // TOML string values passed to `-c` must keep their quotes (codex parses the
  // value as a TOML fragment; a bare URL is not valid TOML). Each `-c` pair is a
  // single argv element. The key is referenced by name (env_key), not value.
  buildArgs(prompt) {
    const p = this.config.providerName;
    return [
      "exec",
      "--skip-git-repo-check",
      "-c",
      `model_providers.${p}.name="${p}"`,
      "-c",
      `model_providers.${p}.base_url="${this.config.baseUrl}"`,
      "-c",
      `model_providers.${p}.env_key="OPENAI_API_KEY"`,
      "-c",
      `model_providers.${p}.wire_api="${this.config.wireApi}"`,
      "-c",
      `model_provider="${p}"`,
      "--model",
      this.config.model,
      prompt
    ];
  }

  // Child env: key only, under OPENAI_API_KEY (the env_key codex was told to
  // read). Never mutates baseEnv; the key never reaches argv or the transcript.
  buildEnv(baseEnv = process.env) {
    const env = { ...baseEnv };
    if (this.config.apiKey) {
      env.OPENAI_API_KEY = this.config.apiKey;
    }
    return env;
  }

  emitChunk(request, data) {
    this.eventBus?.emit(request.project_id, { type: "cli_chunk", data });
  }

  consume(child, request) {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* already gone */
        }
      }, this.config.timeoutMs);

      child.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        this.emitChunk(request, {
          phase: request.phase,
          role: roleForPhase(request.phase),
          provider: PROVIDER,
          cli: CLI,
          model: this.config.model,
          text,
          ts: this.now()
        });
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("error", (err) => {
        stderr += String(err?.message || err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, timedOut, exitCode: code });
      });
    });
  }

  async run(request) {
    const schema = getOutputSchema(request.output_schema); // throws on unknown schema name
    const prompt = buildJsonPrompt(request, schema);
    const child = this.spawnImpl(this.config.bin, this.buildArgs(prompt), { env: this.buildEnv() });
    const consumed = await this.consume(child, request);

    if (consumed.timedOut) {
      return fail("timeout", `Codex CLI run exceeded ${this.config.timeoutMs}ms`);
    }
    if (consumed.exitCode !== 0 && !consumed.stdout.trim()) {
      const detail = consumed.stderr ? ` (stderr: ${consumed.stderr.trim()})` : "";
      return fail("cli_error", `Codex CLI exited ${consumed.exitCode}${detail}`);
    }

    const out = extractJsonObject(consumed.stdout);
    if (!out) {
      const detail = consumed.stderr ? ` (stderr: ${consumed.stderr.trim()})` : "";
      return fail("missing_output", `Codex CLI produced no parseable JSON object${detail}`);
    }
    const check = validateOutput(request.output_schema, out);
    if (!check.ok) {
      return fail("schema_violation", check.errors.join("; "));
    }

    const usage = { input_tokens: 0, output_tokens: 0, model: this.config.model, turns: 1 };
    const summary = {
      model: this.config.model,
      time: this.now(),
      role: roleForPhase(request.phase),
      summary: consumed.stdout.trim().slice(0, 280) || `Codex produced ${request.output_schema}`,
      artifact_refs: []
    };
    return {
      ok: true,
      adapter: PROVIDER,
      provider: PROVIDER,
      cli: CLI,
      model: this.config.model,
      output: out,
      usage,
      raw: { transcript: consumed.stdout, summary }
    };
  }
}
