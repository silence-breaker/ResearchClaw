import { describe, expect, it } from "vitest";
import { shapeExperimentArtifact } from "./experimentArtifact";

describe("shapeExperimentArtifact — experiment_plan", () => {
  it("extracts hypothesis, commands, metrics, criteria", () => {
    const shaped = shapeExperimentArtifact("experiment_plan", {
      hypothesis: "reranking improves recall",
      commands: ["node run.js"],
      metrics: { recall: "top-10" },
      success_criteria: "recall > 0.8",
      failure_criteria: "recall < 0.5"
    });
    expect(shaped.commands).toEqual(["node run.js"]);
    const labels = shaped.fields.map((f) => f.label);
    expect(labels).toContain("hypothesis");
    expect(labels).toContain("success_criteria");
  });
});

describe("shapeExperimentArtifact — experiment_run", () => {
  it("extracts status, per-command exit_code, metrics_observed, failure_reason", () => {
    const shaped = shapeExperimentArtifact("experiment_run", {
      status: "passed",
      commands_executed: [{ command: "node run.js", exit_code: 0 }],
      metrics_observed: { accuracy: 0.9 },
      failure_reason: null,
      produced_files: ["metrics.json"]
    });
    const labels = shaped.fields.map((f) => f.label);
    expect(labels).toContain("status");
    expect(shaped.commands).toEqual(["node run.js"]);
  });
});

describe("shapeExperimentArtifact — experiment_review", () => {
  it("extracts decision, claim_support, run_ref", () => {
    const shaped = shapeExperimentArtifact("experiment_review", {
      decision: "accept_idea",
      run_ref: "artifacts/experiment_execution/run_1.json",
      claim_support: [{ claim_id: "c1", metric_ref: "accuracy", support_type: "supports" }]
    });
    expect(shaped.runRef).toBe("artifacts/experiment_execution/run_1.json");
    expect(shaped.claimSupport?.length).toBe(1);
  });
});

describe("shapeExperimentArtifact — degraded content", () => {
  it("does not throw on missing fields", () => {
    expect(() => shapeExperimentArtifact("experiment_run", {})).not.toThrow();
    const shaped = shapeExperimentArtifact("experiment_run", {});
    expect(Array.isArray(shaped.fields)).toBe(true);
  });
});
