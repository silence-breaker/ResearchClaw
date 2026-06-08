import test from "node:test";
import assert from "node:assert/strict";
import { MockModelAdapter } from "../adapters/mock.js";
import { createArtifact } from "../evidence/types.js";
import { runContractDraftWorkflow } from "../workflows/contractDraft.js";
import { runLiteratureWorkflow } from "../workflows/literature.js";

test("mock adapter returns deterministic structured output", async () => {
  const adapter = new MockModelAdapter();
  const result = await adapter.run({
    task_id: "contract_draft",
    project_id: "proj_demo_001",
    phase: "contract_draft",
    instructions: "draft",
    inputs: [{ ref: "r1", type: "research_direction", content: "test topic" }],
    output_schema: "ResearchContractV1"
  });
  assert.equal(result.ok, true);
  assert.equal(result.output.project_id, "proj_demo_001");
  assert.equal(result.output.status, "draft");
});

test("workflow outputs artifacts without touching state", async () => {
  const adapter = new MockModelAdapter();
  const { contract: artifact, raw } = await runContractDraftWorkflow({
    adapter,
    projectId: "proj_demo_001",
    userText: "Explore retrieval reranking"
  });
  assert.equal(artifact.type, "contract");
  assert.equal(artifact.status, "draft");
  assert.equal(artifact.content.project_id, "proj_demo_001");
  // mock adapter has no CLI transcript, so no raw is surfaced.
  assert.equal(raw, undefined);
});

test("literature workflow returns paper cards artifact", async () => {
  const adapter = new MockModelAdapter();
  const contract = createArtifact({
    projectId: "proj_demo_001",
    phase: "contract_review",
    type: "contract",
    workflow: "manual",
    adapter: "manual",
    content: {}
  });
  const artifact = await runLiteratureWorkflow({
    adapter,
    projectId: "proj_demo_001",
    contract: contract.content
  });
  assert.equal(artifact.type, "paper_cards");
  assert.ok(Array.isArray(artifact.content));
  assert.ok(artifact.content.length >= 3);
});
