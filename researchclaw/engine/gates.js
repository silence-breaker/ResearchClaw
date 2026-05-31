import { validateResearchContract } from "../contract/schema.js";

export function contractGate(contract) {
  return validateResearchContract(contract);
}

export function literatureGate(paperCards, { minimum = 3 } = {}) {
  const errors = [];
  if (!Array.isArray(paperCards) || paperCards.length < minimum) {
    errors.push(`paper_cards must contain at least ${minimum} items`);
  }
  for (const [index, card] of (paperCards || []).entries()) {
    if (!card.id) errors.push(`paper_cards[${index}].id is required`);
    if (!card.title) errors.push(`paper_cards[${index}].title is required`);
    if (!card.why_relevant) errors.push(`paper_cards[${index}].why_relevant is required`);
  }
  return { ok: errors.length === 0, errors };
}

export function baselineGate(decision) {
  const errors = [];
  if (!decision || typeof decision !== "object") {
    return { ok: false, errors: ["baseline decision must be an object"] };
  }
  if (!Array.isArray(decision.candidates) || decision.candidates.length < 2) {
    errors.push("baseline candidates must contain at least 2 items");
  }
  if (!decision.selected?.paper_id) {
    errors.push("selected.paper_id is required");
  }
  if (!decision.selected?.name) {
    errors.push("selected.name is required");
  }
  if (!decision.selected?.code_url && !decision.selected?.reason) {
    errors.push("selected baseline must include code_url or a clear reproducibility reason");
  }
  for (const [index, candidate] of (decision.candidates || []).entries()) {
    if (!candidate.reproducibility_risk) {
      errors.push(`candidates[${index}].reproducibility_risk is required`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function reproductionChecklistGate(checklist) {
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
    if (!Array.isArray(checklist?.[field]) || checklist[field].length === 0) {
      errors.push(`${field} must be non-empty`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function reviewGate(report, ideaCards = []) {
  const errors = [];
  const requiredScoreKeys = [
    "novelty",
    "feasibility",
    "reproducibility",
    "baseline_compatibility",
    "experiment_design",
    "evidence_consistency"
  ];
  if (!Array.isArray(report?.reviews) || report.reviews.length === 0) {
    errors.push("reviews must be non-empty");
  }
  for (const idea of ideaCards) {
    const review = report.reviews?.find((item) => item.idea_id === idea.id);
    if (!review) {
      errors.push(`missing review for idea ${idea.id}`);
      continue;
    }
    if (!["go", "revise", "kill"].includes(review.decision)) {
      errors.push(`idea ${idea.id} must have go, revise, or kill decision`);
    }
    for (const key of requiredScoreKeys) {
      if (typeof review.scores?.[key] !== "number") {
        errors.push(`idea ${idea.id} missing score ${key}`);
      }
    }
  }
  const hasViableIdea = (report?.reviews || []).some((review) => ["go", "revise"].includes(review.decision));
  if (!hasViableIdea) {
    errors.push("at least one idea must be go or revise");
  }
  return { ok: errors.length === 0, errors };
}

export function evidenceGate(state) {
  const errors = [];
  for (const [key, label] of [
    ["contract_artifact_ref", "contract"],
    ["literature_artifact_ref", "literature"],
    ["baseline_artifact_ref", "baseline"],
    ["checklist_artifact_ref", "reproduction checklist"],
    ["idea_artifact_ref", "idea cards"],
    ["review_artifact_ref", "idea review"]
  ]) {
    if (!state.current?.[key]) {
      errors.push(`${label} artifact is missing`);
    }
  }
  if (!Array.isArray(state.signals) || state.signals.length === 0) {
    errors.push("raw OpenClaw payload signal history is missing");
  }
  if (!Array.isArray(state.contract_versions) || state.contract_versions.length === 0) {
    errors.push("contract version history is missing");
  }
  return { ok: errors.length === 0, errors };
}
