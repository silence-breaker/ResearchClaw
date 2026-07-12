export const researchPhases = [
  "idle",
  "intake",
  "contract_draft",
  "contract_review",
  "literature_scouting",
  "baseline_selection",
  "baseline_reproduction_checklist",
  "idea_generation",
  "idea_review",
  "experiment_planning",
  "experiment_execution",
  "experiment_review",
  "summary",
  "blocked"
];

export function isResearchPhase(value) {
  return researchPhases.includes(value);
}
