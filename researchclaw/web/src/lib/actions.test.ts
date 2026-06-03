import { describe, expect, test } from "vitest";
import { deriveActions } from "./actions";
import type { PendingAction } from "../api/types";

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

  test("empty pending yields no actions", () => {
    expect(deriveActions([])).toEqual([]);
  });
});
