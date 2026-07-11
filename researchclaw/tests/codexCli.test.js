import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { EventBus } from "../engine/events.js";
import { CodexCliAdapter } from "../adapters/codexCli.js";
import { readJsonUrl } from "../util.js";

const outFixture = () => readJsonUrl(new URL("../../fixtures/cli/contract-draft.out.json", import.meta.url));

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
  return new CodexCliAdapter({
    eventBus: eventBus ?? new EventBus(),
    spawnImpl,
    config: { baseUrl: "https://yunwu.ai/v1", apiKey: "sk-secret-key", ...config }
  });
}

const request = () => ({
  project_id: "proj_codex",
  phase: "baseline_reproduction_checklist",
  instructions: "Draft a machine-checkable research contract.",
  inputs: [{ ref: "user_text", type: "research_direction", content: "improve retrieval reranking" }],
  output_schema: "ResearchContractV1"
});

test("run extracts JSON from stdout and validates it", async () => {
  const result = await makeAdapter(makeStub({ stdout: JSON.stringify(outFixture()) })).run(request());
  assert.equal(result.ok, true);
  assert.equal(result.adapter, "codex");
  assert.equal(result.provider, "codex");
  assert.equal(result.cli, "codex-cli");
  assert.equal(result.model, "gpt-5.4-mini");
  assert.deepEqual(result.output, outFixture());
});

test("buildArgs pins the named provider, responses wire_api and base_url; never the key", async () => {
  const seen = {};
  await makeAdapter(makeStub({ stdout: JSON.stringify(outFixture()), seen })).run(request());
  const joined = seen.args.join(" ");
  assert.equal(seen.args[0], "exec");
  assert.ok(seen.args.includes("--skip-git-repo-check"), "must skip git repo check");
  assert.ok(joined.includes('wire_api="responses"'), "wire_api must be responses (chat 403s)");
  assert.ok(joined.includes('model_provider="yunwu"'), "must select the named provider");
  assert.ok(joined.includes('base_url="https://yunwu.ai/v1"'), "base_url must be pinned from API.md");
  assert.ok(joined.includes('env_key="OPENAI_API_KEY"'), "key must be referenced by env_key, not value");
  assert.equal(JSON.stringify(seen.args).includes("sk-secret-key"), false, "key must not appear in argv");
  assert.equal(seen.opts.env.OPENAI_API_KEY, "sk-secret-key");
});

test("run fails with missing_output when stdout carries no JSON", async () => {
  const result = await makeAdapter(makeStub({ stdout: "no json here" })).run(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "missing_output");
});

test("run fails with schema_violation when the JSON does not match", async () => {
  const result = await makeAdapter(makeStub({ stdout: JSON.stringify({ bad: 1 }) })).run(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "schema_violation");
});

test("run times out on a hanging process", async () => {
  const result = await makeAdapter(makeStub({ hang: true }), { config: { timeoutMs: 30 } }).run(request());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "timeout");
});

test("emits cli_chunk events tagged with provider/cli", async () => {
  const eventBus = new EventBus();
  const events = [];
  eventBus.subscribe("proj_codex", (e) => events.push(e));
  await makeAdapter(makeStub({ stdout: JSON.stringify(outFixture()) }), { eventBus }).run(request());
  const chunk = events.find((e) => e.type === "cli_chunk" && e.data.provider === "codex");
  assert.ok(chunk, "expected a codex-tagged cli_chunk");
  assert.equal(chunk.data.cli, "codex-cli");
});
