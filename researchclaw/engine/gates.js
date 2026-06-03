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

export function ideaGate(ideaCards, { minimum = 3 } = {}) {
  const errors = [];
  if (!Array.isArray(ideaCards) || ideaCards.length < minimum) {
    errors.push(`idea cards must contain at least ${minimum} items`);
  }
  for (const [index, idea] of (ideaCards || []).entries()) {
    if (!idea.id) errors.push(`idea_cards[${index}].id is required`);
    if (!idea.title) errors.push(`idea_cards[${index}].title is required`);
    if (!idea.baseline_compatibility) {
      errors.push(`idea_cards[${index}].baseline_compatibility is required`);
    }
    if (!Array.isArray(idea.evidence_refs) || idea.evidence_refs.length === 0) {
      errors.push(`idea_cards[${index}].evidence_refs must be non-empty`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function baselineGate(decision, { paperCards = [] } = {}) {
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
  if (decision.selected?.paper_id) {
    const knownIds = new Set([
      ...(decision.candidates || []).map((candidate) => candidate.paper_id),
      ...(paperCards || []).map((card) => card.id)
    ]);
    if (!knownIds.has(decision.selected.paper_id)) {
      errors.push("selected.paper_id must match a candidate or a scouted paper card");
    }
  }
  for (const [index, candidate] of (decision.candidates || []).entries()) {
    if (!candidate.reproducibility_risk) {
      errors.push(`candidates[${index}].reproducibility_risk is required`);
    }
  }
  return { ok: errors.length === 0, errors };
}

const KNOWN_SINGLE_COMMANDS = new Set(["make", "build", "test", "install"]);

function looksExecutable(command) {
  if (typeof command !== "string") return false;
  const trimmed = command.trim();
  if (trimmed.length < 3) return false;
  if (/\s/.test(trimmed)) return true; // a verb plus an argument
  if (trimmed.includes("/") || trimmed.includes(".")) return true; // path or script
  return KNOWN_SINGLE_COMMANDS.has(trimmed.toLowerCase());
}

export function reproductionChecklistGate(checklist, { contract } = {}) {
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
  if (Array.isArray(checklist?.commands) && checklist.commands.length > 0) {
    if (!checklist.commands.some(looksExecutable)) {
      errors.push("commands must include at least one executable-looking command");
    }
  }
  const metrics = contract?.metrics;
  if (Array.isArray(metrics) && metrics.length > 0 && Array.isArray(checklist?.expected_metrics)) {
    const covered = metrics.some((metric) =>
      checklist.expected_metrics.some(
        (entry) =>
          typeof entry === "string" &&
          typeof metric?.name === "string" &&
          entry.toLowerCase().includes(metric.name.toLowerCase())
      )
    );
    if (!covered) {
      errors.push("expected_metrics must reference at least one contract metric");
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
  const ranking = Array.isArray(report?.ranking) ? report.ranking : [];
  for (const idea of ideaCards) {
    if (!ranking.includes(idea.id)) {
      errors.push(`ranking must include idea ${idea.id}`);
    }
  }
  if (report?.recommended_idea_id) {
    if (!ranking.includes(report.recommended_idea_id)) {
      errors.push("recommended_idea_id must appear in ranking");
    }
    const recommendedReview = report.reviews?.find((item) => item.idea_id === report.recommended_idea_id);
    if (recommendedReview && recommendedReview.decision === "kill") {
      errors.push("recommended_idea_id must not point to a killed idea");
    }
  }
  return { ok: errors.length === 0, errors };
}

// Maps a required_evidence phrase to the artifact / phase that can satisfy it.
// inScope:false marks evidence that only experiments (out of the v2 demo) can produce.
const evidenceRegistry = [
  { match: /literature|paper|survey|related work/i, artifactType: "paper_cards", phase: "literature_scouting", inScope: true },
  { match: /reproduction|reproduce|checklist/i, artifactType: "reproduction_checklist", phase: "baseline_reproduction_checklist", inScope: true },
  { match: /selected baseline|baseline selection|baseline choice|candidate baseline/i, artifactType: "baseline_decision", phase: "baseline_selection", inScope: true },
  { match: /idea|proposal/i, artifactType: "idea_cards", phase: "idea_generation", inScope: true },
  { match: /review|novelty|feasibility/i, artifactType: "idea_review_report", phase: "idea_review", inScope: true },
  { match: /baseline result|metric table|same-split|comparison|\bresult\b|experiment|ablation/i, artifactType: null, phase: "experiment", inScope: false }
];

export function claimEvidenceGate(contract, { availableArtifacts = [], completedPhases = [] } = {}) {
  const errors = [];
  const evidence_index = [];
  const claims = Array.isArray(contract?.claim_evidence_map) ? contract.claim_evidence_map : [];
  if (claims.length === 0) {
    return { ok: false, errors: ["claim_evidence_map must be non-empty"], evidence_index };
  }
  const typesAvailable = new Map();
  for (const artifact of availableArtifacts) {
    if (!typesAvailable.has(artifact.type)) {
      typesAvailable.set(artifact.type, artifact.ref);
    }
  }
  const completed = new Set(completedPhases);
  for (const claim of claims) {
    const required = Array.isArray(claim.required_evidence) ? claim.required_evidence : [];
    const satisfied = [];
    const pending = [];
    if (required.length === 0) {
      errors.push(`claim ${claim.claim_id} has no required_evidence`);
    }
    for (const evidence of required) {
      const rule = evidenceRegistry.find((entry) => entry.match.test(evidence));
      if (rule && rule.inScope) {
        if (typesAvailable.has(rule.artifactType)) {
          satisfied.push({ evidence, artifact_ref: typesAvailable.get(rule.artifactType) });
        } else if (completed.has(rule.phase)) {
          errors.push(`claim ${claim.claim_id} requires "${evidence}" but ${rule.phase} produced no ${rule.artifactType}`);
          pending.push({ evidence, reason: `missing from completed ${rule.phase}` });
        } else {
          pending.push({ evidence, reason: `awaiting ${rule.phase}` });
        }
      } else if (rule && !rule.inScope) {
        pending.push({ evidence, reason: `out of demo scope (${rule.phase})` });
      } else {
        pending.push({ evidence, reason: "no evidence source mapped" });
      }
    }
    evidence_index.push({ claim_id: claim.claim_id, claim: claim.claim, satisfied, pending });
  }
  return { ok: errors.length === 0, errors, evidence_index };
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
