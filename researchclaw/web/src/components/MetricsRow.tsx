import type { ProjectState } from "../api/types";
import { artifactCount, gatePassRate, overallProgress } from "../lib/pipeline";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-panel-border bg-panel-surface px-4 py-2">
      <div className="text-lg font-semibold text-panel-text">{value}</div>
      <div className="text-xs text-panel-muted">{label}</div>
    </div>
  );
}

export function MetricsRow({ state }: { state: ProjectState }) {
  const passRate = gatePassRate(state);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Metric label="总体进度" value={`${overallProgress(state)}%`} />
      <Metric label="gate 通过率" value={passRate === null ? "—" : `${passRate}%`} />
      <Metric label="artifact 数" value={String(artifactCount(state))} />
      {/* 成本/token 是 M2（接真实 CLI 才有用量），M1 显 — */}
      <Metric label="本会话成本" value="—" />
    </div>
  );
}
