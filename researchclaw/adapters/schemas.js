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

// --- structured artifact schemas for the middle pipeline phases ---
// These validators are deliberately STRUCTURAL only: they check the payload is
// the right kind of object/array and carries the identifying fields downstream
// code reads. Policy checks (minimum counts, cross-artifact reference matching,
// contract-metric coverage) stay in engine/gates.js, which fails HONESTLY
// (blocks/retreats the phase) rather than degrading to mock. Keeping the schema
// lenient means a real CLI result is not silently replaced by a mock fixture
// over a policy shortfall — the gate reports the real reason instead.

function isStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0;
}

// PaperCard[] (literature_scouting) — mirrors literatureGate's per-card checks.
export function validatePaperCards(output) {
  if (!isNonEmptyArray(output)) {
    return { ok: false, errors: ["paper_cards must be a non-empty array"] };
  }
  const errors = [];
  for (const [index, card] of output.entries()) {
    if (!card || typeof card !== "object") {
      errors.push(`paper_cards[${index}] must be an object`);
      continue;
    }
    if (!isStr(card.id)) errors.push(`paper_cards[${index}].id is required`);
    if (!isStr(card.title)) errors.push(`paper_cards[${index}].title is required`);
    if (!isStr(card.why_relevant)) errors.push(`paper_cards[${index}].why_relevant is required`);
  }
  return { ok: errors.length === 0, errors };
}

// BaselineDecision (baseline_selection) — mirrors baselineGate's structural core.
export function validateBaselineDecision(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, errors: ["baseline decision must be an object"] };
  }
  const errors = [];
  if (!isStr(output.selected?.paper_id)) errors.push("selected.paper_id is required");
  if (!isStr(output.selected?.name)) errors.push("selected.name is required");
  if (!isNonEmptyArray(output.candidates)) {
    errors.push("candidates must be a non-empty array");
  } else {
    for (const [index, candidate] of output.candidates.entries()) {
      if (!candidate || typeof candidate !== "object") {
        errors.push(`candidates[${index}] must be an object`);
        continue;
      }
      if (!isStr(candidate.paper_id)) errors.push(`candidates[${index}].paper_id is required`);
      if (!isStr(candidate.reproducibility_risk)) errors.push(`candidates[${index}].reproducibility_risk is required`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// ReproductionChecklist (baseline_reproduction_checklist) — the seven list
// fields reproductionChecklistGate requires non-empty. The executable-command
// and contract-metric coverage checks stay in the gate.
export function validateReproductionChecklist(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, errors: ["reproduction checklist must be an object"] };
  }
  const errors = [];
  for (const field of [
    "environment",
    "data_requirements",
    "commands",
    "expected_metrics",
    "failure_alerts",
    "fingerprint_checks",
    "human_preparation_needed"
  ]) {
    if (!isNonEmptyArray(output[field])) errors.push(`${field} must be a non-empty array`);
  }
  return { ok: errors.length === 0, errors };
}

// IdeaCard[] (idea_generation) — mirrors ideaGate's per-card checks.
export function validateIdeaCards(output) {
  if (!isNonEmptyArray(output)) {
    return { ok: false, errors: ["idea_cards must be a non-empty array"] };
  }
  const errors = [];
  for (const [index, idea] of output.entries()) {
    if (!idea || typeof idea !== "object") {
      errors.push(`idea_cards[${index}] must be an object`);
      continue;
    }
    if (!isStr(idea.id)) errors.push(`idea_cards[${index}].id is required`);
    if (!isStr(idea.title)) errors.push(`idea_cards[${index}].title is required`);
    if (!isStr(idea.baseline_compatibility)) errors.push(`idea_cards[${index}].baseline_compatibility is required`);
    if (!isNonEmptyArray(idea.evidence_refs)) errors.push(`idea_cards[${index}].evidence_refs must be non-empty`);
  }
  return { ok: errors.length === 0, errors };
}

// IdeaReviewReport (idea_review) — mirrors reviewGate's structural core. The
// per-idea coverage / ranking-completeness cross-checks stay in the gate.
const REVIEW_SCORE_KEYS = [
  "novelty",
  "feasibility",
  "reproducibility",
  "baseline_compatibility",
  "experiment_design",
  "evidence_consistency"
];
export function validateIdeaReviewReport(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, errors: ["idea review report must be an object"] };
  }
  const errors = [];
  if (!isNonEmptyArray(output.reviews)) {
    errors.push("reviews must be a non-empty array");
  } else {
    for (const [index, review] of output.reviews.entries()) {
      if (!review || typeof review !== "object") {
        errors.push(`reviews[${index}] must be an object`);
        continue;
      }
      if (!isStr(review.idea_id)) errors.push(`reviews[${index}].idea_id is required`);
      if (!["go", "revise", "kill"].includes(review.decision)) {
        errors.push(`reviews[${index}].decision must be go|revise|kill`);
      }
      for (const key of REVIEW_SCORE_KEYS) {
        if (typeof review.scores?.[key] !== "number") {
          errors.push(`reviews[${index}].scores.${key} must be a number`);
        }
      }
    }
  }
  if (!isNonEmptyArray(output.ranking)) errors.push("ranking must be a non-empty array");
  if (!isStr(output.recommended_idea_id)) errors.push("recommended_idea_id is required");
  return { ok: errors.length === 0, errors };
}

