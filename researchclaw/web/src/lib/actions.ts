import type { PendingAction, ResearchPhase } from "../api/types";

// Chinese phase labels for action buttons (kept local to the action layer; the
// left column keeps its own copy for the status chip).
const PHASE_LABEL: Partial<Record<ResearchPhase, string>> = {
  literature_scouting: "文献侦察",
  baseline_selection: "基线选择",
  baseline_reproduction_checklist: "复现清单",
  idea_generation: "想法生成",
  idea_review: "想法评审",
  summary: "总结"
};

function phaseLabel(phase: ResearchPhase): string {
  return PHASE_LABEL[phase] ?? phase;
}

// A panel-facing description of a human action. The UI renders each kind as a
// button (approve/revise/advance/recover) or as display-only text (note).
export type PanelAction =
  | { kind: "approve"; label: string; artifactId?: string; artifactRef?: string }
  | { kind: "revise"; label: string; artifactId?: string; artifactRef?: string }
  | { kind: "advance"; label: string; phase: ResearchPhase }
  | { kind: "recover"; label: string; to?: ResearchPhase; errors: string[] }
  | { kind: "note"; label: string };

// Translates the engine's pending_human_actions into panel buttons. One
// approve_or_revise entry becomes two buttons; unknown types are dropped.
export function deriveActions(pending: PendingAction[]): PanelAction[] {
  const actions: PanelAction[] = [];
  for (const p of pending) {
    switch (p.type) {
      case "approve_or_revise": {
        const artifactId = (p as { artifact_id?: string }).artifact_id;
        const artifactRef = (p as { artifact_ref?: string }).artifact_ref;
        actions.push({ kind: "approve", label: "批准契约", artifactId, artifactRef });
        actions.push({ kind: "revise", label: "要求修订", artifactId, artifactRef });
        break;
      }
      case "run_phase": {
        const phase = (p as { phase: ResearchPhase }).phase;
        actions.push({ kind: "advance", label: `推进：${phaseLabel(phase)}`, phase });
        break;
      }
      case "revise_required": {
        const to = (p as { retreat_to?: ResearchPhase }).retreat_to;
        const errors = (p as { errors?: string[] }).errors ?? [];
        const label = to ? `回退到「${phaseLabel(to)}」重跑` : "需要人工修订";
        actions.push({ kind: "recover", label, to, errors });
        break;
      }
      case "next_human_action": {
        actions.push({ kind: "note", label: (p as { description: string }).description });
        break;
      }
      default:
        // provide_research_direction / unknown engine actions: not part of M1.3.
        break;
    }
  }
  return actions;
}
