import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EventBus } from "../engine/events.js";
import { ClaudeCodeAdapter } from "../adapters/claudeCode.js";

const STREAM_PATH = fileURLToPath(new URL("../../fixtures/cli/consult.stream.jsonl", import.meta.url));
const streamLines = () => readFileSync(STREAM_PATH, "utf8").trim().split("\n");

// A fake child_process.spawn for consult: replays stream-json lines on stdout.
// consult is free-form — it never writes out.json. Captures spawn args so tests
// can assert on --resume. `hang` simulates a process that never finishes.
function makeStub({ lines = [], stderr = "", exitCode = 0, hang = false, onSpawn } = {}) {
  return (_cmd, args, opts) => {
    onSpawn?.(args, opts);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.stdout.end();
      child.emit("close", null);
    };
    if (!hang) {
      setImmediate(() => {
        for (const line of lines) child.stdout.write(`${line}\n`);
        if (stderr) child.stderr.write(stderr);
        child.stdout.end();
        child.stderr.end();
        child.emit("close", exitCode);
      });
    }
    return child;
  };
}

function makeAdapter(spawnImpl, { eventBus, timeoutMs } = {}) {
  return new ClaudeCodeAdapter({
    eventBus: eventBus ?? new EventBus(),
    config: { model: "claude-haiku-4-5", maxTurns: 8, timeoutMs: timeoutMs ?? 120000 },
    spawnImpl
  });
}

const request = (overrides = {}) => ({
  project_id: "proj_consult_demo",
  message: "How can diffusion models help time-series forecasting?",
  ...overrides
});

test("consult returns the concatenated assistant text and captured session_id", async () => {
  const adapter = makeAdapter(makeStub({ lines: streamLines() }));
  const result = await adapter.consult(request());
  assert.equal(result.ok, true);
  assert.equal(result.adapter, "claude");
  assert.equal(result.session_id, "sess_consult_1");
  assert.ok(result.text.includes("predictive distribution"));
  assert.ok(result.text.includes("DDPM-style"));
});

test("consult parses usage from the result event", async () => {
  const adapter = makeAdapter(makeStub({ lines: streamLines() }));
  const result = await adapter.consult(request());
  assert.equal(result.usage.input_tokens, 820);
  assert.equal(result.usage.output_tokens, 62);
  assert.equal(result.usage.model, "claude-haiku-4-5");
});

test("consult emits cli_chunk events marked kind:consult", async () => {
  const eventBus = new EventBus();
  const chunks = [];
  eventBus.subscribe("proj_consult_demo", (event) => {
    if (event.type === "cli_chunk") chunks.push(event.data);
  });
  const adapter = makeAdapter(makeStub({ lines: streamLines() }), { eventBus });
  await adapter.consult(request());
  assert.ok(chunks.length > 0);
  assert.ok(chunks.every((c) => c.kind === "consult"));
  assert.ok(chunks.some((c) => c.text && c.text.includes("predictive distribution")));
});

test("consult does NOT request the Write tool (read-only allowedTools)", async () => {
  let capturedArgs;
  const adapter = makeAdapter(makeStub({ lines: streamLines(), onSpawn: (args) => (capturedArgs = args) }));
  await adapter.consult(request());
  const toolsIdx = capturedArgs.indexOf("--allowedTools");
  assert.ok(toolsIdx >= 0, "--allowedTools should be passed");
  assert.ok(!/Write/.test(capturedArgs[toolsIdx + 1]), "consult must not allow the Write tool");
});

test("consult passes --resume with the session_id when continuing a thread", async () => {
  let capturedArgs;
  const adapter = makeAdapter(makeStub({ lines: streamLines(), onSpawn: (args) => (capturedArgs = args) }));
  await adapter.consult(request({ session_id: "sess_prev_99" }));
  const resumeIdx = capturedArgs.indexOf("--resume");
  assert.ok(resumeIdx >= 0, "--resume should be passed when a session_id is given");
  assert.equal(capturedArgs[resumeIdx + 1], "sess_prev_99");
});

test("consult omits --resume on the first turn (no session_id)", async () => {
  let capturedArgs;
  const adapter = makeAdapter(makeStub({ lines: streamLines(), onSpawn: (args) => (capturedArgs = args) }));
  await adapter.consult(request());
  assert.ok(!capturedArgs.includes("--resume"), "first turn must not pass --resume");
});

test("consult returns empty_reply when the CLI produces no assistant text", async () => {
  const initOnly = [streamLines()[0], streamLines().at(-1)]; // init + result, no assistant text
  const adapter = makeAdapter(makeStub({ lines: initOnly }));
  const result = await adapter.consult(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "empty_reply");
});

test("consult times out and kills the child when the CLI hangs", async () => {
  let spawned;
  const stub = makeStub({ hang: true });
  const wrapped = (cmd, args, opts) => (spawned = stub(cmd, args, opts));
  const adapter = makeAdapter(wrapped, { timeoutMs: 40 });
  const result = await adapter.consult(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "timeout");
  assert.equal(spawned.killed, true);
});

test("consult returns a raw transcript + summary for raw_log landing", async () => {
  const adapter = makeAdapter(makeStub({ lines: streamLines() }));
  const result = await adapter.consult(request());
  assert.ok(result.raw.transcript.includes("predictive distribution"));
  assert.equal(typeof result.raw.summary.summary, "string");
  assert.equal(result.raw.summary.role, "对话");
});
