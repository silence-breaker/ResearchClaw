import type { ContractCriterion } from "../api/types";

// Secondary line for a criterion: "metric · threshold", gracefully dropping
// whichever part is absent. Empty string when the criterion carries neither.
export function criterionMeta(c: ContractCriterion): string {
  return [c.metric, c.threshold].filter(Boolean).join(" · ");
}
