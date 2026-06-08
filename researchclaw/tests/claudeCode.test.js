import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EventBus } from "../engine/events.js";
import { ClaudeCodeAdapter } from "../adapters/claudeCode.js";
import { readJsonUrl } from "../util.js";

const STREAM_PATH = fileURLToPath(new URL("../../fixtures/cli/contract-draft.stream.jsonl", import.meta.url));
const streamLines = () => readFileSync(STREAM_PATH, "utf8").trim().split("\n");
const outFixture = () => readJsonUrl(new URL("../../fixtures/cli/contract-draft.out.json", import.meta.url));

// A fake child_process.spawn: replays stream-json lines on stdout and (when
// outContent is given) writes out.json into the sandbox cwd, mimicking claude's
// Write tool. `hang` simulates a process that never finishes (timeout path).
function makeStub({ lines = [], outContent, stderr = "", autoClose = true, exitCode = 0, hang = false } = {}) {
  return (_cmd, _args, opts) => {
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
        if (outContent !== undefined) writeFileSync(join(opts.cwd, "out.json"), JSON.stringify(outContent));
        child.stdout.end();
        child.stderr.end();
        if (autoClose) child.emit("close", exitCode);
      });
    }
    return child;
  };
}

function makeAdapter(spawnImpl, { eventBus, timeoutMs } = {}) {
  return new ClaudeCodeAdapter({
    eventBus: eventBus ?? new EventBus(),
    config: { model: "claude-haiku-4-5", maxTurns: 20, timeoutMs: timeoutMs ?? 120000 },
    spawnImpl
  });
}

const request = () => ({
  task_id: "contract_draft",
  project_id: "proj_cli_demo",
  phase: "contract_draft",
  instructions: "Draft a machine-checkable research contract.",
  inputs: [{ ref: "user_text", type: "research_direction", content: "improve retrieval reranking" }],
  output_schema: "ResearchContractV1"
});

test("run returns the parsed out.json on a successful CLI run", async () => {
  const adapter = makeAdapter(makeStub({ lines: streamLines(), outContent: outFixture() }));
  const result = await adapter.run(request());
  assert.equal(result.ok, true);
  assert.equal(result.adapter, "claude");
  assert.deepEqual(result.output, outFixture());
});

test("run parses cumulative usage from the result event", async () => {
  const adapter = makeAdapter(makeStub({ lines: streamLines(), outContent: outFixture() }));
  const result = await adapter.run(request());
  assert.equal(result.usage.input_tokens, 1500);
  assert.equal(result.usage.output_tokens, 520);
  assert.equal(result.usage.turns, 3);
  assert.equal(result.usage.model, "claude-haiku-4-5");
});

test("run emits cli_chunk events per stream line, in order", async () => {
  const eventBus = new EventBus();
  const chunks = [];
  eventBus.subscribe("proj_cli_demo", (event) => {
    if (event.type === "cli_chunk") chunks.push(event.data);
  });
  const adapter = makeAdapter(makeStub({ lines: streamLines(), outContent: outFixture() }), { eventBus });
  await adapter.run(request());

  assert.ok(chunks.some((c) => c.text && c.text.includes("Drafting")));
  assert.ok(chunks.some((c) => c.tool === "Write"));
  assert.ok(chunks.every((c) => c.phase === "contract_draft"));
});

test("run returns raw transcript + summary for raw_log landing", async () => {
  const adapter = makeAdapter(makeStub({ lines: streamLines(), outContent: outFixture() }));
  const result = await adapter.run(request());
  assert.ok(result.raw.transcript.includes("Drafting"));
  assert.equal(result.raw.summary.model, "claude-haiku-4-5");
  assert.equal(typeof result.raw.summary.summary, "string");
});

test("run returns missing_output when the CLI writes no out.json", async () => {
  const adapter = makeAdapter(makeStub({ lines: streamLines(), outContent: undefined }));
  const result = await adapter.run(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "missing_output");
  assert.equal(result.error.retryable, true);
});

test("run returns schema_violation when out.json fails the schema", async () => {
  const adapter = makeAdapter(makeStub({ lines: streamLines(), outContent: { not: "a contract" } }));
  const result = await adapter.run(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "schema_violation");
  assert.equal(result.error.retryable, true);
  assert.ok(result.error.message.length > 0);
});

test("run times out and kills the child when the CLI hangs", async () => {
  let spawned;
  const stub = makeStub({ hang: true });
  const wrapped = (cmd, args, opts) => {
    spawned = stub(cmd, args, opts);
    return spawned;
  };
  const adapter = makeAdapter(wrapped, { timeoutMs: 40 });
  const result = await adapter.run(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "timeout");
  assert.equal(spawned.killed, true);
});

test("run surfaces stderr when the run fails without output", async () => {
  const adapter = makeAdapter(makeStub({ lines: [], outContent: undefined, stderr: "claude: boom", exitCode: 1 }));
  const result = await adapter.run(request());
  assert.equal(result.ok, false);
  assert.ok(result.error.message.includes("boom"));
});

test("isAvailable reflects whether the claude binary is present", () => {
  assert.equal(ClaudeCodeAdapter.isAvailable({ which: () => null }), false);
  assert.equal(ClaudeCodeAdapter.isAvailable({ which: () => "/usr/bin/claude" }), true);
});
