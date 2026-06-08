import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProviders, parseApiMd } from "../adapters/providers.js";

// Synthetic API.md (fake key) mirroring the real format — never commit a real key.
const SAMPLE = `# openclaw
base_url = https://token-plan-cn.example.com/v1
API_key = tp-fake-openclaw-key

# claude, codex, gemini
API_key = sk-FAKEproviderkey123
claude_base_url = https://yunwu.example
gemini_base_url = https://yunwu.example
openai_base_url = https://yunwu.example/v1
available_models = claude-haiku-4-5-20251001 ; gemini-3.1-flash-lite ; gpt-5.4-mini
`;

function writeSample(text = SAMPLE) {
  const dir = mkdtempSync(join(tmpdir(), "rc-apimd-"));
  const path = join(dir, "API.md");
  writeFileSync(path, text);
  return path;
}

test("parseApiMd reads the claude/codex/gemini section, not the openclaw one", () => {
  const parsed = parseApiMd(SAMPLE);
  assert.equal(parsed.apiKey, "sk-FAKEproviderkey123");
  assert.equal(parsed.claudeBaseUrl, "https://yunwu.example");
  assert.equal(parsed.geminiBaseUrl, "https://yunwu.example");
  assert.equal(parsed.openaiBaseUrl, "https://yunwu.example/v1");
  assert.deepEqual(parsed.models, ["claude-haiku-4-5-20251001", "gemini-3.1-flash-lite", "gpt-5.4-mini"]);
});

test("loadProviders maps each provider's base/key/model from API.md", () => {
  const providers = loadProviders({ apiMdPath: writeSample(), env: {} });
  assert.deepEqual(providers.claude, {
    baseUrl: "https://yunwu.example",
    apiKey: "sk-FAKEproviderkey123",
    model: "claude-haiku-4-5-20251001"
  });
  assert.equal(providers.gemini.model, "gemini-3.1-flash-lite");
  assert.equal(providers.codex.model, "gpt-5.4-mini");
  assert.equal(providers.codex.baseUrl, "https://yunwu.example/v1");
});

test("env vars override the claude provider", () => {
  const providers = loadProviders({
    apiMdPath: writeSample(),
    env: { RESEARCHCLAW_ANTHROPIC_BASE_URL: "https://override.example", RESEARCHCLAW_MODEL: "claude-haiku-4-5" }
  });
  assert.equal(providers.claude.baseUrl, "https://override.example");
  assert.equal(providers.claude.model, "claude-haiku-4-5");
  assert.equal(providers.claude.apiKey, "sk-FAKEproviderkey123");
});

test("a missing API.md yields null providers (feature off → inherit cc-switch)", () => {
  const providers = loadProviders({ apiMdPath: "/no/such/API.md", env: {} });
  assert.equal(providers.claude, null);
  assert.equal(providers.gemini, null);
  assert.equal(providers.codex, null);
});

test("a partial claude config (base but no key) is treated as not configured", () => {
  const path = writeSample("# claude, codex, gemini\nclaude_base_url = https://yunwu.example\n");
  const providers = loadProviders({ apiMdPath: path, env: {} });
  assert.equal(providers.claude, null);
});
