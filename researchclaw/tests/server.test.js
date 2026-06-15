import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers.js";
import { MockModelAdapter } from "../adapters/mock.js";

// A baseline selection that fails its gate, so the pipeline reaches `blocked`
// and the recover endpoint has something to recover from.
class BadBaselineAdapter extends MockModelAdapter {
  outputFor(request) {
    if (request.phase === "baseline_selection") {
      return {
        selected: { paper_id: "unknown_paper", name: "Only Baseline", reason: "temporary" },
        candidates: [
          {
            paper_id: "unknown_paper",
            name: "Only Baseline",
            pros: ["open code"],
            cons: [],
            reproducibility_risk: "low"
          }
        ],
        rejected: []
      };
    }
    return super.outputFor(request);
  }
}

// Fails the first contract_draft attempt, then succeeds. Used to test recover
// from a contract_draft failure through the HTTP layer.
class FailsOnceDraftAdapter extends MockModelAdapter {
  constructor() {
    super();
    this.failures = 0;
  }
  async run(request) {
    if (request.phase === "contract_draft" && this.failures === 0) {
      this.failures += 1;
      return { ok: false, adapter: "mock", error: { code: "boom", message: "draft exploded once", retryable: false } };
    }
    return super.run(request);
  }
}

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFileSync, writeFileSync } from "node:fs";
import { join as joinPath } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeCodeAdapter } from "../adapters/claudeCode.js";
import { createRoutingAdapter } from "../adapters/route.js";
import { CostTracker } from "../engine/cost.js";

const CLI_STREAM = readFileSync(
  fileURLToPath(new URL("../../fixtures/cli/contract-draft.stream.jsonl", import.meta.url)),
  "utf8"
).trim().split("\n");
const CLI_OUT = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../fixtures/cli/contract-draft.out.json", import.meta.url)), "utf8")
);

// Fake spawn that replays the recorded stream-json and writes out.json into the
// sandbox cwd — same approach as tests/claudeCode.test.js, used here to drive a
// real cli_chunk flow through the SSE endpoint without calling the network.
function stubClaudeSpawn(_cmd, _args, opts) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => child.emit("close", null);
  setImmediate(() => {
    for (const line of CLI_STREAM) child.stdout.write(`${line}\n`);
    writeFileSync(joinPath(opts.cwd, "out.json"), JSON.stringify(CLI_OUT));
    child.stdout.end();
    child.stderr.end();
    child.emit("close", 0);
  });
  return child;
}

async function postJson(baseUrl, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

// POST /start now returns a "running" ack and drafts the contract in the
// background, so tests that need the contract must wait for it to settle.
async function startAndWait(server, projectId, direction = "Explore retrieval reranking") {
  await postJson(server.baseUrl, `/projects/${projectId}/start`, { research_direction: direction });
  for (let i = 0; i < 200; i += 1) {
    const st = server.store.readState(projectId);
    if (st.phase !== "intake" && st.phase !== "contract_draft") return st;
    await new Promise((r) => setTimeout(r, 10));
  }
  return server.store.readState(projectId);
}

async function driveToBlocked(server) {
  const projectId = "proj_recover";
  const state = await startAndWait(server, projectId);
  await postJson(server.baseUrl, `/projects/${projectId}/approve`, {
    target: "contract",
    artifact_id: state.current.contract_artifact_id,
    approved_by: "human"
  });
  await postJson(server.baseUrl, `/projects/${projectId}/advance`); // literature scouting
  await postJson(server.baseUrl, `/projects/${projectId}/advance`); // baseline selection -> blocked
  return projectId;
}

test("POST /recover returns a blocked project to its retreat phase", async () => {
  const server = await startTestServer(new BadBaselineAdapter());
  try {
    const projectId = await driveToBlocked(server);
    assert.equal(server.store.readState(projectId).phase, "blocked");

    const result = await postJson(server.baseUrl, `/projects/${projectId}/recover`, {});

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.phase, "literature_scouting");
    assert.equal(server.store.readState(projectId).phase, "literature_scouting");
  } finally {
    await server.close();
  }
});

