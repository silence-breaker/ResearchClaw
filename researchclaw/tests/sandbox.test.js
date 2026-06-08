import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ALLOWED_TOOLS, createSandbox } from "../sandbox/index.js";

test("ALLOWED_TOOLS is the restricted default (no Bash / delete)", () => {
  assert.equal(ALLOWED_TOOLS, "Read,Write,WebSearch");
});

test("createSandbox makes a fresh directory under the system tmp root", () => {
  const sandbox = createSandbox("proj_a");
  try {
    assert.ok(existsSync(sandbox.dir));
    assert.ok(resolve(sandbox.dir).startsWith(resolve(tmpdir())));
  } finally {
    sandbox.cleanup();
  }
});

test("two sandboxes get distinct directories", () => {
  const a = createSandbox("proj_a");
  const b = createSandbox("proj_a");
  try {
    assert.notEqual(a.dir, b.dir);
  } finally {
    a.cleanup();
    b.cleanup();
  }
});

test("cleanup removes the directory and its contents", () => {
  const sandbox = createSandbox("proj_a");
  writeFileSync(resolve(sandbox.dir, "out.json"), "{}");
  sandbox.cleanup();
  assert.equal(existsSync(sandbox.dir), false);
});

test("cleanup is idempotent", () => {
  const sandbox = createSandbox("proj_a");
  sandbox.cleanup();
  assert.doesNotThrow(() => sandbox.cleanup());
});
