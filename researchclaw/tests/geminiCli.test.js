import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventBus } from "../engine/events.js";
import { GeminiCliAdapter } from "../adapters/geminiCli.js";
import { readJsonUrl } from "../util.js";

const outFixture = () => readJsonUrl(new URL("../../fixtures/cli/contract-draft.out.json", import.meta.url));

// A fake child_process.spawn for a text-only CLI: emits `stdout` text, then
// closes. `hang` never finishes (timeout path). Captures the args/opts it saw.
function makeStub({ stdout = "", stderr = "", exitCode = 0, hang = false, seen } = {}) {
  return (cmd, args, opts) => {
    if (seen) {
      seen.cmd = cmd;
      seen.args = args;
      seen.opts = opts;
    }
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
      child.stdout.end();
      child.emit("close", null);
    };
    if (!hang) {
      setImmediate(() => {
        if (stdout) child.stdout.write(stdout);
        if (stderr) child.stderr.write(stderr);
        child.stdout.end();
        child.stderr.end();
        child.emit("close", exitCode);
      });
    }
    return child;
  };
}

function makeAdapter(spawnImpl, { eventBus, config } = {}) {
  return new GeminiCliAdapter({
    eventBus: eventBus ?? new EventBus(),
    spawnImpl,
    config: { ensureSettings: false, baseUrl: "https://yunwu.ai", apiKey: "sk-secret-key", ...config }
  });
}

const request = () => ({
  project_id: "proj_gem",
  phase: "literature_scouting",
  instructions: "Draft a machine-checkable research contract.",
  inputs: [{ ref: "user_text", type: "research_direction", content: "improve retrieval reranking" }],
  output_schema: "ResearchContractV1"
});

test("run extracts a bare JSON object from stdout and validates it", async () => {
  const adapter = makeAdapter(makeStub({ stdout: JSON.stringify(outFixture()) }));
  const result = await adapter.run(request());
  assert.equal(result.ok, true);
  assert.equal(result.adapter, "gemini");
  assert.equal(result.provider, "gemini");
  assert.equal(result.cli, "gemini-cli");
  assert.equal(result.model, "gemini-3.1-flash-lite");
  assert.deepEqual(result.output, outFixture());
});

test("run extracts JSON from a ```json fenced block surrounded by prose", async () => {
  const stdout = `Sure, here is the contract:\n\n\`\`\`json\n${JSON.stringify(outFixture())}\n\`\`\`\nHope that helps!`;
  const adapter = makeAdapter(makeStub({ stdout }));
  const result = await adapter.run(request());
  assert.equal(result.ok, true);
  assert.deepEqual(result.output, outFixture());
});

test("run fails with missing_output when stdout carries no JSON", async () => {
  const adapter = makeAdapter(makeStub({ stdout: "I could not complete that request." }));
  const result = await adapter.run(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "missing_output");
});

test("run fails with schema_violation when the JSON does not match the schema", async () => {
  const adapter = makeAdapter(makeStub({ stdout: JSON.stringify({ not: "a contract" }) }));
  const result = await adapter.run(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "schema_violation");
});

test("run times out on a hanging process", async () => {
  const adapter = makeAdapter(makeStub({ hang: true }), { config: { timeoutMs: 30 } });
  const result = await adapter.run(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "timeout");
});

test("the API key goes to the child env only, never to argv", async () => {
  const seen = {};
  const adapter = makeAdapter(makeStub({ stdout: JSON.stringify(outFixture()), seen }));
  await adapter.run(request());
  assert.equal(seen.args.includes("--skip-trust"), true);
  assert.equal(seen.args.includes("-m"), true);
  assert.equal(seen.args.includes("gemini-3.1-flash-lite"), true);
  assert.equal(JSON.stringify(seen.args).includes("sk-secret-key"), false, "key must not appear in argv");
  assert.equal(seen.opts.env.GEMINI_API_KEY, "sk-secret-key");
  assert.equal(seen.opts.env.GOOGLE_GEMINI_BASE_URL, "https://yunwu.ai");
});

test("emits cli_chunk events tagged with provider/cli so the panel can group them", async () => {
  const eventBus = new EventBus();
  const events = [];
  eventBus.subscribe("proj_gem", (e) => events.push(e));
  const adapter = makeAdapter(makeStub({ stdout: JSON.stringify(outFixture()) }), { eventBus });
  await adapter.run(request());
  const chunk = events.find((e) => e.type === "cli_chunk" && e.data.provider === "gemini");
  assert.ok(chunk, "expected a gemini-tagged cli_chunk");
  assert.equal(chunk.data.cli, "gemini-cli");
});

test("gemini cli_chunk carries kind:workflow and windowId", async () => {
  const emitted = [];
  const eventBus = { emit: (_pid, e) => emitted.push(e) };
  const adapter = new GeminiCliAdapter({ eventBus, config: { model: "gemini-3.1-flash-lite" } });
  const child = { stdout: { on: (_e, cb) => cb(Buffer.from("hello")) }, stderr: { on() {} }, on() {} };
  void adapter.consume(child, { project_id: "p", phase: "literature_scouting", window_id: "win_y" });
  const data = emitted[0].data;
  assert.equal(data.kind, "workflow");
  assert.equal(data.windowId, "win_y");
  assert.equal(data.provider, "gemini");
});

test("ensureSettingsFile writes a BOM-free settings.json only when missing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gem-settings-"));
  try {
    const settingsFile = join(dir, ".gemini", "settings.json");
    const adapter = new GeminiCliAdapter({
      spawnImpl: makeStub({ stdout: JSON.stringify(outFixture()) }),
      config: { ensureSettings: true, settingsFile, baseUrl: "https://yunwu.ai", apiKey: "k" }
    });
    await adapter.run(request());
    assert.equal(existsSync(settingsFile), true);
    const bytes = readFileSync(settingsFile);
    assert.notEqual(bytes[0], 0xef, "settings.json must not start with a UTF-8 BOM");
    const parsed = JSON.parse(bytes.toString("utf8"));
    assert.equal(parsed.security.auth.selectedType, "gemini-api-key");

    // does not clobber an existing file
    writeFileSync(settingsFile, '{"custom":true}\n');
    await adapter.run(request());
    assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")), { custom: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
