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

const wf = (name) => readJsonUrl(new URL(`../../fixtures/workflows/${name}.json`, import.meta.url));

test("PaperCard[] accepts the literature fixture and rejects a card missing why_relevant", () => {
  assert.doesNotThrow(() => getOutputSchema("PaperCard[]"));
  assert.equal(validateOutput("PaperCard[]", wf("literature-output")).ok, true);
  const broken = wf("literature-output");
  delete broken[0].why_relevant;
  const result = validateOutput("PaperCard[]", broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("why_relevant")));
  assert.equal(validateOutput("PaperCard[]", []).ok, false);
});

test("BaselineDecision accepts the baseline fixture and rejects a missing selected.name", () => {
  assert.equal(validateOutput("BaselineDecision", wf("baseline-output")).ok, true);
  const broken = wf("baseline-output");
  delete broken.selected.name;
  const result = validateOutput("BaselineDecision", broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("selected.name")));
  assert.equal(validateOutput("BaselineDecision", { selected: { paper_id: "x", name: "y" }, candidates: [] }).ok, false);
});

test("ReproductionChecklist accepts the checklist fixture and rejects an empty commands list", () => {
  assert.equal(validateOutput("ReproductionChecklist", wf("reproduction-checklist-output")).ok, true);
  const broken = wf("reproduction-checklist-output");
  broken.commands = [];
  const result = validateOutput("ReproductionChecklist", broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("commands")));
});

test("IdeaCard[] accepts the idea fixture and rejects a card with empty evidence_refs", () => {
  assert.equal(validateOutput("IdeaCard[]", wf("idea-output")).ok, true);
  const broken = wf("idea-output");
  broken[0].evidence_refs = [];
  const result = validateOutput("IdeaCard[]", broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("evidence_refs")));
});

test("IdeaReviewReport accepts the review fixture and rejects a non-numeric score", () => {
  assert.equal(validateOutput("IdeaReviewReport", wf("idea-review-output")).ok, true);
  const broken = wf("idea-review-output");
  broken.reviews[0].scores.novelty = "high";
  const result = validateOutput("IdeaReviewReport", broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("novelty")));
  const badDecision = wf("idea-review-output");
  badDecision.reviews[0].decision = "maybe";
  assert.equal(validateOutput("IdeaReviewReport", badDecision).ok, false);
});

test("DemoSummary requires a non-empty next_human_actions array", () => {
  assert.equal(validateOutput("DemoSummary", {
    project_id: "p", next_human_actions: ["Confirm dataset license"]
  }).ok, true);
  assert.equal(validateOutput("DemoSummary", { project_id: "p", next_human_actions: [] }).ok, false);
  assert.equal(validateOutput("DemoSummary", "nope").ok, false);
});

test("each new schema exposes a prompt-embeddable jsonSchema text", () => {
  for (const name of ["PaperCard[]", "BaselineDecision", "ReproductionChecklist", "IdeaCard[]", "IdeaReviewReport", "DemoSummary"]) {
    const schema = getOutputSchema(name);
    assert.equal(typeof schema.jsonSchema, "string");
    assert.ok(schema.jsonSchema.length > 0, `${name} jsonSchema text must be non-empty`);
  }
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
