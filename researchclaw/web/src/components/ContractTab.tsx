import { useQuery } from "@tanstack/react-query";
import { fetchArtifact } from "../api/client";
import type { Artifact, ContractCriterion, ProjectState, ResearchContract } from "../api/types";
import { criterionMeta } from "../lib/contract";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-panel-border/60 py-2 last:border-0">
      <div className="text-xs uppercase tracking-wide text-panel-muted">{label}</div>
      <div className="mt-1 text-sm text-panel-text">{children}</div>
    </div>
  );
}

function CriteriaList({ items }: { items?: ContractCriterion[] }) {
  if (!items?.length) return <span className="text-panel-muted">—</span>;
  return (
    <ul className="space-y-2">
      {items.map((c, i) => {
        const meta = criterionMeta(c);
        return (
          <li key={c.id ?? i} className="flex gap-2">
            <span className="mt-0.5 shrink-0 rounded bg-panel-bg px-1.5 py-0.5 font-mono text-[10px] text-accent">
              {c.id ?? `#${i + 1}`}
            </span>
            <div>
              <div>{c.description}</div>
              {meta && <div className="mt-0.5 font-mono text-xs text-panel-muted">{meta}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ContractTab({ state }: { state: ProjectState }) {
  const ref = state.current.contract_artifact_ref;
  const query = useQuery({
    queryKey: ["artifact", state.project_id, ref],
    queryFn: () => fetchArtifact(state.project_id, ref as string),
    enabled: Boolean(ref)
  });

  if (!ref) {
    return <p className="text-sm text-panel-muted">尚无研究契约。</p>;
  }
  if (query.isLoading) {
    return <p className="text-sm text-panel-muted">加载契约中…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-accent-red">契约加载失败。</p>;
  }

  const contract = (query.data as Artifact<ResearchContract>).content;
  return (
    <div className="space-y-1">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-panel-bg px-2 py-0.5 text-xs text-accent">
          研究契约 v{contract.version ?? "?"}
        </span>
        <span className="text-xs text-panel-muted">{query.data.status}</span>
        {/* approve / revise 是 M1.3，这里只读 */}
        <span className="ml-auto text-[10px] text-panel-muted">只读（操作见 M1.3）</span>
      </div>
      <Field label="主题">{contract.topic ?? "—"}</Field>
      <Field label="研究问题">{contract.research_question ?? "—"}</Field>
      <Field label="假设">{contract.hypothesis ?? "—"}</Field>
      <Field label="成功标准">
        <CriteriaList items={contract.success_criteria} />
      </Field>
      <Field label="失败信号">
        <CriteriaList items={contract.failure_signals} />
      </Field>
      <Field label="关键指标">
        {contract.metrics?.length ? (
          <div className="flex flex-wrap gap-2">
            {contract.metrics.map((m, i) => (
              <span key={i} className="rounded bg-panel-bg px-2 py-0.5 font-mono text-xs text-panel-text">
                {m.name}
                {m.direction ? (m.direction.includes("low") || m.direction === "min" ? " ↓" : " ↑") : ""}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-panel-muted">—</span>
        )}
      </Field>
      <Field label="数据划分">
        <pre className="overflow-x-auto rounded bg-panel-bg p-2 font-mono text-xs text-panel-text">
          {JSON.stringify(contract.data_split ?? "—", null, 2)}
        </pre>
      </Field>
    </div>
  );
}
