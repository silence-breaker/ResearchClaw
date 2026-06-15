import test from "node:test";
import assert from "node:assert/strict";
import { checkCliStatus, DEFAULT_CLI_COMMANDS } from "../settings/cliStatus.js";

test("checkCliStatus returns all CLIs with available:false when none are installed", async () => {
  const clis = await checkCliStatus({ checker: () => false });
  assert.equal(clis.length, 3);
  for (const cli of clis) {
    assert.equal(cli.available, false);
    assert.ok(["claude-code", "gemini-cli", "codex-cli"].includes(cli.id));
    assert.ok(["claude", "gemini", "codex"].includes(cli.provider));
    assert.equal(typeof cli.command, "string");
  }
});

test("checkCliStatus reports available:true when checker succeeds", async () => {
  const checker = (cmd) => Promise.resolve(cmd === "claude");
  const clis = await checkCliStatus({ checker });
  const claude = clis.find((c) => c.id === "claude-code");
  const gemini = clis.find((c) => c.id === "gemini-cli");
  assert.equal(claude.available, true);
  assert.equal(gemini.available, false);
});

test("checkCliStatus swallows checker errors and marks unavailable", async () => {
  const checker = () => {
    throw new Error("probe failed");
  };
  const clis = await checkCliStatus({ checker });
  for (const cli of clis) {
    assert.equal(cli.available, false);
  }
});

test("checkCliStatus supports custom command list", async () => {
  const commands = [{ id: "custom-cli", provider: "claude", command: "custom" }];
  const clis = await checkCliStatus({ commands, checker: () => true });
  assert.equal(clis.length, 1);
  assert.equal(clis[0].id, "custom-cli");
  assert.equal(clis[0].available, true);
});
