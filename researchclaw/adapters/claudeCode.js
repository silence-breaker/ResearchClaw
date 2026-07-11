import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_TOOLS, createSandbox } from "../sandbox/index.js";
import { getOutputSchema, validateOutput } from "./schemas.js";

// Repo-relative dir used to isolate the spawned claude from the user's global
// cc-switch ~/.claude/settings.json (see buildEnv). Kept inside the repo so the
// adapter is self-contained and portable across machines; gitignored.
const ISOLATED_CONFIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".researchclaw", "claude-config");

// Role label for the right-column process feed, by phase (技术路线指南 §5.3).
const ROLE_BY_PHASE = {
  contract_draft: "规划",
  literature_scouting: "文献",
  baseline_selection: "复现",
  baseline_reproduction_checklist: "复现",
  idea_generation: "想法",
  idea_review: "想法"
};

function roleForPhase(phase) {
  return ROLE_BY_PHASE[phase] || "执行";
}

// consult is a conversation, not a long task: read-only tools (no Write/Bash)
// and a small turn cap. See M3技术路线-后端 §9.
const CONSULT_ALLOWED_TOOLS = "Read,WebSearch";
const CONSULT_MAX_TURNS = 8;

function fail(code, message, retryable = true) {
  return { ok: false, adapter: "claude", error: { code, message, retryable } };
}

