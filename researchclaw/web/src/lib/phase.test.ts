import { describe, expect, it } from "vitest";
import { phaseLabel, currentArtifactRef } from "./phase";
import type { ProjectCurrent } from "../api/types";

describe("phaseLabel — experiment phases", () => {
  it("labels experiment_planning", () => {
    expect(phaseLabel("experiment_planning")).toBe("实验规划");
  });
  it("labels experiment_execution", () => {
    expect(phaseLabel("experiment_execution")).toBe("实验执行");
  });
  it("labels experiment_review", () => {
    expect(phaseLabel("experiment_review")).toBe("实验复核");
  });
});

describe("currentArtifactRef — experiment phases", () => {
  const current = {
    experiment_plan_artifact_ref: "artifacts/experiment_planning/plan_1.json",
    experiment_run_artifact_ref: "artifacts/experiment_execution/run_1.json",
    experiment_review_artifact_ref: "artifacts/experiment_review/review_1.json"
  } as ProjectCurrent;

  it("resolves the plan ref for experiment_planning", () => {
    expect(currentArtifactRef(current, "experiment_planning")).toBe(
      "artifacts/experiment_planning/plan_1.json"
    );
  });
  it("resolves the run ref for experiment_execution", () => {
    expect(currentArtifactRef(current, "experiment_execution")).toBe(
      "artifacts/experiment_execution/run_1.json"
    );
  });
  it("resolves the review ref for experiment_review", () => {
    expect(currentArtifactRef(current, "experiment_review")).toBe(
      "artifacts/experiment_review/review_1.json"
    );
  });
});