test("POST /recover honours an explicit retreat target", async () => {
  const server = await startTestServer(new BadBaselineAdapter());
  try {
    const projectId = await driveToBlocked(server);

    const result = await postJson(server.baseUrl, `/projects/${projectId}/recover`, {
      to: "literature_scouting"
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.phase, "literature_scouting");
  } finally {
    await server.close();
  }
});

test("POST /recover on a non-blocked project returns an error", async () => {
  const server = await startTestServer();
  try {
    await postJson(server.baseUrl, "/projects/proj_ok/start", {
      research_direction: "Explore retrieval reranking"
    });

    const result = await postJson(server.baseUrl, "/projects/proj_ok/recover", {});

    assert.equal(result.status, 500);
    assert.equal(result.body.ok, false);
    assert.match(result.body.error, /blocked/);
  } finally {
    await server.close();
  }
});

test("POST /recover from a contract_draft failure schedules a background re-run", async () => {
  const server = await startTestServer(new FailsOnceDraftAdapter());
  const projectId = "proj_recover_draft";
  try {
    await postJson(server.baseUrl, `/projects/${projectId}/start`, {
      research_direction: "Explore retrieval reranking"
    });
    // Wait for the initial background draft to fail and land in blocked.
    for (let i = 0; i < 200; i += 1) {
      const st = server.store.readState(projectId);
      if (st.phase === "blocked") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(server.store.readState(projectId).phase, "blocked");
    assert.equal(server.store.readState(projectId).block.retreat_to, "contract_draft");

    const result = await postJson(server.baseUrl, `/projects/${projectId}/recover`, {});
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.phase, "contract_draft");
    assert.equal(result.body.needs_draft, true);

    // Wait for the server-scheduled background re-run to complete.
    for (let i = 0; i < 200; i += 1) {
      const st = server.store.readState(projectId);
      if (st.phase !== "contract_draft" && st.phase !== "blocked") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const finalState = server.store.readState(projectId);
    assert.equal(finalState.phase, "contract_review");
    assert.ok(finalState.current.contract_artifact_ref);
  } finally {
    await server.close();
  }
});

async function getJson(baseUrl, path) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Accept: "application/json" } });
  return { status: res.status, body: await res.json() };
}

test("GET /evidence returns ready:false before a contract is approved", async () => {
  const server = await startTestServer();
  try {
    const result = await getJson(server.baseUrl, "/projects/proj_none/evidence");
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.ready, false);
    assert.deepEqual(result.body.evidence_index, []);
  } finally {
    await server.close();
  }
});

test("GET /evidence returns real claim->artifact mapping mid-pipeline", async () => {
  const server = await startTestServer();
  try {
    const projectId = "proj_evidence";
    const state = await startAndWait(server, projectId);
    await postJson(server.baseUrl, `/projects/${projectId}/approve`, {
      target: "contract",
      artifact_id: state.current.contract_artifact_id,
      approved_by: "human"
    });
    await postJson(server.baseUrl, `/projects/${projectId}/advance`); // literature scouting
    await postJson(server.baseUrl, `/projects/${projectId}/advance`); // baseline selection

    const result = await getJson(server.baseUrl, `/projects/${projectId}/evidence`);
    assert.equal(result.status, 200);
    assert.equal(result.body.ready, true);
    assert.ok(Array.isArray(result.body.evidence_index));
    assert.ok(result.body.evidence_index.length > 0);
    const entry = result.body.evidence_index[0];
    assert.ok("claim_id" in entry && "satisfied" in entry && "pending" in entry);
  } finally {
    await server.close();
  }
});

