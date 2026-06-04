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

async function postJson(baseUrl, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

async function driveToBlocked(server) {
  const projectId = "proj_recover";
  await postJson(server.baseUrl, `/projects/${projectId}/start`, {
    research_direction: "Explore retrieval reranking"
  });
  const state = server.store.readState(projectId);
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
    await postJson(server.baseUrl, `/projects/${projectId}/start`, {
      research_direction: "Explore retrieval reranking"
    });
    const state = server.store.readState(projectId);
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
    await postJson(server.baseUrl, `/projects/${projectId}/start`, {
      research_direction: "Explore retrieval reranking"
    });
    const state = server.store.readState(projectId);
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
