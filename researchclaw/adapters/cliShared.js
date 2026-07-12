// Shared helpers for the headless text-only CLI adapters (Gemini / Codex).
// Unlike Claude Code's two-channel model (stream-json 过程流 + out.json 结构化
// artifact), gemini/codex headless runs only emit free-form text on stdout. The
// structured artifact must therefore be extracted from that text and
// schema-validated — a reply that carries no valid JSON is a schema violation,
// never a silent pass (docs/CLI接入配置.md §4.4 / §7.4).

// Role label for the right-column process feed, by phase (技术路线指南 §5.3).
// Mirrors the mapping ClaudeCodeAdapter uses so all three CLIs tag chunks the
// same way.
const ROLE_BY_PHASE = {
  contract_draft: "规划",
  literature_scouting: "文献",
  baseline_selection: "复现",
  baseline_reproduction_checklist: "复现",
  idea_generation: "想法",
  idea_review: "想法"
};

export function roleForPhase(phase) {
  return ROLE_BY_PHASE[phase] || "执行";
}

// Spawn a headless text CLI (gemini/codex) portably and deliver the prompt on
// STDIN. Two Windows-specific reasons this helper exists:
//   1. `gemini`/`codex` installed via npm are `.cmd` shims. Node cannot exec a
//      `.cmd` without a shell (spawn → ENOENT), so we set shell:true on win32.
//      (The `claude` binary is a real .exe and does not use this helper.)
//   2. Under a Windows shell, args are concatenated unescaped, so a prompt
//      containing spaces / newlines / quotes gets split by cmd.exe — verified to
//      make gemini see a stray positional arg and codex report "unexpected
//      argument". The prompt therefore never goes in argv; it is piped to stdin
//      (both CLIs read the prompt from stdin when no positional prompt is given).
// argv thus carries only fixed, safe flags; the API key stays in env (buildEnv).
// spawnImpl is injectable so tests drive a stub child (whose stdin, if present,
// simply receives the prompt).
export function spawnCliWithPrompt(spawnImpl, bin, args, { env, prompt } = {}) {
  const child = spawnImpl(bin, args, { env, shell: process.platform === "win32" });
  if (child.stdin) {
    try {
      child.stdin.write(prompt ?? "");
      child.stdin.end();
    } catch {
      /* stdin may already be gone on a fast-failing spawn */
    }
  }
  return child;
}

// Build a headless prompt that forces a single JSON object on stdout. Mirrors
// ClaudeCodeAdapter.buildPrompt but targets stdout (gemini/codex are text-only,
// there is no out.json to write).
export function buildJsonPrompt(request, schema) {
  const lines = [request.instructions || ""];
  for (const input of request.inputs || []) {
    lines.push(
      `\n[input:${input.type}]\n${typeof input.content === "string" ? input.content : JSON.stringify(input.content, null, 2)}`
    );
  }
  lines.push(
    "\nReturn your single result as ONE JSON object and nothing else.",
    "It MUST strictly match this schema:",
    schema.jsonSchema,
    "Output ONLY the JSON object — no prose, no explanation before or after."
  );
  return lines.join("\n");
}

function tryParse(s) {
  try {
    return JSON.parse(String(s).trim());
  } catch {
    return null;
  }
}

// Scan from `start` (a '{' or '[') to its matching close, honoring string
// literals and escapes so brackets inside strings don't throw off the depth
// count. Handles nested mixes of {} and [] via a single depth counter.
function sliceBalanced(text, start) {
  const open = text[start];
  if (open !== "{" && open !== "[") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// Pull the first parseable top-level JSON value out of free-form CLI text.
// Some schemas are arrays (PaperCard[], IdeaCard[]), so we must return arrays
// as-is, not just their first element. Order: (1) the whole string as JSON —
// the clean case where the CLI emitted pure JSON (object or array); (2) a
// ```json fenced block; (3) the first balanced { ... } or [ ... ] anywhere in
// the text. Returns the parsed object/array or null when nothing parses.
export function extractJsonObject(text) {
  if (!text || typeof text !== "string") return null;

  // (1) the whole string — pure JSON object or array, no prose or fence
  const whole = tryParse(text);
  if (whole && typeof whole === "object") return whole;

  // (2) fenced code blocks — many CLIs wrap JSON in ```json ... ```
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fence.exec(text)) !== null) {
    const parsed = tryParse(m[1]);
    if (parsed && typeof parsed === "object") return parsed;
  }

  // (3) first balanced { ... } or [ ... ] anywhere in the text
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "{" && text[i] !== "[") continue;
    const candidate = sliceBalanced(text, i);
    if (candidate) {
      const parsed = tryParse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    }
  }

  return null;
}