test("archive / unarchive endpoints toggle the listing flag", async () => {
  const server = await startTestServer();
  try {
    await startAndWait(server, "proj_arch");

    let res = await postJson(server.baseUrl, "/projects/proj_arch/archive", {});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    let list = await getJson(server.baseUrl, "/projects");
    assert.equal(list.body.projects.find((p) => p.project_id === "proj_arch").archived, true);

    await postJson(server.baseUrl, "/projects/proj_arch/unarchive", {});
    list = await getJson(server.baseUrl, "/projects");
    assert.equal(list.body.projects.find((p) => p.project_id === "proj_arch").archived, false);
  } finally {
    await server.close();
  }
});

test("delete endpoint permanently removes a project", async () => {
  const server = await startTestServer();
  try {
    await startAndWait(server, "proj_del");

    const res = await postJson(server.baseUrl, "/projects/proj_del/delete", {});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const list = await getJson(server.baseUrl, "/projects");
    assert.equal(list.body.projects.some((p) => p.project_id === "proj_del"), false);
  } finally {
    await server.close();
  }
});

function parseSseFrame(frame) {
  let eventName = "message";
  const dataLines = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // heartbeat / comment
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  return { type: eventName, data: JSON.parse(dataLines.join("\n")) };
}

// Open the SSE stream, collect `count` snapshot events. After the first one
// arrives, fire `trigger` to cause a state change and a second snapshot.
async function readSnapshots(baseUrl, projectId, count, trigger) {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/projects/${projectId}/stream`, {
    headers: { Accept: "text/event-stream" },
    signal: controller.signal
  });
  const contentType = res.headers.get("content-type");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let triggered = false;
  const snapshots = [];
  while (snapshots.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = parseSseFrame(frame);
      if (event && event.type === "snapshot") snapshots.push(event.data);
    }
    if (!triggered && snapshots.length >= 1 && trigger) {
      triggered = true;
      await trigger();
    }
  }
  controller.abort();
  return { contentType, snapshots };
}

test("GET /stream pushes the current snapshot on connect and again after a state change", async () => {
  const server = await startTestServer();
  try {
    const projectId = "proj_sse";
    const state = await startAndWait(server, projectId);
    const artifactId = state.current.contract_artifact_id;

    const { contentType, snapshots } = await readSnapshots(server.baseUrl, projectId, 2, () =>
      postJson(server.baseUrl, `/projects/${projectId}/approve`, {
        target: "contract",
        artifact_id: artifactId,
        approved_by: "human"
      })
    );

    assert.match(contentType, /text\/event-stream/);
    assert.equal(snapshots.length, 2);
    // first frame = state at connect time
    assert.equal(snapshots[0].project_id, projectId);
    assert.equal(snapshots[0].phase, "contract_review");
    assert.ok(Array.isArray(snapshots[0].phase_history), "snapshot carries full state");
    // second frame = state after approve
    assert.equal(snapshots[1].phase, "literature_scouting");
  } finally {
    await server.close();
  }
});

// Reads the SSE stream and collects events matching `wantType` until `count`,
// firing `trigger` once the connection is live (after the first snapshot).
async function readEvents(baseUrl, projectId, wantType, count, trigger) {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/projects/${projectId}/stream`, {
    headers: { Accept: "text/event-stream" },
    signal: controller.signal
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let triggered = false;
  let sawSnapshot = false;
  const collected = [];
  while (collected.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const event = parseSseFrame(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
      if (event?.type === "snapshot") sawSnapshot = true;
      if (event?.type === wantType) collected.push(event.data);
    }
    if (!triggered && sawSnapshot && trigger) {
      triggered = true;
      await trigger();
    }
  }
  controller.abort();
  return collected;
}

test("GET /stream forwards cli_chunk events from a real ClaudeCodeAdapter run", async () => {
  const server = await startTestServer(null, {
    costTracker: new CostTracker(),
    buildAdapter: (eventBus) => {
      const costTracker = new CostTracker();
      const primary = new ClaudeCodeAdapter({
        eventBus,
        config: { timeoutMs: 5000 },
        spawnImpl: stubClaudeSpawn
      });
      return createRoutingAdapter({
        phases: ["contract_draft"],
        primary,
        fallback: new MockModelAdapter(),
        costTracker,
        eventBus
      });
    }
  });
  try {
    const projectId = "proj_cli_sse";
    const chunks = await readEvents(server.baseUrl, projectId, "cli_chunk", 1, () =>
      postJson(server.baseUrl, `/projects/${projectId}/start`, { research_direction: "improve retrieval reranking" })
    );
    assert.ok(chunks.length >= 1, "expected at least one cli_chunk event over SSE");
    assert.equal(chunks[0].phase, "contract_draft");
  } finally {
    await server.close();
  }
});

// --- M3.3: consult endpoints + consult_message over SSE ---

const CONSULT_STREAM = readFileSync(
  fileURLToPath(new URL("../../fixtures/cli/consult.stream.jsonl", import.meta.url)),
  "utf8"
).trim().split("\n");

// Fake spawn replaying the recorded consult stream-json (free-form: no out.json).
function stubConsultSpawn(_cmd, _args, opts) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => child.emit("close", null);
  setImmediate(() => {
    for (const line of CONSULT_STREAM) child.stdout.write(`${line}\n`);
    child.stdout.end();
    child.stderr.end();
    child.emit("close", 0);
  });
  return child;
}

