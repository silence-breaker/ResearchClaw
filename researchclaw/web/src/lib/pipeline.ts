import type { ProjectState, ResearchPhase } from "../api/types";

export interface PipelineNode {
  id: string;
  label: string;
  // underlying engine phases this node represents
  phases: ResearchPhase[];
  // the phase whose `pass` in phase_history means this node is complete
  done: ResearchPhase;
}

// The in-scope pipeline phases shown as nodes, including the three experiment
// phases (M5b). 深度调研 remains reserved in the enum but is out of scope here.
export const PIPELINE: PipelineNode[] = [
  { id: "contract", label: "研究契约", phases: ["intake", "contract_draft", "contract_review"], done: "contract_review" },
  { id: "literature_scouting", label: "文献侦察", phases: ["literature_scouting"], done: "literature_scouting" },
  { id: "baseline_selection", label: "基线选择", phases: ["baseline_selection"], done: "baseline_selection" },
  {
    id: "baseline_reproduction_checklist",
    label: "复现清单",
    phases: ["baseline_reproduction_checklist"],
    done: "baseline_reproduction_checklist"
  },
  { id: "idea_generation", label: "想法生成", phases: ["idea_generation"], done: "idea_generation" },
  { id: "idea_review", label: "想法评审", phases: ["idea_review"], done: "idea_review" },
  { id: "experiment_planning", label: "实验规划", phases: ["experiment_planning"], done: "experiment_planning" },
  { id: "experiment_execution", label: "实验执行", phases: ["experiment_execution"], done: "experiment_execution" },
  { id: "experiment_review", label: "实验复核", phases: ["experiment_review"], done: "experiment_review" },
  { id: "summary", label: "总结", phases: ["summary"], done: "summary" }
];

export type NodeStatus = "done" | "active" | "blocked" | "pending";

export function phasePassed(state: ProjectState, phase: ResearchPhase): boolean {
  return (state.phase_history ?? []).some((entry) => entry.phase === phase && entry.gate_result === "pass");
}

export function nodeStatus(state: ProjectState, node: PipelineNode): NodeStatus {
  if (phasePassed(state, node.done)) {
    return "done";
  }
  if (state.phase === "blocked" && state.block && node.phases.includes(state.block.failed_phase)) {
    return "blocked";
  }
  if (node.phases.includes(state.phase)) {
    return "active";
  }
  return "pending";
}

export function overallProgress(state: ProjectState): number {
  const done = PIPELINE.filter((node) => phasePassed(state, node.done)).length;
  return Math.round((done / PIPELINE.length) * 100);
}

export function gatePassRate(state: ProjectState): number | null {
  const evaluated = (state.phase_history ?? []).filter(
    (entry) => entry.gate_result === "pass" || entry.gate_result === "fail"
  );
  if (evaluated.length === 0) {
    return null;
  }
  const pass = evaluated.filter((entry) => entry.gate_result === "pass").length;
  return Math.round((pass / evaluated.length) * 100);
}

const STRUCTURED_REF_KEYS = [
  "contract_artifact_ref",
  "literature_artifact_ref",
  "baseline_artifact_ref",
  "checklist_artifact_ref",
  "idea_artifact_ref",
  "review_artifact_ref",
  "experiment_plan_artifact_ref",
  "experiment_run_artifact_ref",
  "experiment_review_artifact_ref",
  "summary_artifact_ref"
] as const;

export function artifactCount(state: ProjectState): number {
  return STRUCTURED_REF_KEYS.filter((key) => state.current?.[key]).length;
}
