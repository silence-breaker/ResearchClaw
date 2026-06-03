import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startTestServer } from "./helpers.js";

function makeDist() {
  const dir = mkdtempSync(join(tmpdir(), "researchclaw-dist-"));
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>spa</title><div id=root></div>");
  writeFileSync(join(dir, "assets", "app.js"), "console.log('app');");
  return dir;
}

test("GET /app/ serves the built SPA index.html", async () => {
  const server = await startTestServer(undefined, { webDistDir: makeDist() });
  try {
    const res = await fetch(`${server.baseUrl}/app/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /<title>spa<\/title>/);
  } finally {
    await server.close();
  }
});

test("GET /app/assets/app.js serves the static asset with a JS content-type", async () => {
  const server = await startTestServer(undefined, { webDistDir: makeDist() });
  try {
    const res = await fetch(`${server.baseUrl}/app/assets/app.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /javascript/);
    assert.match(await res.text(), /console\.log/);
  } finally {
    await server.close();
  }
});

test("GET /app/<deep route> falls back to index.html for client-side routing", async () => {
  const server = await startTestServer(undefined, { webDistDir: makeDist() });
  try {
    const res = await fetch(`${server.baseUrl}/app/panel/proj_demo_001`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /<title>spa<\/title>/);
  } finally {
    await server.close();
  }
});

test("SPA hosting does not shadow API routes", async () => {
  const server = await startTestServer(undefined, { webDistDir: makeDist() });
  try {
    const res = await fetch(`${server.baseUrl}/projects`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.projects));
  } finally {
    await server.close();
  }
});

test("legacy ui.js index route stays intact alongside the SPA", async () => {
  const server = await startTestServer(undefined, { webDistDir: makeDist() });
  try {
    const res = await fetch(`${server.baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    // ui.js renders the legacy console, not the SPA placeholder
    assert.doesNotMatch(await res.text(), /<title>spa<\/title>/);
  } finally {
    await server.close();
  }
});
