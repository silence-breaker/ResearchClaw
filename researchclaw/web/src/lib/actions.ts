import type { PendingAction, ResearchPhase } from "../api/types";

// Chinese phase labels for action buttons (kept local to the action layer; the
// left column keeps its own copy for the status chip).
const PHASE_LABEL: Partial<Record<ResearchPhase, string>> = {
  literature_scouting: "文献侦察",
  baseline_selection: "基线选择",
  baseline_reproduction_checklist: "复现清单",
  idea_generation: "想法生成",
  idea_review: "想法评审",
  experiment_planning: "实验规划",
  experiment_execution: "实验执行",
  experiment_review: "实验复核",
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
  | { kind: "advance"; label: string; phase: ResearchPhase; commands?: string[] }
  | { kind: "recover"; label: string; to?: ResearchPhase; errors: string[] }
  | { kind: "provide_direction"; label: string }
  | { kind: "running"; label: string }
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
        const commands = (p as { commands?: string[] }).commands;
        actions.push({
          kind: "advance",
          label: `推进：${phaseLabel(phase)}`,
          phase,
          commands: Array.isArray(commands) ? commands : undefined
        });
        break;
      }
      case "revise_required": {
        const to = (p as { retreat_to?: ResearchPhase }).retreat_to;
        const errors = (p as { errors?: string[] }).errors ?? [];
        const label = to ? `回退到「${phaseLabel(to)}」重跑` : "需要人工修订";
        actions.push({ kind: "recover", label, to, errors });
        break;
      }
      case "provide_research_direction": {
        // An intake project awaiting its research direction (e.g. created by the
        // OpenClaw hook without a topic). Render an input so the human can supply
        // it and unstick the pipeline.
        actions.push({ kind: "provide_direction", label: "输入研究方向以继续" });
        break;
      }
      case "phase_running": {
        // The engine is running a phase (e.g. Claude drafting the contract) in the
        // background. Render a display-only "running" indicator, not a button.
        actions.push({ kind: "running", label: (p as { label?: string }).label ?? "运行中…" });
        break;
      }
      case "next_human_action": {
        actions.push({ kind: "note", label: (p as { description: string }).description });
        break;
      }
      default:
        // unknown engine actions (hook-triggered misc): dropped.
        break;
    }
  }
  return actions;
}
