import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { handleOpenClawPayload } from "../gateway.js";
import { createTempHarness } from "./helpers.js";
import { readJsonUrl } from "../util.js";

test("gateway accepts valid OpenClaw payloads and saves raw payloads", async () => {
  const { store, orchestrator, rootDir } = createTempHarness();
  const fixtures = [
    "session-start.json",
    "keyword-detector.json",
    "post-tool-use.json",
    "stop.json",
    "ask-user-question.json"
  ];

  for (const fixture of fixtures) {
    const payload = readJsonUrl(new URL(`../../fixtures/openclaw/${fixture}`, import.meta.url));
    const result = await handleOpenClawPayload({ payload, store, orchestrator });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
  }

  const rawDir = join(rootDir, "projects", "proj_demo_001", "raw_payloads");
  assert.ok(readdirSync(rawDir).length >= fixtures.length);
});

test("gateway rejects payloads missing required fields", async () => {
  const { store, orchestrator } = createTempHarness();
  const result = await handleOpenClawPayload({
    payload: {
      instruction: "x",
      timestamp: "2026-05-31T00:00:00.000Z",
      signal: { routeKey: "session.started", kind: "session", phase: "started", priority: "high" },
      context: {}
    },
    store,
    orchestrator
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.match(result.body.errors.join(" "), /event is required/);
});
