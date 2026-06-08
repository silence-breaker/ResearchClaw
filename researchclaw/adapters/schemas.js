import { validateResearchContract } from "../contract/schema.js";

// A compact, human/LLM-readable description of the research-contract shape.
// This text is appended to the workflow prompt so the CLI knows exactly what to
// write into out.json. The authoritative machine check stays in
// validateResearchContract (and the contract gate runs again in the engine).
const RESEARCH_CONTRACT_V1_TEXT = `ResearchContractV1 — write a single JSON object with these fields:
{
  "schema_version": "research-contract/v1",
  "contract_id": string,
  "project_id": string,
  "status": "draft",
  "version": integer >= 1,
  "topic": string,
  "research_question": string,
  "hypothesis": string,
  "setting": object,
  "metrics": [{ "name": string, "direction": "higher_is_better"|"lower_is_better"|"qualitative", "reason": string }],
  "success_criteria": [{ "id": string, "description": string, "metric"?: string, "threshold"?: string }],
  "failure_signals": [{ "id": string, "description": string }],
  "data_split": { "train"?: string, "validation"?: string, "test"?: string } | { "note": "not_applicable" },
  "claim_evidence_map": [{ "claim_id": string, "claim": string, "required_evidence": [string] }]
}
All array fields must be non-empty. Output ONLY this JSON object into ./out.json.`;

// output_schema name -> validator + prompt-embeddable schema text.
// M2 only wires ResearchContractV1; other phases are reserved.
const REGISTRY = {
  ResearchContractV1: {
    jsonSchema: RESEARCH_CONTRACT_V1_TEXT,
    validate: validateResearchContract
  }
};

export function getOutputSchema(name) {
  const entry = REGISTRY[name];
  if (!entry) {
    throw new Error(`unknown output schema: ${name}`);
  }
  return entry;
}

export function validateOutput(name, output) {
  return getOutputSchema(name).validate(output);
}
