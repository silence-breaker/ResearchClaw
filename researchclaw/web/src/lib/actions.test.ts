import { describe, expect, it, test } from "vitest";
import { deriveActions } from "./actions";
import type { PendingAction } from "../api/types";

function advanceOf(pending: PendingAction[]) {
  return deriveActions(pending).find((a) => a.kind === "advance");
}

describe("deriveActions — run_phase commands passthrough", () => {
  it("carries commands onto the advance action", () => {
    const pending: PendingAction[] = [
      { type: "run_phase", phase: "experiment_execution", label: "确认并执行实验命令", commands: ["node -e \"1\"", "ls"] }
    ];
    const advance = advanceOf(pending);
    expect(advance?.commands).toEqual(["node -e \"1\"", "ls"]);
  });

  it("leaves commands undefined when the run_phase has none", () => {
    const pending: PendingAction[] = [
      { type: "run_phase", phase: "idea_review", label: "Run idea review" }
    ];
    const advance = advanceOf(pending);
    expect(advance?.commands).toBeUndefined();
  });
});

describe("deriveActions", () => {
  test("approve_or_revise yields an approve and a revise action carrying artifact ids", () => {
    const pending: PendingAction[] = [
      {
        type: "approve_or_revise",
        target: "contract",
        artifact_id: "artifact_x",
        artifact_ref: "artifacts/contract_review/x.json",
        label: "Approve or revise contract"
      }
    ];
    const actions = deriveActions(pending);
    expect(actions.map((a) => a.kind)).toEqual(["approve", "revise"]);
    const approve = actions[0];
    expect(approve).toMatchObject({
      kind: "approve",
      artifactId: "artifact_x",
      artifactRef: "artifacts/contract_review/x.json"
    });
    expect(actions[1]).toMatchObject({ kind: "revise", artifactId: "artifact_x" });
  });

  test("run_phase yields a single advance action labelled with the Chinese phase name", () => {
    const pending: PendingAction[] = [
      { type: "run_phase", phase: "literature_scouting", label: "Run literature scouting" }
    ];
    const actions = deriveActions(pending);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "advance", phase: "literature_scouting" });
    expect(actions[0].label).toContain("文献侦察");
  });

  test("revise_required yields a recover action carrying retreat target and errors", () => {
    const pending: PendingAction[] = [
      {
        type: "revise_required",
        phase: "baseline_selection",
        retreat_to: "literature_scouting",
        errors: ["no open-source baseline found"],
        label: "Fix and re-run from literature_scouting"
      }
    ];
    const actions = deriveActions(pending);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: "recover",
      to: "literature_scouting",
      errors: ["no open-source baseline found"]
    });
  });

  test("provide_research_direction yields a provide_direction action (unsticks intake)", () => {
    const pending: PendingAction[] = [
      { type: "provide_research_direction", target: "intake", label: "Enter research direction" }
    ];
    const actions = deriveActions(pending);
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe("provide_direction");
  });

  test("next_human_action yields a display-only note with the description as label", () => {
    const pending: PendingAction[] = [
      { type: "next_human_action", description: "Confirm baseline dataset license." }
    ];
    const actions = deriveActions(pending);
    expect(actions).toEqual([{ kind: "note", label: "Confirm baseline dataset license." }]);
  });

  test("preserves order across multiple pending actions and ignores unknown types", () => {
    const pending: PendingAction[] = [
      { type: "run_phase", phase: "summary", label: "Write summary" },
      { type: "mystery_type", foo: 1 }
    ];
    const actions = deriveActions(pending);
    expect(actions.map((a) => a.kind)).toEqual(["advance"]);
  });

  test("phase_running yields a display-only running indicator", () => {
    const pending: PendingAction[] = [
      { type: "phase_running", phase: "contract_draft", label: "Claude 起草研究契约中…" }
    ];
    const actions = deriveActions(pending);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "running", label: "Claude 起草研究契约中…" });
  });

  test("empty pending yields no actions", () => {
    expect(deriveActions([])).toEqual([]);
  });
});
