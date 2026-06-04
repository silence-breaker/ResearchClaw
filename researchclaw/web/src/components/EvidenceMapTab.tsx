import { useQuery } from "@tanstack/react-query";
import { fetchEvidence } from "../api/client";
import type { EvidenceIndexEntry, ProjectState } from "../api/types";
import { claimStatus, evidenceCoverage } from "../lib/evidence";
import { RefChip } from "./RefChip";

const STATUS_STYLE: Record<string, { ring: string; badge: string; label: string }> = {
  satisfied: { ring: "border-accent-green/50", badge: "bg-accent-green/15 text-accent-green", label: "已满足" },
  partial: { ring: "border-accent-amber/50", badge: "bg-accent-amber/15 text-accent-amber", label: "部分满足" },
  gap: { ring: "border-accent-red/50", badge: "bg-accent-red/15 text-accent-red", label: "缺口" }
};

function ClaimCard({ entry }: { entry: EvidenceIndexEntry }) {
  const status = claimStatus(entry);
  const style = STATUS_STYLE[status];
  return (
    <li className={`rounded-lg border ${style.ring} bg-panel-bg p-3`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 rounded bg-panel-surface px-1.5 py-0.5 font-mono text-[10px] text-accent">
          {entry.claim_id}
        </span>
        <div className="text-sm text-panel-text">{entry.claim}</div>
        <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] ${style.badge}`}>
          {style.label}
        </span>
      </div>

      {entry.satisfied.length > 0 && (
        <ul className="mt-2 space-y-1">
          {entry.satisfied.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-panel-text">
              <span className="text-accent-green">✓</span>
              <span className="flex-1">{s.evidence}</span>
              <RefChip refValue={s.artifact_ref} />
            </li>
          ))}
        </ul>
      )}

      {entry.pending.length > 0 && (
        <ul className="mt-2 space-y-1">
          {entry.pending.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-panel-muted">
              <span className="text-accent-amber">○</span>
              <span className="flex-1">{p.evidence}</span>
              <span className="shrink-0 text-[10px] text-panel-muted/80">{p.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// 证据映射 tab — the project's moat. Data is the live claimEvidenceGate output
// (GET /evidence). Never hardcoded (red line §11.1).
export function EvidenceMapTab({ state }: { state: ProjectState }) {
  const query = useQuery({
    queryKey: ["evidence", state.project_id, state.updated_at],
    queryFn: () => fetchEvidence(state.project_id)
  });

  if (query.isLoading) {
    return <p className="text-sm text-panel-muted">加载证据映射中…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-accent-red">证据映射加载失败。</p>;
  }
  if (!query.data.ready) {
    return <p className="text-sm text-panel-muted">待契约批准后生成证据映射。</p>;
  }

  const index = query.data.evidence_index;
  const coverage = evidenceCoverage(index);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-panel-muted">
        <span>
          证据覆盖率：
          <span className="font-semibold text-panel-text">
            {coverage.percent === null ? "—" : `${coverage.percent}%`}
          </span>
        </span>
        <span>
          {coverage.satisfied}/{coverage.total} 项证据已命中
        </span>
        {query.data.gate_ok === false && (
          <span className="rounded bg-accent-amber/15 px-1.5 py-0.5 text-accent-amber">存在阻断缺口</span>
        )}
      </div>
      <ul className="space-y-2">
        {index.map((entry) => (
          <ClaimCard key={entry.claim_id} entry={entry} />
        ))}
      </ul>
    </div>
  );
}
