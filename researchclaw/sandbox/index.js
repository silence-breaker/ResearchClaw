import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Restricted toolset for headless CLI runs: read/write inside the sandbox plus
// web search. Bash, delete, and other dangerous tools are intentionally absent
// (技术路线指南 §7 — CLI must not get broad file/shell autonomy).
export const ALLOWED_TOOLS = "Read,Write,WebSearch";

// Each CLI run gets its own throwaway working directory. The caller passes
// `dir` to `claude --cwd` and reads `out.json` back from it, then calls
// cleanup() (idempotent) to remove the directory regardless of success.
export function createSandbox() {
  const dir = mkdtempSync(join(tmpdir(), "researchclaw-sbx-"));
  return {
    dir,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
