import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_HAIKU_ALIAS = "claude-haiku-4-5";

// cc-switch (and similar relays) write Anthropic env into ~/.claude/settings.json's
// `env` block. `claude` itself reads that, but a plain `npm run dev` shell does
// NOT export it — so server.js can't see ANTHROPIC_DEFAULT_HAIKU_MODEL there.
// Read it directly as a fallback. Returns {} on any error (missing/invalid file).
export function readClaudeSettingsEnv(path = join(homedir(), ".claude", "settings.json")) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed.env === "object" && parsed.env ? parsed.env : {};
  } catch {
    return {};
  }
}

// Resolve the Haiku model id to pass to `claude --model`. Priority:
//   1. RESEARCHCLAW_MODEL (explicit override)
//   2. ANTHROPIC_DEFAULT_HAIKU_MODEL from the process env
//   3. ANTHROPIC_DEFAULT_HAIKU_MODEL from ~/.claude/settings.json (cc-switch case)
//   4. the canonical alias
// Critically: never `ANTHROPIC_MODEL` — on a relay that is often Opus, which
// would break the cost red line.
export function resolveClaudeModel({ env = process.env, settingsEnv = readClaudeSettingsEnv() } = {}) {
  return (
    env.RESEARCHCLAW_MODEL ||
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
    settingsEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
    DEFAULT_HAIKU_ALIAS
  );
}
