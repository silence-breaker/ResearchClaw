import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockModelAdapter } from "../adapters/mock.js";
import { ResearchOrchestrator } from "../engine/orchestrator.js";
import { FileEvidenceStore } from "../evidence/store.js";

export function createTempHarness(adapter = new MockModelAdapter()) {
  const rootDir = mkdtempSync(join(tmpdir(), "researchclaw-"));
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter });
  return { rootDir, store, orchestrator };
}
