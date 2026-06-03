import type { ProjectState } from "../api/types";
import { PIPELINE, nodeStatus, overallProgress, type NodeStatus } from "../lib/pipeline";

const STATUS_STYLES: Record<NodeStatus, { dot: string; label: string; text: string }> = {
  done: { dot: "bg-accent-green border-accent-green", label: "已完成", text: "text-accent-green" },
  active: { dot: "bg-accent border-accent animate-pulse", label: "进行中", text: "text-accent" },
  blocked: { dot: "bg-accent-red border-accent-red", label: "需修订", text: "text-accent-red" },
  pending: { dot: "bg-transparent border-panel-border", label: "待运行", text: "text-panel-muted" }
};

export function PipelineProgress({ state }: { state: ProjectState }) {
  const progress = overallProgress(state);
  return (
    <section className="rounded-lg border border-panel-border bg-panel-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-panel-text">研究工作流进展</h2>
        <span className="text-sm text-panel-muted">总体进度 {progress}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-panel-bg">
        <div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
      </div>

      <ol className="mt-4 flex flex-wrap gap-x-2 gap-y-3">
        {PIPELINE.map((node, idx) => {
          const status = nodeStatus(state, node);
          const styles = STATUS_STYLES[status];
          return (
            <li key={node.id} className="flex items-center">
              <div className="flex flex-col items-center text-center w-20">
                <span className={`h-4 w-4 rounded-full border-2 ${styles.dot}`} />
                <span className="mt-1 text-xs text-panel-text">{node.label}</span>
                <span className={`text-[10px] ${styles.text}`}>{styles.label}</span>
              </div>
              {idx < PIPELINE.length - 1 && <span className="mx-1 h-px w-4 bg-panel-border" />}
            </li>
          );
        })}
      </ol>

      {state.phase === "blocked" && state.block && (
        <p className="mt-3 rounded border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          {state.block.failed_phase} 失败，可回退到 {state.block.retreat_to ?? "—"}
          {state.block.errors?.length ? `：${state.block.errors.join("；")}` : ""}
        </p>
      )}
    </section>
  );
}
