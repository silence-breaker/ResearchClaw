import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readClaudeSettingsEnv, resolveClaudeModel } from "../adapters/claudeConfig.js";

test("resolveClaudeModel prefers RESEARCHCLAW_MODEL", () => {
  const model = resolveClaudeModel({
    env: { RESEARCHCLAW_MODEL: "claude-haiku-4-5-20251001", ANTHROPIC_DEFAULT_HAIKU_MODEL: "x" },
    settingsEnv: { ANTHROPIC_DEFAULT_HAIKU_MODEL: "y" }
  });
  assert.equal(model, "claude-haiku-4-5-20251001");
});

test("resolveClaudeModel falls back to env ANTHROPIC_DEFAULT_HAIKU_MODEL", () => {
  const model = resolveClaudeModel({
    env: { ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5-20251001" },
    settingsEnv: {}
  });
  assert.equal(model, "claude-haiku-4-5-20251001");
});

test("resolveClaudeModel falls back to settings.json Haiku id when env lacks it", () => {
  // This is the cc-switch case: the var lives in ~/.claude/settings.json, which
  // `claude` reads but a plain `npm run dev` shell does not export.
  const model = resolveClaudeModel({
    env: {},
    settingsEnv: { ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5-20251001" }
  });
  assert.equal(model, "claude-haiku-4-5-20251001");
});

test("resolveClaudeModel never inherits a non-Haiku ANTHROPIC_MODEL default", () => {
  // settings.json default model is often Opus on a relay — must NOT be picked.
  const model = resolveClaudeModel({
    env: { ANTHROPIC_MODEL: "claude-opus-4-8" },
    settingsEnv: { ANTHROPIC_MODEL: "claude-opus-4-8" }
  });
  assert.equal(model, "claude-haiku-4-5");
});

test("readClaudeSettingsEnv reads the env block, tolerates a missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "rc-settings-"));
  const path = join(dir, "settings.json");
  writeFileSync(path, JSON.stringify({ env: { ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5-20251001", ANTHROPIC_AUTH_TOKEN: "sk-secret" } }));
  const env = readClaudeSettingsEnv(path);
  assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, "claude-haiku-4-5-20251001");

  assert.deepEqual(readClaudeSettingsEnv(join(dir, "nope.json")), {});
});
