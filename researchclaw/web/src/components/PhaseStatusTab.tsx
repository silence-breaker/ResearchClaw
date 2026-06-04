import type { GateResult, ProjectState, ResearchPhase } from "../api/types";
import { RefChip } from "./RefChip";

const PHASE_LABEL: Partial<Record<ResearchPhase, string>> = {
  intake: "接收",
  contract_draft: "起草契约",
  contract_review: "契约审批",
  literature_scouting: "文献侦察",
  baseline_selection: "基线选择",
  baseline_reproduction_checklist: "复现清单",
  idea_generation: "想法生成",
  idea_review: "想法评审",
  summary: "总结"
};

const GATE_STYLE: Record<GateResult, { badge: string; label: string }> = {
  pass: { badge: "bg-accent-green/15 text-accent-green", label: "通过" },
  fail: { badge: "bg-accent-red/15 text-accent-red", label: "失败" },
  manual: { badge: "bg-panel-bg text-panel-muted", label: "人工" }
};

function fmtTime(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

// 阶段状态 tab — every phase's gate result + the artifact refs it produced,
// straight from state.phase_history. Refs are clickable for traceability.
export function PhaseStatusTab({ state }: { state: ProjectState }) {
  const history = state.phase_history ?? [];
  if (history.length === 0) {
    return <p className="text-sm text-panel-muted">尚无阶段历史。</p>;
  }
  return (
    <ul className="space-y-2">
      {history.map((entry, i) => {
        const gate = GATE_STYLE[entry.gate_result] ?? GATE_STYLE.manual;
        return (
          <li
            key={`${entry.phase}-${i}`}
            className="rounded-lg border border-panel-border bg-panel-bg p-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-panel-text">{PHASE_LABEL[entry.phase] ?? entry.phase}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${gate.badge}`}>{gate.label}</span>
              <span className="ml-auto text-[10px] text-panel-muted">{fmtTime(entry.timestamp)}</span>
            </div>
            {entry.artifact_refs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {entry.artifact_refs.map((ref) => (
                  <RefChip key={ref} refValue={ref} />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
