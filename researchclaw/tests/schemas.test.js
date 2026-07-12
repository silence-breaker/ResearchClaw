import test from "node:test";
import assert from "node:assert/strict";
import { readJsonUrl } from "../util.js";
import { getOutputSchema, validateOutput } from "../adapters/schemas.js";

const contractFixture = () => readJsonUrl(new URL("../../fixtures/contracts/valid.json", import.meta.url));

test("ResearchContractV1 accepts a valid contract", () => {
  const result = validateOutput("ResearchContractV1", contractFixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("ResearchContractV1 rejects an invalid contract (missing required fields)", () => {
  const broken = contractFixture();
  delete broken.research_question;
  const result = validateOutput("ResearchContractV1", broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("research_question")));
});

test("ResearchContractV1 rejects a non-object payload", () => {
  const result = validateOutput("ResearchContractV1", "not an object");
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("getOutputSchema exposes a prompt-embeddable jsonSchema text for ResearchContractV1", () => {
  const schema = getOutputSchema("ResearchContractV1");
  assert.ok(schema);
  assert.equal(typeof schema.jsonSchema, "string");
  assert.ok(schema.jsonSchema.includes("research_question"));
});

test("unknown schema name throws", () => {
  assert.throws(() => validateOutput("NopeV9", {}), /unknown output schema/i);
  assert.throws(() => getOutputSchema("NopeV9"), /unknown output schema/i);
});

test("ExperimentPlanV1 and ExperimentReviewV1 are registered and validate shape", () => {
  assert.doesNotThrow(() => getOutputSchema("ExperimentPlanV1"));
  assert.doesNotThrow(() => getOutputSchema("ExperimentReviewV1"));
  assert.equal(validateOutput("ExperimentPlanV1", {
    idea_ref: "i", commands: ["python x.py"], metrics: ["recall@10"],
    success_criteria: ["s"], failure_criteria: ["f"]
  }).ok, true);
  assert.equal(validateOutput("ExperimentPlanV1", { idea_ref: "i" }).ok, false);
  assert.equal(validateOutput("ExperimentReviewV1", {
    run_ref: "r", claim_support: [{ claim_id: "C1", metric_ref: "m", support_type: "supports" }], decision: "accept_idea"
  }).ok, true);
  assert.equal(validateOutput("ExperimentReviewV1", { run_ref: "r" }).ok, false);
});