function consultServer() {
  return startTestServer(null, {
    buildAdapter: (eventBus) => {
      const costTracker = new CostTracker();
      const primary = new ClaudeCodeAdapter({ eventBus, costTracker, config: { timeoutMs: 5000 }, spawnImpl: stubConsultSpawn });
      return createRoutingAdapter({ phases: ["contract_draft"], primary, fallback: new MockModelAdapter(), costTracker, eventBus });
    }
  });
}

async function waitForConsult(server, projectId) {
  for (let i = 0; i < 200; i += 1) {
    const st = server.store.readState(projectId);
    if (st.consult?.raw_log_refs?.length) return st;
    await new Promise((r) => setTimeout(r, 10));
  }
  return server.store.readState(projectId);
}

test("POST /consult honestly reports unavailable on a mock-only server", async () => {
  const server = await startTestServer(); // plain mock, no consult
  try {
    const res = await postJson(server.baseUrl, "/projects/proj_c/consult", { message: "hi?" });
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.code, "unavailable");
  } finally {
    await server.close();
  }
});

test("POST /consult runs a turn in the background and lands a consult raw_log", async () => {
  const server = await consultServer();
  try {
    const projectId = "proj_consult_http";
    const res = await postJson(server.baseUrl, `/projects/${projectId}/consult`, { message: "How can diffusion models help forecasting?" });
    assert.equal(res.body.ok, true);
    assert.equal(res.body.running, true);

    const state = await waitForConsult(server, projectId);
    assert.equal(state.consult.raw_log_refs.length, 1);
    assert.equal(state.phase, "idle", "consult must not advance the research phase");
    const raw = server.store.readArtifact(projectId, state.consult.raw_log_refs[0]);
    assert.equal(raw.producer.workflow, "consult");
    assert.ok(raw.content.answer_text.includes("predictive distribution"));
  } finally {
    await server.close();
  }
});

test("GET /stream forwards a consult_message event after a consult turn", async () => {
  const server = await consultServer();
  try {
    const projectId = "proj_consult_sse";
    const messages = await readEvents(server.baseUrl, projectId, "consult_message", 1, () =>
      postJson(server.baseUrl, `/projects/${projectId}/consult`, { message: "a question" })
    );
    assert.ok(messages.length >= 1);
    assert.equal(messages[0].ok, true);
    assert.ok(messages[0].raw_log_ref);
  } finally {
    await server.close();
  }
});

test("POST /consult/promote promotes a consult turn to a consult_note", async () => {
  const server = await consultServer();
  try {
    const projectId = "proj_consult_promote";
    await postJson(server.baseUrl, `/projects/${projectId}/consult`, { message: "a question" });
    const state = await waitForConsult(server, projectId);
    const rawRef = state.consult.raw_log_refs[0];

    const res = await postJson(server.baseUrl, `/projects/${projectId}/consult/promote`, { raw_log_ref: rawRef, note: "keep this" });
    assert.equal(res.body.ok, true);
    assert.ok(res.body.artifact_ref);
    const note = server.store.readArtifact(projectId, res.body.artifact_ref);
    assert.equal(note.type, "consult_note");
    assert.equal(note.content.note, "keep this");
  } finally {
    await server.close();
  }
});

