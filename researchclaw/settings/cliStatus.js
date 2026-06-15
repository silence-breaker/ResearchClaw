import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_CLI_COMMANDS = [
  { id: "claude-code", provider: "claude", command: "claude" },
  { id: "gemini-cli", provider: "gemini", command: "gemini" },
  { id: "codex-cli", provider: "codex", command: "codex" }
];

// Default checker: determine whether `command` is on PATH using POSIX `command -v`.
// This avoids spawning the CLI itself (which could be slow or interactive) and keeps
// availability detection lightweight. Errors are swallowed and reported as unavailable.
async function defaultChecker(command) {
  try {
    await execFileAsync("sh", ["-c", `command -v ${command}`], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Returns availability status for each supported CLI. Never throws: individual
// failures are reported as `available: false`, and the endpoint always returns a
// complete list so partial environment issues don't break the UI.
export async function checkCliStatus({ commands = DEFAULT_CLI_COMMANDS, checker = defaultChecker } = {}) {
  const entries = await Promise.all(
    commands.map(async ({ id, provider, command }) => {
      try {
        const available = await checker(command);
        return { id, provider, available, command };
      } catch {
        return { id, provider, available: false, command };
      }
    })
  );
  return entries;
}
