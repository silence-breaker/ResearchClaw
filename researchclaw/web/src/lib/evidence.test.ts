import { describe, expect, test } from "vitest";
import type { EvidenceIndexEntry } from "../api/types";
import { claimStatus, evidenceCoverage } from "./evidence";

const satisfiedOnly: EvidenceIndexEntry = {
  claim_id: "C2",
  claim: "Literature supports the direction.",
  satisfied: [{ evidence: "literature survey", artifact_ref: "artifacts/literature_scouting/l.json" }],
  pending: []
};

const gapOnly: EvidenceIndexEntry = {
  claim_id: "C1",
  claim: "Reranker improves quality.",
  satisfied: [],
  pending: [{ evidence: "baseline result", reason: "out of demo scope (experiment)" }]
};

const partial: EvidenceIndexEntry = {
  claim_id: "C3",
  claim: "Baseline chosen and reproduced.",
  satisfied: [{ evidence: "selected baseline", artifact_ref: "artifacts/baseline_selection/b.json" }],
  pending: [{ evidence: "reproduction checklist", reason: "awaiting baseline_reproduction_checklist" }]
};

describe("evidenceCoverage", () => {
  test("returns null percent for an empty index", () => {
    expect(evidenceCoverage([])).toEqual({ satisfied: 0, total: 0, percent: null });
  });

  test("counts satisfied vs total evidence items across claims", () => {
    // 2 satisfied / (2 satisfied + 2 pending) = 50%
    const result = evidenceCoverage([satisfiedOnly, gapOnly, partial]);
    expect(result.satisfied).toBe(2);
    expect(result.total).toBe(4);
    expect(result.percent).toBe(50);
  });

  test("is 100% when every required evidence item is satisfied", () => {
    expect(evidenceCoverage([satisfiedOnly]).percent).toBe(100);
  });

  test("is 0% when nothing is satisfied", () => {
    expect(evidenceCoverage([gapOnly]).percent).toBe(0);
  });
});

describe("claimStatus", () => {
  test("satisfied when there are no pending items", () => {
    expect(claimStatus(satisfiedOnly)).toBe("satisfied");
  });

  test("gap when nothing is satisfied", () => {
    expect(claimStatus(gapOnly)).toBe("gap");
  });

  test("partial when some satisfied and some pending", () => {
    expect(claimStatus(partial)).toBe("partial");
  });
});