// --- Gap 2: /health endpoint (gateway status) ---

test("GET /health returns ok with project count", async () => {
  const server = await startTestServer();
  try {
    await startAndWait(server, "proj_h");
    const res = await getJson(server.baseUrl, "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.service, "researchclaw");
    assert.equal(typeof res.body.projects, "number");
    assert.ok(res.body.projects >= 1);
  } finally {
    await server.close();
  }
});


// --- V3-M1: system provider / CLI status endpoints ---

test("GET /system/providers returns sanitized provider status without API keys", async () => {
  const server = await startTestServer();
  try {
    const res = await getJson(server.baseUrl, "/system/providers");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(Array.isArray(res.body.providers), true);
    assert.equal(res.body.providers.length, 3);
    const json = JSON.stringify(res.body);
    assert.equal(json.includes("API_key"), false);
    for (const p of res.body.providers) {
      assert.ok(["claude", "gemini", "codex"].includes(p.id));
      assert.equal(typeof p.configured, "boolean");
      assert.equal("baseUrlHost" in p, true);
      assert.equal(Array.isArray(p.models), true);
      assert.equal("apiKey" in p, false);
      assert.equal("baseUrl" in p, false);
    }
  } finally {
    await server.close();
  }
});

test("GET /system/cli-status returns CLI availability list", async () => {
  const server = await startTestServer();
  try {
    const res = await getJson(server.baseUrl, "/system/cli-status");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(Array.isArray(res.body.clis), true);
    assert.equal(res.body.clis.length, 3);
    for (const cli of res.body.clis) {
      assert.ok(["claude-code", "gemini-cli", "codex-cli"].includes(cli.id));
      assert.equal(typeof cli.available, "boolean");
      assert.equal(typeof cli.command, "string");
      assert.equal("apiKey" in cli, false);
    }
  } finally {
    await server.close();
  }
});


// --- V3-M2: phase CLI policy endpoints ---

test("GET /settings/cli-policy returns defaults with no user override", async () => {
  const server = await startTestServer();
  try {
    const res = await getJson(server.baseUrl, "/settings/cli-policy");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.policy, "object");
    assert.equal(typeof res.body.defaults, "object");
    assert.equal(typeof res.body.fallbackPolicy, "object");
    assert.equal(res.body.policy.contract_draft.provider, "claude");
    assert.equal(res.body.policy.literature_scouting.provider, "gemini");
  } finally {
    await server.close();
  }
});

async function putJson(baseUrl, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

test("PUT /settings/cli-policy persists a valid partial overlay", async () => {
  const server = await startTestServer();
  try {
    const putRes = await putJson(server.baseUrl, "/settings/cli-policy", {
      policy: { literature_scouting: { provider: "mock", cli: "mock" } }
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.ok, true);
    assert.equal(putRes.body.policy.literature_scouting.provider, "mock");
    assert.equal(putRes.body.policy.contract_draft.provider, "claude");

    const getRes = await getJson(server.baseUrl, "/settings/cli-policy");
    assert.equal(getRes.body.policy.literature_scouting.provider, "mock");
  } finally {
    await server.close();
  }
});

test("PUT /settings/cli-policy rejects invalid provider/cli mismatch", async () => {
  const server = await startTestServer();
  try {
    const putRes = await putJson(server.baseUrl, "/settings/cli-policy", {
      policy: { literature_scouting: { provider: "claude", cli: "gemini-cli", model: "claude-haiku-4-5-20251001" } }
    });
    assert.equal(putRes.status, 400);
    assert.equal(putRes.body.ok, false);
    assert.ok(Array.isArray(putRes.body.errors));
  } finally {
    await server.close();
  }
});
