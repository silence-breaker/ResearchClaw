import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockModelAdapter } from "../adapters/mock.js";
import { EventBus } from "../engine/events.js";
import { ResearchOrchestrator } from "../engine/orchestrator.js";
import { FileEvidenceStore } from "../evidence/store.js";
import { createResearchServer } from "../server.js";

export function createTempHarness(adapter = new MockModelAdapter()) {
  const rootDir = mkdtempSync(join(tmpdir(), "researchclaw-"));
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter });
  return { rootDir, store, orchestrator };
}

// Boots the HTTP server on an ephemeral port for end-to-end route tests.
// Returns the base URL plus the wired store/orchestrator/eventBus and a close().
export async function startTestServer(adapter = new MockModelAdapter(), { webDistDir } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "researchclaw-http-"));
  const store = new FileEvidenceStore({ rootDir });
  const eventBus = new EventBus();
  const orchestrator = new ResearchOrchestrator({ store, adapter, eventBus });
  const server = createResearchServer({ store, orchestrator, eventBus, webDistDir });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    rootDir,
    store,
    orchestrator,
    eventBus,
    baseUrl,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