function defaultWhich(bin) {
  // `command -v` is a POSIX shell builtin and fails under Windows cmd.exe (the
  // default execSync shell there), which would mark every real CLI "unavailable"
  // and silently degrade to mock. Use `where` on win32, `command -v` elsewhere.
  const probe = process.platform === "win32" ? `where ${bin}` : `command -v ${bin}`;
  try {
    return execSync(probe, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch {
    return null;
  }
}

// Headless Claude Code adapter, workflow mode (structured product). Matches the
// ModelAdapter `run` shape (adapters/mock.js) so the workflow layer is unchanged.
// The structured `output` comes from reading sandbox/out.json — never from
// parsing the chat text (两通道红线 §2.1). Defaults to Haiku; cost is a hard
// constraint. Subprocess + sandbox are injectable for deterministic testing.
export class ClaudeCodeAdapter {
  name = "claude";

  constructor({
    eventBus = null,
    costTracker = null,
    config = {},
    spawnImpl = spawn,
    sandboxFactory = createSandbox,
    now = () => new Date().toISOString()
  } = {}) {
    this.eventBus = eventBus;
    this.costTracker = costTracker;
    // baseUrl/apiKey (when set) point this adapter at a ResearchClaw-only model
    // provider (e.g. yunwu.ai), applied per-spawn so the global cc-switch config
    // (~/.claude/settings.json) is never touched. NOTE: the claude CLI's
    // settings.json `env` block OVERRIDES process env — verified 2026-07-11 by a
    // curl matrix where the RC token + model returned 200 direct, yet the spawned
    // CLI hit the settings.json token's 403. So we do NOT rely on process env
    // winning; instead configDir isolates the child (see buildEnv).
    this.config = { model: "claude-haiku-4-5", maxTurns: 20, timeoutMs: 120000, bin: "claude", baseUrl: null, apiKey: null, configDir: ISOLATED_CONFIG_DIR, ...config };
    this.spawnImpl = spawnImpl;
    this.sandboxFactory = sandboxFactory;
    this.now = now;
    this.available = config.available ?? true;
  }

  // Probe used by server.js to decide whether to wire the real CLI. Availability
  // is "is the `claude` binary present" — auth can be a subscription login or an
  // ANTHROPIC_API_KEY, so we don't hard-require the env key here. If the CLI
  // ultimately can't run (no auth), the routing adapter degrades to mock
  // honestly (技术路线指南 §7). The explicit RESEARCHCLAW_ENABLE_CLAUDE opt-in is
  // the real cost guard.
  static isAvailable({ which = defaultWhich } = {}) {
    return Boolean(which("claude"));
  }

  buildPrompt(request, schema) {
    const lines = [request.instructions || ""];
    for (const input of request.inputs || []) {
      lines.push(`\n[input:${input.type}]\n${typeof input.content === "string" ? input.content : JSON.stringify(input.content, null, 2)}`);
    }
    lines.push(
      "\nWrite your single result as JSON into ./out.json in the current working directory.",
      "It MUST strictly match this schema:",
      schema.jsonSchema,
      "Do not write any other file. Do not put the conclusion in the chat — only in ./out.json."
    );
    return lines.join("\n");
  }

  buildArgs(prompt) {
    return [
      "-p",
      prompt,
      "--model",
      this.config.model,
      "--output-format",
      "stream-json",
      "--verbose",
      "--allowedTools",
      ALLOWED_TOOLS,
      "--max-turns",
      String(this.config.maxTurns)
    ];
  }

  // The child process env. When a ResearchClaw-only provider is configured,
  // override ANTHROPIC_BASE_URL/AUTH_TOKEN and drop any inherited ANTHROPIC_API_KEY
  // (avoids a stale-key 401). Otherwise inherit unchanged. Never mutates baseEnv.
  buildEnv(baseEnv = process.env) {
    if (!this.config.baseUrl) {
      return { ...baseEnv };
    }
    const env = { ...baseEnv };
    delete env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_BASE_URL = this.config.baseUrl;
    if (this.config.apiKey) {
      env.ANTHROPIC_AUTH_TOKEN = this.config.apiKey;
    }
    // Isolate the spawned claude from the user's cc-switch ~/.claude/settings.json
    // (which carries a DIFFERENT ANTHROPIC_AUTH_TOKEN + an opus model). That env
    // block overrides process env for the claude CLI, so without isolation the
    // child sends the wrong token and 403s (verified: settings.json token + this
    // model = 403, injected RC token + same model = 200). Pointing CLAUDE_CONFIG_DIR
    // at a ResearchClaw-only dir makes claude read only the env injected here.
    if (this.config.configDir) {
      env.CLAUDE_CONFIG_DIR = this.config.configDir;
    }
    return env;
  }

  // Create the isolated config dir before spawning (only in provider mode). Mirrors
  // GeminiCliAdapter.ensureSettingsFile — a no-op when not isolating.
  ensureConfigDir() {
    if (!this.config.baseUrl || !this.config.configDir) return;
    mkdirSync(this.config.configDir, { recursive: true });
  }

  emitChunk(request, data) {
    this.eventBus?.emit(request.project_id, { type: "cli_chunk", data });
  }

  // Turn one stream-json event into process-feed chunks. Only text + tool_use
  // are surfaced; raw event noise stays in the transcript. consult mode tags the
  // chunk with kind:"consult" + role 对话 so the panel routes it to the chat view
  // instead of the workflow process feed (workflow chunks are left unchanged).
  handleEventChunks(event, request, mode = "workflow") {
    if (event.type !== "assistant" || !event.message?.content) {
      return [];
    }
    const consult = mode === "consult";
    const role = consult ? "对话" : roleForPhase(request.phase);
    const ts = this.now();
    const texts = [];
    for (const block of event.message.content) {
      if (block.type === "text" && block.text) {
        this.emitChunk(
          request,
          consult
            ? { kind: "consult", role, text: block.text, ts }
            : {
                kind: "workflow",
                phase: request.phase,
                provider: "claude",
                cli: "claude-code",
                model: this.config.model,
                windowId: request.window_id,
                role,
                text: block.text,
                ts
              }
        );
        texts.push(block.text);
      } else if (block.type === "tool_use") {
        this.emitChunk(
          request,
          consult
            ? { kind: "consult", role, tool: block.name, ts }
            : {
                kind: "workflow",
                phase: request.phase,
                provider: "claude",
                cli: "claude-code",
                model: this.config.model,
                windowId: request.window_id,
                role,
                tool: block.name,
                ts
              }
        );
      }
    }
    return texts;
  }

  consume(child, request, mode = "workflow") {
    return new Promise((resolve) => {
      let buffer = "";
      const transcriptLines = [];
      const texts = [];
      let stderr = "";
      let usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
      let turns = 0;
      let durationMs = 0;
      let model = this.config.model;
      let sessionId = null;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* already gone */
        }
      }, this.config.timeoutMs);

      const handleLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }
        transcriptLines.push(trimmed);
        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          return; // tolerate a malformed line, keep going
        }
        texts.push(...this.handleEventChunks(event, request, mode));
        if (event.session_id) {
          sessionId = event.session_id;
        }
        if (event.type === "system" && event.model) {
          model = event.model;
        }
        if (event.type === "result") {
          if (event.usage) {
            usage = {
              input_tokens: event.usage.input_tokens ?? 0,
              output_tokens: event.usage.output_tokens ?? 0,
              // cache reads dominate real spend; M4 counts them so cost isn't underestimated.
              cache_creation_input_tokens: event.usage.cache_creation_input_tokens ?? 0,
              cache_read_input_tokens: event.usage.cache_read_input_tokens ?? 0
            };
          }
          turns = event.num_turns ?? turns;
          durationMs = event.duration_ms ?? durationMs;
        }
      };

      child.stdout.on("data", (data) => {
        buffer += data.toString();
        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          handleLine(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 1);
        }
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("error", (err) => {
        stderr += String(err?.message || err);
      });
      child.on("close", (code) => {
        if (buffer.trim()) {
          handleLine(buffer);
        }
        clearTimeout(timer);
        resolve({
          transcript: transcriptLines.join("\n"),
          usage: { ...usage, model, turns, duration_ms: durationMs },
          sessionId,
          texts,
          stderr,
          timedOut,
          exitCode: code
        });
      });
    });
  }

  async run(request) {
    const schema = getOutputSchema(request.output_schema); // throws on unknown schema name
    const sandbox = this.sandboxFactory();
    try {
      this.ensureConfigDir();
      const prompt = this.buildPrompt(request, schema);
      const child = this.spawnImpl(this.config.bin, this.buildArgs(prompt), {
        cwd: sandbox.dir,
        env: this.buildEnv()
      });
      const consumed = await this.consume(child, request);

      if (consumed.timedOut) {
        return fail("timeout", `CLI run exceeded ${this.config.timeoutMs}ms`);
      }

      let out;
      try {
        out = JSON.parse(readFileSync(join(sandbox.dir, "out.json"), "utf8"));
      } catch {
        const detail = consumed.stderr ? ` (stderr: ${consumed.stderr.trim()})` : "";
        return fail("missing_output", `CLI did not produce a valid out.json${detail}`);
      }

      const check = validateOutput(request.output_schema, out);
      if (!check.ok) {
        return fail("schema_violation", check.errors.join("; "));
      }

      const summary = {
        model: consumed.usage.model,
        time: this.now(),
        role: roleForPhase(request.phase),
        summary: consumed.texts[0]?.slice(0, 280) || `CLI produced ${request.output_schema}`,
        artifact_refs: []
      };
      return {
        ok: true,
        adapter: "claude",
        output: out,
        usage: consumed.usage,
        raw: { transcript: consumed.transcript, summary }
      };
    } finally {
      sandbox.cleanup();
    }
  }

  // consult mode args: free-form (no forced schema / no out.json), read-only
  // tools (consult never writes), bounded turns, and --resume to continue the
  // per-project conversation thread. See M3技术路线-后端 §5.
  buildConsultArgs(message, sessionId) {
    const args = [
      "-p",
      message,
      "--model",
      this.config.model,
      "--output-format",
      "stream-json",
      "--verbose",
      "--allowedTools",
      CONSULT_ALLOWED_TOOLS,
      "--max-turns",
      String(Math.min(this.config.maxTurns, CONSULT_MAX_TURNS))
    ];
    if (sessionId) {
      args.push("--resume", sessionId);
    }
    return args;
  }

  // consult mode (human one-shot Q&A). Free-form text, multi-turn via --resume.
  // Returns { ok, session_id, text, usage, raw } — never structured/gated output.
  // consult NEVER advances research state; the orchestrator lands it as a
  // consult raw_log only (两通道红线 §2.1). On failure returns an honest error;
  // unlike workflow mode, consult does NOT fall back to mock (a fake reply would
  // break the red line — there is no pipeline to keep alive).
  async consult(request) {
    const sandbox = this.sandboxFactory();
    try {
      this.ensureConfigDir();
      const child = this.spawnImpl(this.config.bin, this.buildConsultArgs(request.message, request.session_id), {
        cwd: sandbox.dir,
        env: this.buildEnv()
      });
      const consumed = await this.consume(child, request, "consult");

      if (consumed.timedOut) {
        return fail("timeout", `Consult run exceeded ${this.config.timeoutMs}ms`);
      }
      const text = consumed.texts.join("\n").trim();
      if (!text) {
        const detail = consumed.stderr ? ` (stderr: ${consumed.stderr.trim()})` : "";
        return fail("empty_reply", `Consult produced no assistant text${detail}`);
      }

      const summary = {
        model: consumed.usage.model,
        time: this.now(),
        role: "对话",
        summary: text.slice(0, 280),
        artifact_refs: []
      };
      return {
        ok: true,
        adapter: "claude",
        session_id: consumed.sessionId || request.session_id || null,
        text,
        usage: consumed.usage,
        raw: { transcript: consumed.transcript, summary }
      };
    } finally {
      sandbox.cleanup();
    }
  }
}
