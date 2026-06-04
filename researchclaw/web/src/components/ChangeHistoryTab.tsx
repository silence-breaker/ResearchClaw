import type { ProjectState } from "../api/types";
import { RefChip } from "./RefChip";

const STATUS_STYLE: Record<string, string> = {
  accepted: "bg-accent-green/15 text-accent-green",
  approved: "bg-accent-green/15 text-accent-green",
  draft: "bg-accent-amber/15 text-accent-amber",
  superseded: "bg-panel-bg text-panel-muted",
  rejected: "bg-accent-red/15 text-accent-red"
};

// 变更历史 tab — contract version trail from state.contract_versions. Each
// version links to its artifact; the drawer shows that version's human_notes
// (i.e. the revise feedback) so changes are traceable, not summarized.
export function ChangeHistoryTab({ state }: { state: ProjectState }) {
  const versions = state.contract_versions ?? [];
  if (versions.length === 0) {
    return <p className="text-sm text-panel-muted">尚无契约版本历史。</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-panel-muted">
        契约共 {versions.length} 个版本。点击版本引用查看该版本完整内容与修订反馈（human_notes）。
      </p>
      <ol className="space-y-2">
        {versions
          .slice()
          .sort((a, b) => b.version - a.version)
          .map((v) => (
            <li
              key={v.version}
              className="flex items-center gap-2 rounded-lg border border-panel-border bg-panel-bg p-3"
            >
              <span className="rounded bg-panel-surface px-2 py-0.5 text-xs text-accent">v{v.version}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[v.status] ?? "bg-panel-surface text-panel-muted"}`}
              >
                {v.status}
              </span>
              <span className="ml-auto">
                <RefChip refValue={v.artifact_ref} label="查看该版本" />
              </span>
            </li>
          ))}
      </ol>
    </div>
  );
}
