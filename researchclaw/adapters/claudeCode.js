import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_TOOLS, createSandbox } from "../sandbox/index.js";
import { getOutputSchema, validateOutput } from "./schemas.js";

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

function fail(code, message, retryable = true) {
  return { ok: false, adapter: "claude", error: { code, message, retryable } };
}

function defaultWhich(bin) {
  try {
    return execSync(`command -v ${bin}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
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
    // (~/.claude/settings.json) is never touched. Per-process env wins over
    // settings.json env (verified empirically).
    this.config = { model: "claude-haiku-4-5", maxTurns: 20, timeoutMs: 120000, bin: "claude", baseUrl: null, apiKey: null, ...config };
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
    return env;
  }

  emitChunk(request, data) {
    this.eventBus?.emit(request.project_id, { type: "cli_chunk", data });
  }

  // Turn one stream-json event into process-feed chunks. Only text + tool_use
  // are surfaced; raw event noise stays in the transcript.
  handleEventChunks(event, request) {
    if (event.type !== "assistant" || !event.message?.content) {
      return [];
    }
    const role = roleForPhase(request.phase);
    const ts = this.now();
    const texts = [];
    for (const block of event.message.content) {
      if (block.type === "text" && block.text) {
        this.emitChunk(request, { phase: request.phase, role, text: block.text, ts });
        texts.push(block.text);
      } else if (block.type === "tool_use") {
        this.emitChunk(request, { phase: request.phase, role, tool: block.name, ts });
      }
    }
    return texts;
  }

  consume(child, request) {
    return new Promise((resolve) => {
      let buffer = "";
      const transcriptLines = [];
      const texts = [];
      let stderr = "";
      let usage = { input_tokens: 0, output_tokens: 0 };
      let turns = 0;
      let durationMs = 0;
      let model = this.config.model;
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
        texts.push(...this.handleEventChunks(event, request));
        if (event.type === "system" && event.model) {
          model = event.model;
        }
        if (event.type === "result") {
          if (event.usage) {
            usage = { input_tokens: event.usage.input_tokens ?? 0, output_tokens: event.usage.output_tokens ?? 0 };
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
}
