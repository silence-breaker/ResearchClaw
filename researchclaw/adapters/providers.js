import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Default location of the gitignored API.md at the repo root (one level above
// researchclaw/). It is the single source of truth for the ResearchClaw-only
// model provider (e.g. yunwu.ai) and is never committed.
const DEFAULT_API_MD = fileURLToPath(new URL("../../API.md", import.meta.url));

// Parse the "# claude, codex, gemini" section of API.md into raw fields. The
// file has two sections (openclaw + this one); we only read this one. Tolerant
// of spacing; `key = value` lines, section ends at the next `#` header.
export function parseApiMd(text) {
  const lines = String(text || "").split(/\r?\n/);
  let inSection = false;
  const fields = {};
  for (const line of lines) {
    const header = line.match(/^\s*#\s*(.+?)\s*$/);
    if (header) {
      const title = header[1].toLowerCase();
      inSection = title.includes("claude") && title.includes("gemini");
      continue;
    }
    if (!inSection) continue;
    const kv = line.match(/^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$/);
    if (!kv) continue;
    fields[kv[1].toLowerCase()] = kv[2].trim();
  }
  return {
    apiKey: fields.api_key || null,
    claudeBaseUrl: fields.claude_base_url || null,
    geminiBaseUrl: fields.gemini_base_url || null,
    openaiBaseUrl: fields.openai_base_url || null,
    models: fields.available_models ? fields.available_models.split(";").map((m) => m.trim()).filter(Boolean) : []
  };
}

function pickModel(models, re) {
  return models.find((m) => re.test(m)) || null;
}

function provider(baseUrl, apiKey, model) {
  return baseUrl && apiKey ? { baseUrl, apiKey, model } : null;
}

// Loads the ResearchClaw-only provider config (claude/gemini/codex) from API.md,
// with env overrides for claude. Missing/partial config → null for that provider
// (the adapter then inherits the global cc-switch env, i.e. feature off).
export function loadProviders({ apiMdPath = DEFAULT_API_MD, env = process.env } = {}) {
  let parsed = { apiKey: null, claudeBaseUrl: null, geminiBaseUrl: null, openaiBaseUrl: null, models: [] };
  try {
    parsed = parseApiMd(readFileSync(apiMdPath, "utf8"));
  } catch {
    /* no API.md → all providers null */
  }
  const claudeBaseUrl = env.RESEARCHCLAW_ANTHROPIC_BASE_URL || parsed.claudeBaseUrl;
  const claudeKey = env.RESEARCHCLAW_ANTHROPIC_API_KEY || parsed.apiKey;
  const claudeModel = env.RESEARCHCLAW_MODEL || pickModel(parsed.models, /claude/i) || "claude-haiku-4-5";
  return {
    claude: provider(claudeBaseUrl, claudeKey, claudeModel),
    gemini: provider(parsed.geminiBaseUrl, parsed.apiKey, pickModel(parsed.models, /gemini/i)),
    codex: provider(parsed.openaiBaseUrl, parsed.apiKey, pickModel(parsed.models, /gpt|codex/i))
  };
}
