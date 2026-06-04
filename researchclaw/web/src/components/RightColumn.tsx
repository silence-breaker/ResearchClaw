import type { ProjectCurrent, ProjectState } from "../api/types";
import { RefChip } from "./RefChip";

// The structured artifacts a project can produce, in pipeline order, with the
// state.current key that holds each ref. Drives the clickable artifact list.
const STRUCTURED_ARTIFACTS: { key: keyof ProjectCurrent; label: string }[] = [
  { key: "contract_artifact_ref", label: "研究契约" },
  { key: "literature_artifact_ref", label: "文献卡片" },
  { key: "baseline_artifact_ref", label: "基线决策" },
  { key: "checklist_artifact_ref", label: "复现清单" },
  { key: "idea_artifact_ref", label: "想法卡片" },
  { key: "review_artifact_ref", label: "想法评审" },
  { key: "summary_artifact_ref", label: "研究总结" }
];

// M1: the right "multi-model" lane is mostly placeholder. Per the red line we
// must NOT fake multi-model collaboration — Claude/Gemini/Codex are disabled,
// consult input is off. The artifact list IS real (clickable → detail drawer).
export function RightColumn({ state }: { state: ProjectState }) {
  const rawLogs = state.current.raw_log_artifact_refs ?? [];
  const artifacts = STRUCTURED_ARTIFACTS.map((a) => ({
    label: a.label,
    ref: state.current[a.key] as string | undefined
  })).filter((a): a is { label: string; ref: string } => Boolean(a.ref));

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 border-l border-panel-border bg-panel-surface p-4">
      <div>
        <div className="text-sm font-semibold text-panel-text">模型互动 / 实时视图</div>
        <div className="mt-2 flex gap-2">
          {[
            { name: "Claude", note: "M2 接入" },
            { name: "Gemini", note: "未接入" },
            { name: "Codex", note: "未接入" }
          ].map((m) => (
            <button
              key={m.name}
              disabled
              title={m.note}
              className="cursor-not-allowed rounded border border-panel-border bg-panel-bg px-2 py-1 text-xs text-panel-muted/70"
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-panel-muted">多模型对话 / 角色分工为 M2/M3，当前未接入。</div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-panel-muted">关键产物（artifact）</div>
        {artifacts.length === 0 ? (
          <p className="mt-2 text-xs text-panel-muted">暂无结构化产物。</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {artifacts.map((a) => (
              <li key={a.ref} className="flex items-center gap-2 text-xs text-panel-text">
                <span className="flex-1 truncate">{a.label}</span>
                <RefChip refValue={a.ref} label="查看" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="text-xs uppercase tracking-wide text-panel-muted">过程流（raw_log）</div>
        {rawLogs.length === 0 ? (
          <p className="mt-2 text-xs text-panel-muted">暂无 raw_log。真实 CLI transcript 为 M2。</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {rawLogs.map((ref) => (
              <li key={ref}>
                <RefChip refValue={ref} label={ref} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <input
          disabled
          placeholder="M3 开放与 Claude 一问一答"
          className="w-full cursor-not-allowed rounded border border-panel-border bg-panel-bg px-3 py-2 text-xs text-panel-muted/70"
        />
      </div>
    </aside>
  );
}
