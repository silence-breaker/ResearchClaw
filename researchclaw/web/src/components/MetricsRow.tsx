import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEvidence } from "../api/client";
import type { ProjectState } from "../api/types";
import { evidenceCoverage } from "../lib/evidence";
import { budgetTone, costTooltip, elapsedLabel } from "../lib/metrics";
import { artifactCount, gatePassRate, overallProgress } from "../lib/pipeline";
import { adapterBadgeMeta } from "../lib/processFeed";

const toneClass: Record<"ok" | "warn" | "over", string> = {
  ok: "border-panel-border bg-panel-surface",
  warn: "border-amber-500/50 bg-amber-500/10",
  over: "border-red-500/60 bg-red-500/10"
};

function Metric({
  label,
  value,
  title,
  tone = "ok",
  hint
}: {
  label: string;
  value: string;
  title?: string;
  tone?: "ok" | "warn" | "over";
  hint?: string;
}) {
  return (
    <div className={`rounded-lg border px-4 py-2 ${toneClass[tone]}`} title={title}>
      <div className="text-lg font-semibold text-panel-text">{value}</div>
      <div className="text-xs text-panel-muted">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-amber-300">{hint}</div>}
    </div>
  );
}

// Elapsed time in the current phase, re-rendered every second. Phase start comes
// from the backend (state.current.phase_started_at); idle/blocked show "—".
function PhaseTimer({ state }: { state: ProjectState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const running = state.phase !== "idle" && state.phase !== "blocked";
  const value = running ? elapsedLabel(state.current.phase_started_at, now) : "—";
  return <Metric label="当前阶段已用时" value={value} />;
}

export function MetricsRow({ state }: { state: ProjectState }) {
  const passRate = gatePassRate(state);
  const evidence = useQuery({
    queryKey: ["evidence", state.project_id, state.updated_at],
    queryFn: () => fetchEvidence(state.project_id)
  });
  const coverage = evidence.data?.ready ? evidenceCoverage(evidence.data.evidence_index).percent : null;

  // M4: cost now includes cache tokens (no longer underestimated); budget state
  // drives warn/over highlighting. All read from the backend snapshot — the UI
  // never estimates cost or picks a threshold.
  const usage = state.usage;
  const cost = usage ? `$${usage.est_cost_usd.toFixed(4)}` : "—";
  const costTitle = usage ? costTooltip(usage) : "接真实 CLI 后显示";
  const tone = budgetTone(usage?.budget);
  const budget = usage?.budget;
  const costHint =
    tone === "warn" && budget?.ratio != null ? `接近预算上限（${Math.round(budget.ratio * 100)}%）` : undefined;

  return (
    <div className="space-y-3">
      {tone === "over" && budget && (
        <div className="rounded border border-red-500/60 bg-red-500/10 p-2 text-[11px] text-red-300">
          已超会话预算（${budget.spent.toFixed(4)} / ${budget.limit?.toFixed(2)}）。CLI 调用已暂停，请人工确认后继续。
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="总体进度" value={`${overallProgress(state)}%`} />
        <Metric label="gate 通过率" value={passRate === null ? "—" : `${passRate}%`} />
        <Metric label="证据覆盖率" value={coverage === null ? "—" : `${coverage}%`} />
        <Metric label="artifact 数" value={String(artifactCount(state))} />
        <Metric label="本会话成本" value={cost} title={costTitle} tone={tone} hint={costHint} />
        <Metric
          label="CLI 调用"
          value={usage ? String(usage.cli_calls) : "—"}
          title={usage ? `${usage.cli_calls} 调用 / ${usage.cli_failures} 失败` : "接真实 CLI 后显示"}
        />
        <PhaseTimer state={state} />
      </div>
      {usage?.by_provider && Object.keys(usage.by_provider).length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px] text-panel-muted">
          <span className="text-panel-muted/70">按 CLI：</span>
          {Object.entries(usage.by_provider).map(([provider, b]) => (
            <span key={provider} className="rounded border border-panel-border bg-panel-bg px-2 py-0.5">
              {adapterBadgeMeta(provider).label} · {b.cli_calls} 调用
              {b.cli_failures ? ` / ${b.cli_failures} 失败` : ""}
              {b.est_cost_usd != null ? ` · $${b.est_cost_usd.toFixed(4)}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
