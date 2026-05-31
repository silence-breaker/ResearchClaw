import test from "node:test";
import assert from "node:assert/strict";
import { readJsonUrl } from "../util.js";
import { validateResearchContract } from "../contract/schema.js";
import { reviseContract } from "../contract/contract.js";

test("valid contract passes validation", () => {
  const contract = readJsonUrl(new URL("../../fixtures/contracts/valid.json", import.meta.url));
  const result = validateResearchContract(contract);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("contract missing hypothesis fails validation", () => {
  const contract = readJsonUrl(new URL("../../fixtures/contracts/missing-hypothesis.json", import.meta.url));
  const result = validateResearchContract(contract);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /hypothesis is required/);
});

test("revising a contract creates a new version", () => {
  const contract = readJsonUrl(new URL("../../fixtures/contracts/valid.json", import.meta.url));
  const revised = reviseContract(contract, "tighten the failure signal");
  assert.equal(revised.version, contract.version + 1);
  assert.notEqual(revised.contract_id, contract.contract_id);
  assert.match(revised.human_notes, /Revision request/);
});
