import { describe, expect, test } from "vitest";
import type { ProjectState } from "../api/types";
import { PIPELINE, nodeStatus, overallProgress, gatePassRate, artifactCount } from "./pipeline";

function baseState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    state_version: 1,
    project_id: "proj_test",
    phase: "idle",
    created_at: "2026-06-02T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
    current: {},
    pending_human_actions: [],
    phase_history: [],
    signals: [],
    contract_versions: [],
    ...overrides
  };
}

function pass(phase: ProjectState["phase"]) {
  return { phase, artifact_refs: ["ref"], gate_result: "pass" as const, timestamp: "t" };
}

describe("PIPELINE", () => {
  test("covers the seven in-scope demo phases", () => {
    expect(PIPELINE.map((n) => n.id)).toEqual([
      "contract",
      "literature_scouting",
      "baseline_selection",
      "baseline_reproduction_checklist",
      "idea_generation",
      "idea_review",
      "summary"
    ]);
  });
});

describe("nodeStatus", () => {
  test("a node whose completion phase passed is done", () => {
    const state = baseState({ phase: "literature_scouting", phase_history: [pass("contract_review")] });
    const contractNode = PIPELINE.find((n) => n.id === "contract")!;
    expect(nodeStatus(state, contractNode)).toBe("done");
  });

  test("the node matching the current phase is active", () => {
    const state = baseState({ phase: "literature_scouting", phase_history: [pass("contract_review")] });
    const litNode = PIPELINE.find((n) => n.id === "literature_scouting")!;
    expect(nodeStatus(state, litNode)).toBe("active");
  });

  test("a later node is pending", () => {
    const state = baseState({ phase: "literature_scouting", phase_history: [pass("contract_review")] });
    const summaryNode = PIPELINE.find((n) => n.id === "summary")!;
    expect(nodeStatus(state, summaryNode)).toBe("pending");
  });

  test("the failed phase's node shows blocked", () => {
    const state = baseState({
      phase: "blocked",
      phase_history: [pass("contract_review"), pass("literature_scouting")],
      block: { failed_phase: "baseline_selection", retreat_to: "literature_scouting", errors: ["x"] }
    });
    const baselineNode = PIPELINE.find((n) => n.id === "baseline_selection")!;
    expect(nodeStatus(state, baselineNode)).toBe("blocked");
  });
});

describe("overallProgress", () => {
  test("is 0 with no passed phases", () => {
    expect(overallProgress(baseState())).toBe(0);
  });

  test("counts done pipeline nodes over total", () => {
    // contract + literature done out of 7 -> 29%
    const state = baseState({ phase_history: [pass("contract_review"), pass("literature_scouting")] });
    expect(overallProgress(state)).toBe(29);
  });

  test("is 100 when all seven nodes are done", () => {
    const state = baseState({
      phase_history: [
        pass("contract_review"),
        pass("literature_scouting"),
        pass("baseline_selection"),
        pass("baseline_reproduction_checklist"),
        pass("idea_generation"),
        pass("idea_review"),
        pass("summary")
      ]
    });
    expect(overallProgress(state)).toBe(100);
  });
});

describe("gatePassRate", () => {
  test("returns null when nothing was gate-evaluated", () => {
    const state = baseState({ phase_history: [{ phase: "intake", artifact_refs: [], gate_result: "manual", timestamp: "t" }] });
    expect(gatePassRate(state)).toBeNull();
  });

  test("ignores manual entries and computes pass/(pass+fail)", () => {
    const state = baseState({
      phase_history: [
        pass("contract_review"),
        pass("literature_scouting"),
        { phase: "baseline_selection", artifact_refs: [], gate_result: "fail", timestamp: "t" },
        { phase: "contract_review", artifact_refs: [], gate_result: "manual", timestamp: "t" }
      ]
    });
    expect(gatePassRate(state)).toBe(67); // 2 pass / 3 evaluated
  });
});

describe("artifactCount", () => {
  test("counts committed structured artifacts in state.current", () => {
    const state = baseState({
      current: {
        contract_artifact_ref: "a",
        literature_artifact_ref: "b",
        baseline_artifact_ref: "c",
        raw_log_artifact_refs: ["r1", "r2"]
      }
    });
    // 3 structured refs; raw logs are not "结论" artifacts and are excluded
    expect(artifactCount(state)).toBe(3);
  });
});
