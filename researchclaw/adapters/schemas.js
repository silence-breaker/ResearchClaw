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

export function validateExperimentPlan(output) {
  const errors = [];
  if (!output || typeof output !== "object") {
    return { ok: false, errors: ["experiment plan must be an object"] };
  }
  if (!output.idea_ref) errors.push("idea_ref is required");
  if (!Array.isArray(output.commands) || output.commands.length === 0) errors.push("commands must be a non-empty array");
  if (!Array.isArray(output.metrics) || output.metrics.length === 0) errors.push("metrics must be a non-empty array");
  if (!Array.isArray(output.success_criteria) || output.success_criteria.length === 0) errors.push("success_criteria must be non-empty");
  if (!Array.isArray(output.failure_criteria) || output.failure_criteria.length === 0) errors.push("failure_criteria must be non-empty");
  return { ok: errors.length === 0, errors };
}

export function validateExperimentReview(output) {
  const errors = [];
  if (!output || typeof output !== "object") {
    return { ok: false, errors: ["experiment review must be an object"] };
  }
  if (!output.run_ref) errors.push("run_ref is required");
  if (!Array.isArray(output.claim_support) || output.claim_support.length === 0) errors.push("claim_support must be non-empty");
  if (!output.decision) errors.push("decision is required");
  return { ok: errors.length === 0, errors };
}

const EXPERIMENT_PLAN_V1_TEXT = `ExperimentPlanV1 — write a single JSON object with these fields:
{
  "hypothesis": string,
  "idea_ref": string (the recommended idea id),
  "baseline_ref": string,
  "dataset_requirements": [string],
  "environment_requirements": [string],
  "commands": [string] (each an executable shell command run in the project workdir; relative paths only, no sudo/rm -rf/absolute paths),
  "expected_outputs": [string],
  "metrics": [string] (must reference at least one contract metric),
  "success_criteria": [string],
  "failure_criteria": [string],
  "risks": [string]
}
All array fields must be non-empty. Output ONLY this JSON object into ./out.json.`;

const EXPERIMENT_REVIEW_V1_TEXT = `ExperimentReviewV1 — write a single JSON object with these fields:
{
  "run_ref": string,
  "claim_support": [{ "claim_id": string, "metric_ref": string, "support_type": "supports"|"does_not_support"|"inconclusive", "rationale": string, "evidence_excerpt": string }],
  "decision": "accept_idea"|"revise_idea"|"reject_idea"|"rerun_experiment",
  "next_actions": [string]
}
claim_support and next_actions must be non-empty. Output ONLY this JSON object into ./out.json.`;

// output_schema name -> validator + prompt-embeddable schema text.
const REGISTRY = {
  ResearchContractV1: {
    jsonSchema: RESEARCH_CONTRACT_V1_TEXT,
    validate: validateResearchContract
  },
  ExperimentPlanV1: {
    jsonSchema: EXPERIMENT_PLAN_V1_TEXT,
    validate: validateExperimentPlan
  },
  ExperimentReviewV1: {
    jsonSchema: EXPERIMENT_REVIEW_V1_TEXT,
    validate: validateExperimentReview
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
