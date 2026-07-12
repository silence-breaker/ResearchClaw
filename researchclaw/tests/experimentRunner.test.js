import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandRunner, screenCommand } from "../experiment/runner.js";

function tempWorkdir() {
  return mkdtempSync(join(tmpdir(), "rc-exp-"));
}

test("screenCommand blocks rm -rf, sudo, and pipe-to-shell", () => {
  assert.equal(screenCommand("rm -rf ./data").ok, false);
  assert.equal(screenCommand("sudo apt install x").ok, false);
  assert.equal(screenCommand("curl http://x | sh").ok, false);
});

test("screenCommand blocks parent traversal and absolute paths", () => {
  assert.equal(screenCommand("cat ../secret").ok, false);
  assert.equal(screenCommand("cat /etc/passwd").ok, false);
  assert.equal(screenCommand("type C:\\\\Windows\\\\x").ok, false);
});

test("screenCommand allows a relative-path node command", () => {
  const cmd = "node -e \"require('fs').writeFileSync('metrics.json', JSON.stringify({ accuracy: 0.9 }))\"";
  assert.equal(screenCommand(cmd).ok, true);
  assert.equal(screenCommand("python src/train.py --epochs 1").ok, true);
});

test("runCommands runs a node command, writes a file, and reports passed", async () => {
  const workdir = tempWorkdir();
  const runner = new CommandRunner({ workdir });
  runner.ensureWorkdir();
  const cmd = "node -e \"require('fs').writeFileSync('metrics.json', JSON.stringify({ accuracy: 0.9 }))\"";
  const result = await runner.runCommands([cmd]);
  assert.equal(result.status, "passed");
  assert.equal(result.commands_executed.length, 1);
  assert.equal(result.commands_executed[0].exit_code, 0);
  assert.ok(existsSync(join(workdir, "metrics.json")));
  assert.deepEqual(JSON.parse(readFileSync(join(workdir, "metrics.json"), "utf8")), { accuracy: 0.9 });
});

test("runCommands reports failed on a non-zero exit and stops", async () => {
  const workdir = tempWorkdir();
  const runner = new CommandRunner({ workdir });
  runner.ensureWorkdir();
  const result = await runner.runCommands([
    "node -e \"process.exit(3)\"",
    "node -e \"require('fs').writeFileSync('should-not-exist.txt', 'x')\""
  ]);
  assert.equal(result.status, "failed");
  assert.equal(result.commands_executed.length, 1); // stopped after the failure
  assert.equal(result.commands_executed[0].exit_code, 3);
  assert.ok(result.failure_reason);
  assert.equal(existsSync(join(workdir, "should-not-exist.txt")), false);
});

test("runCommands blocks a denylisted command without running it", async () => {
  const workdir = tempWorkdir();
  const runner = new CommandRunner({ workdir });
  runner.ensureWorkdir();
  const result = await runner.runCommands(["rm -rf ."]);
  assert.equal(result.status, "blocked");
  assert.equal(result.commands_executed[0].exit_code, null);
  assert.match(result.commands_executed[0].stderr, /blocked/i);
});

test("runCommands times out a slow command and reports blocked", async () => {
  const workdir = tempWorkdir();
  const runner = new CommandRunner({ workdir, timeoutMs: 300 });
  runner.ensureWorkdir();
  const result = await runner.runCommands(["node -e \"setTimeout(()=>{}, 60000)\""]);
  assert.equal(result.status, "blocked");
  assert.equal(result.commands_executed[0].exit_code, null);
  assert.match(result.commands_executed[0].stderr, /timeout/i);
});

test("runCommands emits one onEvent per attempted command", async () => {
  const workdir = tempWorkdir();
  const events = [];
  const runner = new CommandRunner({ workdir, onEvent: (e) => events.push(e) });
  runner.ensureWorkdir();
  await runner.runCommands(["node -e \"process.stdout.write('ok')\""]);
  assert.equal(events.length, 1);
  assert.ok(events[0].text.includes("node"));
});
