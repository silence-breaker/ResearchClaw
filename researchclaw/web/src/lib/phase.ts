import type { ProjectCurrent, ResearchPhase } from "../api/types";

export const PHASE_LABEL: Partial<Record<ResearchPhase, string>> = {
  idle: "空闲 / 已完成",
  intake: "接收中",
  contract_draft: "起草契约",
  contract_review: "契约待审",
  literature_scouting: "文献侦察",
  baseline_selection: "基线选择",
  baseline_reproduction_checklist: "复现清单",
  idea_generation: "想法生成",
  idea_review: "想法评审",
  experiment_planning: "实验规划",
  experiment_execution: "实验执行",
  experiment_review: "实验复核",
  summary: "总结",
  blocked: "需修订"
};

export const PHASE_TASKS: Partial<Record<ResearchPhase, string[]>> = {
  intake: ["接收研究方向", "生成 intake artifact", "进入契约起草"],
  contract_draft: ["起草研究契约", "落地结构化 contract", "等待契约审阅"],
  contract_review: ["审阅研究契约", "批准或打回修订"],
  literature_scouting: ["侦察相关文献", "产出 paper cards", "更新证据映射"],
  baseline_selection: ["比较候选基线", "记录 baseline decision"],
  baseline_reproduction_checklist: ["拆解复现步骤", "形成 reproduction checklist"],
  idea_generation: ["生成研究想法", "产出 idea cards"],
  idea_review: ["评审想法", "形成 review report"],
  experiment_planning: ["产出可执行实验计划", "对齐指标与判据"],
  experiment_execution: ["确认并执行实验命令", "记录运行结果与产物"],
  experiment_review: ["判断实验是否支持各 claim", "给出实验决策"],
  summary: ["汇总研究路线", "产出 summary artifact"],
  blocked: ["查看失败原因", "选择回退阶段", "重新运行阶段"]
};

type ArtifactKey = keyof Pick<
  ProjectCurrent,
  | "intake_artifact_ref"
  | "contract_artifact_ref"
  | "literature_artifact_ref"
  | "baseline_artifact_ref"
  | "checklist_artifact_ref"
  | "idea_artifact_ref"
  | "review_artifact_ref"
  | "experiment_plan_artifact_ref"
  | "experiment_run_artifact_ref"
  | "experiment_review_artifact_ref"
  | "summary_artifact_ref"
>;

const PHASE_ARTIFACT_KEY: Partial<Record<ResearchPhase, ArtifactKey>> = {
  intake: "intake_artifact_ref",
  contract_draft: "contract_artifact_ref",
  contract_review: "contract_artifact_ref",
  literature_scouting: "literature_artifact_ref",
  baseline_selection: "baseline_artifact_ref",
  baseline_reproduction_checklist: "checklist_artifact_ref",
  idea_generation: "idea_artifact_ref",
  idea_review: "review_artifact_ref",
  experiment_planning: "experiment_plan_artifact_ref",
  experiment_execution: "experiment_run_artifact_ref",
  experiment_review: "experiment_review_artifact_ref",
  summary: "summary_artifact_ref",
  idle: "summary_artifact_ref"
};

export function phaseLabel(phase: ResearchPhase): string {
  return PHASE_LABEL[phase] ?? phase;
}

export function currentPhaseTasks(phase: ResearchPhase, actionLabels: string[]): string[] {
  if (actionLabels.length > 0) return actionLabels;
  return PHASE_TASKS[phase] ?? ["等待阶段产物或下一步人工动作"];
}

export function currentArtifactRef(current: ProjectCurrent, phase: ResearchPhase): string | undefined {
  const key = PHASE_ARTIFACT_KEY[phase];
  return key ? current[key] : undefined;
}
