import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getOutputSchema, validateOutput } from "./schemas.js";
import { buildJsonPrompt, extractJsonObject, roleForPhase } from "./cliShared.js";

const PROVIDER = "gemini";
const CLI = "gemini-cli";

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

// Gemini CLI adapter (docs/CLI接入配置.md §4). Headless invocation:
//   gemini -p <prompt> -m <model> --skip-trust
// base_url + key are injected through the child env
// (GOOGLE_GEMINI_BASE_URL / GEMINI_API_KEY) — never argv, raw_log, SSE or
// artifact (§7.2/§7.3). gemini headless output is plain text, so the structured
// artifact is extracted from stdout and schema-validated; a non-JSON reply is a
// schema_violation, never a silent pass (§4.4). Subprocess is injectable for
// deterministic testing.
export class GeminiCliAdapter {
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
      model: "gemini-3.1-flash-lite",
      timeoutMs: 120000,
      bin: "gemini",
      baseUrl: null,
      apiKey: null,
      // gemini refuses to start without an auth method declared here; the caller
      // may point this at a temp file in tests, or disable creation entirely.
      settingsFile: join(homedir(), ".gemini", "settings.json"),
      ensureSettings: true,
      ...config
    };
    this.spawnImpl = spawnImpl;
    this.now = now;
    this.available = config.available ?? true;
  }

  // Availability = "is the `gemini` binary present". Auth/base_url are validated
  // at run time; an unusable CLI degrades to mock honestly via the router.
  static isAvailable({ which = defaultWhich } = {}) {
    return Boolean(which("gemini"));
  }

  buildArgs(prompt) {
    return ["-p", prompt, "-m", this.config.model, "--skip-trust"];
  }

  // Child env: base_url + key only. Never mutates baseEnv, and the key exists
  // only here (env), never on the command line or in the transcript.
  buildEnv(baseEnv = process.env) {
    const env = { ...baseEnv };
    if (this.config.baseUrl) {
      env.GOOGLE_GEMINI_BASE_URL = this.config.baseUrl;
    }
    if (this.config.apiKey) {
      env.GEMINI_API_KEY = this.config.apiKey;
    }
    return env;
  }

  // gemini fails to start without a declared auth method, and its JSON parser
  // rejects a UTF-8 BOM (docs §4.1 caveat 2). writeFileSync writes UTF-8 with no
  // BOM by default, so this is safe. Only create when missing — never clobber a
  // user's existing ~/.gemini/settings.json.
  ensureSettingsFile() {
    if (!this.config.ensureSettings || !this.config.settingsFile) return;
    if (existsSync(this.config.settingsFile)) return;
    mkdirSync(dirname(this.config.settingsFile), { recursive: true });
    writeFileSync(
      this.config.settingsFile,
      `${JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }, null, 2)}\n`
    );
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
    this.ensureSettingsFile();
    const prompt = buildJsonPrompt(request, schema);
    const child = this.spawnImpl(this.config.bin, this.buildArgs(prompt), { env: this.buildEnv() });
    const consumed = await this.consume(child, request);

    if (consumed.timedOut) {
      return fail("timeout", `Gemini CLI run exceeded ${this.config.timeoutMs}ms`);
    }
    if (consumed.exitCode !== 0 && !consumed.stdout.trim()) {
      const detail = consumed.stderr ? ` (stderr: ${consumed.stderr.trim()})` : "";
      return fail("cli_error", `Gemini CLI exited ${consumed.exitCode}${detail}`);
    }

    const out = extractJsonObject(consumed.stdout);
    if (!out) {
      const detail = consumed.stderr ? ` (stderr: ${consumed.stderr.trim()})` : "";
      return fail("missing_output", `Gemini CLI produced no parseable JSON object${detail}`);
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
      summary: consumed.stdout.trim().slice(0, 280) || `Gemini produced ${request.output_schema}`,
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
