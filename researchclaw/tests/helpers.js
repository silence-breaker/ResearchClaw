import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockModelAdapter } from "../adapters/mock.js";
import { EventBus } from "../engine/events.js";
import { ResearchOrchestrator } from "../engine/orchestrator.js";
import { FileEvidenceStore } from "../evidence/store.js";
import { createResearchServer } from "../server.js";

export function createTempHarness(adapter = new MockModelAdapter(), { costTracker = null, eventBus = null } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "researchclaw-"));
  const store = new FileEvidenceStore({ rootDir });
  const orchestrator = new ResearchOrchestrator({ store, adapter, costTracker, eventBus });
  return { rootDir, store, orchestrator };
}

// Boots the HTTP server on an ephemeral port for end-to-end route tests.
// Returns the base URL plus the wired store/orchestrator/eventBus and a close().
export async function startTestServer(adapter = new MockModelAdapter(), { webDistDir, buildAdapter, costTracker = null } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "researchclaw-http-"));
  const store = new FileEvidenceStore({ rootDir });
  const eventBus = new EventBus();
  // buildAdapter lets a test wire an adapter that needs the server's eventBus
  // (e.g. ClaudeCodeAdapter emitting cli_chunk that the SSE endpoint forwards).
  const wiredAdapter = buildAdapter ? buildAdapter(eventBus) : adapter;
  const orchestrator = new ResearchOrchestrator({ store, adapter: wiredAdapter, eventBus, costTracker });
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
