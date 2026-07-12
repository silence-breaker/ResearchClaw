import test from "node:test";
import assert from "node:assert/strict";
import { extractJsonObject } from "../adapters/cliShared.js";

test("extractJsonObject parses a bare top-level JSON array (no fence, no prose)", () => {
  const text = '[\n  { "id": "a", "title": "A" },\n  { "id": "b", "title": "B" }\n]';
  const out = extractJsonObject(text);
  assert.ok(Array.isArray(out), "should return the array, not the first element");
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "a");
});

test("extractJsonObject parses a top-level array wrapped in prose", () => {
  const text = 'Here are the paper cards you asked for:\n[{"id":"a"},{"id":"b"}]\nLet me know if you need more.';
  const out = extractJsonObject(text);
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 2);
});

test("extractJsonObject parses a fenced JSON array", () => {
  const text = "```json\n[{\"id\":\"a\"}]\n```";
  const out = extractJsonObject(text);
  assert.ok(Array.isArray(out));
  assert.equal(out[0].id, "a");
});

test("extractJsonObject still parses a bare object", () => {
  const out = extractJsonObject('{"selected":{"paper_id":"p"}}');
  assert.ok(out && !Array.isArray(out));
  assert.equal(out.selected.paper_id, "p");
});

test("extractJsonObject parses an object embedded in prose", () => {
  const out = extractJsonObject('Sure:\n{"a":1}\nDone.');
  assert.equal(out.a, 1);
});

test("extractJsonObject returns null when there is no JSON", () => {
  assert.equal(extractJsonObject("no json here"), null);
  assert.equal(extractJsonObject(""), null);
});
