import type { ProjectState } from "../api/types";

// M1: the right "multi-model" lane is mostly placeholder. Per the red line we
// must NOT fake multi-model collaboration — Claude/Gemini/Codex are disabled,
// the process feed only lists real raw_log artifacts, consult input is off.
export function RightColumn({ state }: { state: ProjectState }) {
  const rawLogs = state.current.raw_log_artifact_refs ?? [];
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

      <div className="flex-1 overflow-auto">
        <div className="text-xs uppercase tracking-wide text-panel-muted">过程流（raw_log）</div>
        {rawLogs.length === 0 ? (
          <p className="mt-2 text-xs text-panel-muted">暂无 raw_log。真实 CLI transcript 为 M2。</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {rawLogs.map((ref) => (
              <li key={ref} className="truncate rounded bg-panel-bg px-2 py-1 font-mono text-[11px] text-panel-text">
                {ref}
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
