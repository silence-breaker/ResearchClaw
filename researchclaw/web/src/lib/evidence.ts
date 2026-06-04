import type { EvidenceIndexEntry } from "../api/types";

export interface Coverage {
  satisfied: number;
  total: number;
  percent: number | null;
}

// Evidence coverage = satisfied evidence items / all required evidence items,
// summed across every claim. Returns percent: null when there is nothing to
// measure (no claims yet). Mirrors §7 of the M1 frontend route doc.
export function evidenceCoverage(index: EvidenceIndexEntry[]): Coverage {
  let satisfied = 0;
  let total = 0;
  for (const entry of index) {
    satisfied += entry.satisfied.length;
    total += entry.satisfied.length + entry.pending.length;
  }
  return {
    satisfied,
    total,
    percent: total === 0 ? null : Math.round((satisfied / total) * 100)
  };
}

export type ClaimStatus = "satisfied" | "partial" | "gap";

// A claim is satisfied when nothing is pending, a gap when nothing is satisfied,
// and partial in between — drives the highlight in the evidence map tab.
export function claimStatus(entry: EvidenceIndexEntry): ClaimStatus {
  if (entry.pending.length === 0) {
    return "satisfied";
  }
  if (entry.satisfied.length === 0) {
    return "gap";
  }
  return "partial";
}
