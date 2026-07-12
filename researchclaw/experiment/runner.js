import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

// A controlled command runner for the experiment_execution phase. RC owns this —
// the LLM CLIs never get a shell (sandbox ALLOWED_TOOLS excludes Bash, a red
// line). Every command is screened, run in a locked project workdir, and its
// exit_code / stdout / stderr recorded honestly. exit_code != 0 is NEVER passed.
const DENYLIST = [
  { pattern: /\brm\s+-[a-z]*r/i, label: "rm -r" },
  { pattern: /\bsudo\b/i, label: "sudo" },
  { pattern: /\b(curl|wget)\b[^|]*\|\s*(sh|bash|zsh)/i, label: "pipe download to shell" },
  { pattern: /\bdd\b\s+if=/i, label: "dd if=" },
  { pattern: /\bmkfs\b/i, label: "mkfs" },
  { pattern: /\b(shutdown|reboot|halt)\b/i, label: "shutdown/reboot" },
  { pattern: /\bformat\s+[a-z]:/i, label: "format drive" },
  { pattern: /\bdel\s+\/[a-z]/i, label: "del /flag" },
  { pattern: /\brmdir\s+\/s/i, label: "rmdir /s" },
  { pattern: />\s*\/dev\//i, label: "redirect to /dev" }
];

// Screens a single command string. Blocks dangerous verbs, parent traversal, and
// absolute paths (a controlled runner errs toward blocking; the human sees the
// reason). Relative paths like `src/train.py` are allowed.
export function screenCommand(command) {
  if (typeof command !== "string" || !command.trim()) {
    return { ok: false, reason: "empty command" };
  }
  for (const { pattern, label } of DENYLIST) {
    if (pattern.test(command)) {
      return { ok: false, reason: `blocked: ${label}` };
    }
  }
  if (/(^|[\s"'`/\\])\.\.([\s"'`/\\]|$)/.test(command)) {
    return { ok: false, reason: "blocked: parent path escape (..)" };
  }
  if (/(^|[\s"'`])\/[^/\s]/.test(command)) {
    return { ok: false, reason: "blocked: absolute unix path" };
  }
  if (/(^|[\s"'`])[A-Za-z]:[\\/]/.test(command)) {
    return { ok: false, reason: "blocked: absolute windows path" };
  }
  return { ok: true };
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}

export class CommandRunner {
  constructor({ workdir, timeoutMs = 120000, maxOutputChars = 20000, onEvent = null }) {
    this.workdir = workdir;
    this.timeoutMs = timeoutMs;
    this.maxOutputChars = maxOutputChars;
    this.onEvent = onEvent;
  }

  ensureWorkdir() {
    mkdirSync(this.workdir, { recursive: true });
  }

  // Spawns one command in a shell inside the locked workdir, capturing output and
  // enforcing a timeout. exit_code is null when the process was killed (timeout).
  runOne(command) {
    return new Promise((resolve) => {
      const started = Date.now();
      const child = spawn(command, { cwd: this.workdir, shell: true });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, this.timeoutMs);
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          command,
          cwd: this.workdir,
          exit_code: null,
          stdout: truncate(stdout, this.maxOutputChars),
          stderr: `spawn error: ${err.message}`,
          duration_ms: Date.now() - started,
          timedOut: false
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          command,
          cwd: this.workdir,
          exit_code: timedOut ? null : code,
          stdout: truncate(stdout, this.maxOutputChars),
          stderr: timedOut ? `${truncate(stderr, this.maxOutputChars)}\ntimeout after ${this.timeoutMs}ms` : truncate(stderr, this.maxOutputChars),
          duration_ms: Date.now() - started,
          timedOut
        });
      });
    });
  }

  // Runs commands in order. Stops at the first blocked/timeout (→ blocked) or the
  // first non-zero exit (→ failed). All-zero → passed.
  async runCommands(commands) {
    const executed = [];
    let status = "passed";
    let failure_reason = null;
    for (const command of commands || []) {
      this.onEvent?.({ role: "命令", text: command });
      const screen = screenCommand(command);
      if (!screen.ok) {
        executed.push({ command, cwd: this.workdir, exit_code: null, stdout: "", stderr: screen.reason, duration_ms: 0 });
        status = "blocked";
        failure_reason = screen.reason;
        break;
      }
      const outcome = await this.runOne(command);
      executed.push({
        command: outcome.command,
        cwd: outcome.cwd,
        exit_code: outcome.exit_code,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        duration_ms: outcome.duration_ms
      });
      if (outcome.timedOut) {
        status = "blocked";
        failure_reason = `timeout after ${this.timeoutMs}ms: ${command}`;
        break;
      }
      if (outcome.exit_code !== 0) {
        status = "failed";
        failure_reason = `command exited ${outcome.exit_code}: ${command}`;
        break;
      }
    }
    return { status, commands_executed: executed, failure_reason };
  }
}
