import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MockModelAdapter } from "./adapters/mock.js";
import { ResearchOrchestrator } from "./engine/orchestrator.js";
import { FileEvidenceStore } from "./evidence/store.js";
import { handleOpenClawPayload } from "./gateway.js";

const fixtureUrl = new URL("../fixtures/openclaw/keyword-detector.json", import.meta.url);
const payload = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), "utf8"));
const store = new FileEvidenceStore();
const orchestrator = new ResearchOrchestrator({ store, adapter: new MockModelAdapter() });

console.log("1. loaded fixtures/openclaw/keyword-detector.json");
const hookResult = await handleOpenClawPayload({ payload, store, orchestrator });
if (!hookResult.body.ok) {
  throw new Error(JSON.stringify(hookResult.body));
}

const projectId = hookResult.body.project_id;
const stateAfterDraft = store.readState(projectId);
console.log(`2. created project ${projectId}`);
console.log("3. generated contract draft");
console.log("4. waiting for human approval");

await orchestrator.approve(projectId, {
  target: "contract",
  artifact_id: stateAfterDraft.current.contract_artifact_id,
  approved_by: "human",
  note: "Looks good for demo"
});

console.log("5. approved contract");
await orchestrator.advance(projectId);
console.log("6. generated literature scouting artifact");
await orchestrator.advance(projectId);
console.log("7. selected baseline");
await orchestrator.advance(projectId);
console.log("8. generated reproduction checklist");
await orchestrator.advance(projectId);
console.log("9. generated idea cards");
await orchestrator.advance(projectId);
console.log("10. generated idea review report");
await orchestrator.advance(projectId);
console.log("11. wrote demo summary");
