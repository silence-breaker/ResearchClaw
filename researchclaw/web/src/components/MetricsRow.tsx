import { useQuery } from "@tanstack/react-query";
import { fetchEvidence } from "../api/client";
import type { ProjectState } from "../api/types";
import { evidenceCoverage } from "../lib/evidence";
import { artifactCount, gatePassRate, overallProgress } from "../lib/pipeline";

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-lg border border-panel-border bg-panel-surface px-4 py-2" title={title}>
      <div className="text-lg font-semibold text-panel-text">{value}</div>
      <div className="text-xs text-panel-muted">{label}</div>
    </div>
  );
}

export function MetricsRow({ state }: { state: ProjectState }) {
  const passRate = gatePassRate(state);
  const evidence = useQuery({
    queryKey: ["evidence", state.project_id, state.updated_at],
    queryFn: () => fetchEvidence(state.project_id)
  });
  const coverage =
    evidence.data?.ready ? evidenceCoverage(evidence.data.evidence_index).percent : null;

  // Lightweight usage透出 (M2前端 §3.6): show real est_cost from state.usage when a
  // CLI has run; no threshold alerts (那是 M4). Absent usage → "—".
  const usage = state.usage;
  const cost = usage ? `$${usage.est_cost_usd.toFixed(4)}` : "—";
  const costTitle = usage
    ? `in ${usage.input_tokens} / out ${usage.output_tokens} tokens · CLI ${usage.cli_calls} 调用 / ${usage.cli_failures} 失败`
    : "接真实 CLI 后显示";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Metric label="总体进度" value={`${overallProgress(state)}%`} />
      <Metric label="gate 通过率" value={passRate === null ? "—" : `${passRate}%`} />
      <Metric label="证据覆盖率" value={coverage === null ? "—" : `${coverage}%`} />
      <Metric label="artifact 数" value={String(artifactCount(state))} />
      <Metric label="本会话成本" value={cost} title={costTitle} />
    </div>
  );
}
