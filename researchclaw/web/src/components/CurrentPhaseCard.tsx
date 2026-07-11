import { useQuery } from "@tanstack/react-query";
import { fetchArtifact } from "../api/client";
import type { ProjectState } from "../api/types";
import { currentArtifactRef, currentPhaseTasks, phaseLabel } from "../lib/phase";
import { RefChip } from "./RefChip";

function previewJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 520 ? `${json.slice(0, 520)}\n…` : json;
  } catch {
    return "无法预览 JSON";
  }
}

function formatTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function CurrentPhaseCard({ state }: { state: ProjectState }) {
  const artifactRef = currentArtifactRef(state.current, state.phase);
  const actionLabels = (state.pending_human_actions ?? [])
    .map((action) => {
      if ("label" in action && typeof action.label === "string") return action.label;
      if ("description" in action && typeof action.description === "string") return action.description;
      return undefined;
    })
    .filter((label): label is string => Boolean(label));
  const tasks = currentPhaseTasks(state.phase, actionLabels);
  const artifact = useQuery({
    queryKey: ["artifact", state.project_id, artifactRef],
    queryFn: () => fetchArtifact(state.project_id, artifactRef as string),
    enabled: Boolean(artifactRef)
  });

  return (
    <section className="rounded-lg border border-panel-border bg-panel-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-panel-muted">当前阶段</div>
          <h2 className="mt-1 text-base font-semibold text-panel-text">{phaseLabel(state.phase)}</h2>
          <div className="mt-1 text-xs text-panel-muted">开始时间：{formatTime(state.current.phase_started_at)}</div>
        </div>
        {artifact.data?.producer.adapter && (
          <span
            className="rounded-full border border-panel-border bg-panel-bg px-2 py-0.5 text-xs text-panel-muted"
            title={artifact.data.producer.windowId ? `windowId: ${artifact.data.producer.windowId}` : undefined}
          >
            {artifact.data.producer.adapter}
            {artifact.data.producer.model ? ` · ${artifact.data.producer.model}` : ""}
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="text-xs font-medium text-panel-muted">子任务清单</div>
          <ul className="mt-2 space-y-1 text-sm text-panel-text">
            {tasks.map((task, index) => (
              <li key={`${task}-${index}`} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{task}</span>
              </li>
            ))}
          </ul>
          {state.block && (
            <div className="mt-3 rounded border border-accent-red/40 bg-panel-bg p-2 text-xs text-accent-red">
              <div>失败阶段：{phaseLabel(state.block.failed_phase)}</div>
              <div>建议回退：{state.block.retreat_to ? phaseLabel(state.block.retreat_to) : "—"}</div>
              {state.block.errors?.[0] && <div className="mt-1 text-panel-muted">{state.block.errors[0]}</div>}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-panel-muted">
            <span>关键产物 JSON 预览</span>
            {artifactRef && <RefChip refValue={artifactRef} label="查看完整产物" />}
          </div>
          {!artifactRef ? (
            <div className="rounded border border-panel-border bg-panel-bg p-3 text-xs text-panel-muted">
              当前阶段尚无结构化产物。
            </div>
          ) : artifact.isLoading ? (
            <div className="rounded border border-panel-border bg-panel-bg p-3 text-xs text-panel-muted">加载产物中…</div>
          ) : artifact.isError ? (
            <div className="rounded border border-accent-red/40 bg-panel-bg p-3 text-xs text-accent-red">
              产物预览加载失败。
            </div>
          ) : (
            <pre className="max-h-52 overflow-auto rounded border border-panel-border bg-panel-bg p-3 text-[11px] leading-relaxed text-panel-muted">
              {previewJson(artifact.data?.content)}
            </pre>
          )}
        </div>
      </div>
    </section>
  );
}