// DemoSummary (summary) — the orchestrator maps next_human_actions directly, so
// it must be a non-empty array; everything else is evidence the summary carries.
export function validateDemoSummary(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, errors: ["demo summary must be an object"] };
  }
  const errors = [];
  if (!isNonEmptyArray(output.next_human_actions)) {
    errors.push("next_human_actions must be a non-empty array");
  }
  return { ok: errors.length === 0, errors };
}

const PAPER_CARD_ARRAY_TEXT = `PaperCard[] — write a single JSON ARRAY (at least 3 items) of paper cards:
[{
  "id": string (stable slug),
  "title": string,
  "venue"?: string, "year"?: integer, "url"?: string, "code_url"?: string,
  "relevance": "high"|"medium"|"low",
  "why_relevant": string (why this paper matters for the contract),
  "baseline_potential": "strong"|"possible"|"weak",
  "notes"?: [string]
}]
id, title, why_relevant are required on every card. Output ONLY the JSON array into ./out.json.`;

const BASELINE_DECISION_TEXT = `BaselineDecision — write a single JSON object:
{
  "selected": { "paper_id": string (matches a scouted paper card id or a candidate), "name": string, "code_url"?: string, "reason": string },
  "candidates": [{ "paper_id": string, "name": string, "pros": [string], "cons": [string], "reproducibility_risk": "low"|"medium"|"high" }] (at least 2),
  "rejected"?: [{ "paper_id": string, "reason": string }]
}
Output ONLY this JSON object into ./out.json.`;

const REPRODUCTION_CHECKLIST_TEXT = `ReproductionChecklist — write a single JSON object with these non-empty array fields:
{
  "baseline_name": string, "repository"?: string,
  "environment": [string], "data_requirements": [string],
  "commands": [string] (at least one runnable command),
  "expected_metrics": [string] (must reference at least one contract metric by name),
  "progress_signals"?: [string], "failure_alerts": [string],
  "fingerprint_checks": [string], "human_preparation_needed": [string]
}
Output ONLY this JSON object into ./out.json.`;

const IDEA_CARD_ARRAY_TEXT = `IdeaCard[] — write a single JSON ARRAY (at least 3 items) of idea cards:
[{
  "id": string (stable slug), "title": string, "description": string,
  "expected_gain": string, "mechanism": string,
  "baseline_compatibility": string (how it reuses the selected baseline),
  "required_changes": [string], "risks": [string],
  "evidence_refs": [string] (non-empty; cite paper card ids / contract id)
}]
id, title, baseline_compatibility, evidence_refs are required on every card. Output ONLY the JSON array into ./out.json.`;

const IDEA_REVIEW_REPORT_TEXT = `IdeaReviewReport — write a single JSON object:
{
  "reviews": [{ "idea_id": string, "scores": { "novelty": int, "feasibility": int, "reproducibility": int, "baseline_compatibility": int, "experiment_design": int, "evidence_consistency": int }, "decision": "go"|"revise"|"kill", "rationale": string, "required_revisions"?: [string] }] (one per idea card),
  "ranking": [string] (idea ids, best first, includes every idea),
  "recommended_idea_id": string (a go/revise idea that appears in ranking)
}
At least one idea must be go or revise. Output ONLY this JSON object into ./out.json.`;

const DEMO_SUMMARY_TEXT = `DemoSummary — write a single JSON object summarizing only claims backed by stored artifact refs:
{
  "project_id": string,
  "contract_ref"?: string, "selected_baseline_ref"?: string, "recommended_idea_ref"?: string,
  "phase_history"?: [object], "evidence_index"?: [object],
  "next_human_actions": [string] (non-empty)
}
Output ONLY this JSON object into ./out.json.`;

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
  },
  "PaperCard[]": {
    jsonSchema: PAPER_CARD_ARRAY_TEXT,
    validate: validatePaperCards
  },
  BaselineDecision: {
    jsonSchema: BASELINE_DECISION_TEXT,
    validate: validateBaselineDecision
  },
  ReproductionChecklist: {
    jsonSchema: REPRODUCTION_CHECKLIST_TEXT,
    validate: validateReproductionChecklist
  },
  "IdeaCard[]": {
    jsonSchema: IDEA_CARD_ARRAY_TEXT,
    validate: validateIdeaCards
  },
  IdeaReviewReport: {
    jsonSchema: IDEA_REVIEW_REPORT_TEXT,
    validate: validateIdeaReviewReport
  },
  DemoSummary: {
    jsonSchema: DEMO_SUMMARY_TEXT,
    validate: validateDemoSummary
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
