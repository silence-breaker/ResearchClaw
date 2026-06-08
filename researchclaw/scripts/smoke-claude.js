// End-to-end smoke test against the REAL Claude Code CLI (Haiku). Local-only,
// gated behind RESEARCHCLAW_ENABLE_CLAUDE=1 — never runs in CI. Produces a
// logs/smoke-<ts>.json联调证据 covering the M3/M4 acceptance path:
//   1. contract_draft by real Haiku → contract gate → approve   (V1, V2)
//   2. one consult turn → promote to consult_note                (V7, V3)
//   3. usage with cache tokens + budget status                   (V10)
//
// Usage:  npm run smoke:claude
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EventBus } from "../engine/events.js";
import { ResearchOrchestrator } from "../engine/orchestrator.js";
import { FileEvidenceStore } from "../evidence/store.js";
import { buildAdapter } from "../server.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function log(step, data) {
  console.log(`\n=== ${step} ===`);
  console.log(JSON.stringify(data, null, 2));
}

async function waitFor(predicate, { tries = 600, intervalMs = 200 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function main() {
  if (process.env.RESEARCHCLAW_ENABLE_CLAUDE !== "1") {
    console.error("Refusing to run: set RESEARCHCLAW_ENABLE_CLAUDE=1 (this spends real Haiku tokens).");
    process.exit(2);
  }

  const store = new FileEvidenceStore();
  const eventBus = new EventBus();
  const { adapter, costTracker } = buildAdapter(eventBus);
  const orchestrator = new ResearchOrchestrator({ store, adapter, eventBus, costTracker });

  const projectId = `proj_smoke_${process.pid}`;
  const transcript = [];
  eventBus.subscribe(projectId, (event) => {
    if (event.type === "cli_chunk" && event.data?.text) {
      process.stdout.write(event.data.kind === "consult" ? `[consult] ${event.data.text}\n` : `[cli] ${event.data.text}\n`);
    }
  });

  // 1) contract_draft by real Haiku → gate → review
  const startedAt = Date.now();
  const ack = await orchestrator.beginDraftFromText(projectId, "Diffusion models for time-series forecasting", { source: "smoke" });
  log("begin draft (fast ack)", { phase: ack.phase, needs_draft: ack.needs_draft });
  if (ack.needs_draft) await orchestrator.executeContractRun(projectId);
  const drafted = store.readState(projectId);
  log("contract drafted", {
    phase: drafted.phase,
    contract_ref: drafted.current.contract_artifact_ref,
    draft_ms: Date.now() - startedAt,
    usage: drafted.usage
  });
  if (drafted.phase !== "contract_review") {
    log("DRAFT DID NOT REACH REVIEW (blocked/degraded?)", { block: drafted.block, usage: drafted.usage });
  } else {
    await orchestrator.approve(projectId, { target: "contract", artifact_id: drafted.current.contract_artifact_id });
    log("contract approved", { phase: store.readState(projectId).phase });
  }

  // 2) consult one turn → promote
  const consultAck = await orchestrator.beginConsult(projectId, "What baseline would you reproduce first, and why?");
  log("consult ack", consultAck);
  if (consultAck.running) {
    await orchestrator.executeConsult(projectId, "What baseline would you reproduce first, and why?");
    const afterConsult = await waitFor(() => {
      const s = store.readState(projectId);
      return s.consult?.raw_log_refs?.length ? s : null;
    });
    const rawRef = afterConsult.consult.raw_log_refs[0];
    const promoted = orchestrator.promoteConsult(projectId, rawRef, "smoke-adopted");
    log("consult promoted", { raw_log_ref: rawRef, consult_note_ref: promoted.artifact_ref });
  }

  // 3) final usage + budget
  const finalState = store.readState(projectId);
  log("final usage", finalState.usage);

  const out = {
    project_id: projectId,
    finished_at: new Date().toISOString(),
    phase: finalState.phase,
    usage: finalState.usage,
    consult: finalState.consult,
    consult_notes: finalState.current.consult_note_refs ?? []
  };
  mkdirSync(join(repoRoot, "logs"), { recursive: true });
  const file = join(repoRoot, "logs", `smoke-${out.finished_at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nSmoke log written to ${file}`);
}

main().catch((err) => {
  console.error("Smoke run failed:", err);
  process.exit(1);
});
