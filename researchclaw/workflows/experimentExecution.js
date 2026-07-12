import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CommandRunner } from "../experiment/runner.js";
import { createArtifact } from "../evidence/types.js";
import { nowIso, redactSecrets } from "../util.js";

// Reads the conventional metrics.json the experiment is expected to write. Absent
// or malformed → {} (an honest "no metrics observed").
function readMetricsJson(workdir) {
  const path = join(workdir, "metrics.json");
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function listProducedFiles(workdir) {
  try {
    return readdirSync(workdir);
  } catch {
    return [];
  }
}

// experiment_execution is NOT an LLM step. RC's CommandRunner really runs the
// plan's commands in a locked project workdir and records honest results. The
// windowId groups this run's process-feed chunks in the panel (M5b).
export async function runExperimentExecutionWorkflow({
  store,
  projectId,
  plan,
  planRef,
  workdir,
  eventBus = null,
  inputRefs = [],
  evidenceRefs = []
}) {
  const windowId = `win_experiment_execution_${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}`;
  const onEvent = eventBus
    ? (evt) =>
        eventBus.emit(projectId, {
          type: "cli_chunk",
          data: {
            kind: "workflow",
            phase: "experiment_execution",
            provider: "runner",
            cli: null,
            model: null,
            windowId,
            role: evt.role,
            text: evt.text,
            ts: nowIso()
          }
        })
    : null;

  const runner = new CommandRunner({ workdir, onEvent });
  runner.ensureWorkdir();
  const runResult = await runner.runCommands(Array.isArray(plan?.commands) ? plan.commands : []);

  const commands_executed = runResult.commands_executed.map((cmd) => ({
    command: cmd.command,
    cwd: cmd.cwd,
    exit_code: cmd.exit_code,
    duration_ms: cmd.duration_ms,
    stdout_ref: store.saveRawPayload(projectId, "experiment-stdout", redactSecrets({ command: cmd.command, stdout: cmd.stdout })),
    stderr_ref: store.saveRawPayload(projectId, "experiment-stderr", redactSecrets({ command: cmd.command, stderr: cmd.stderr }))
  }));

  const metrics_observed = readMetricsJson(workdir);
  const raw_log_ref = store.saveRawPayload(
    projectId,
    "experiment-run",
    redactSecrets({ status: runResult.status, failure_reason: runResult.failure_reason, commands_executed: runResult.commands_executed })
  );

  return createArtifact({
    projectId,
    phase: "experiment_execution",
    type: "experiment_run",
    workflow: "experimentExecution",
    adapter: "runner",
    cli: null,
    model: null,
    windowId,
    inputRefs,
    evidenceRefs,
    content: {
      plan_ref: planRef,
      status: runResult.status,
      commands_executed,
      produced_files: listProducedFiles(workdir),
      raw_log_ref,
      metrics_observed,
      failure_reason: runResult.failure_reason,
      ended_at: nowIso()
    }
  });
}
