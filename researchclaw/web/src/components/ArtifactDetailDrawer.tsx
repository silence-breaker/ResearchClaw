import { useQuery } from "@tanstack/react-query";
import { fetchArtifact } from "../api/client";
import type { ArtifactType } from "../api/types";
import { shapeExperimentArtifact } from "../lib/experimentArtifact";
import { useArtifactDrawer } from "../stores/drawer";
import { AdapterBadge } from "./AdapterBadge";
import { RefChip } from "./RefChip";

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-24 shrink-0 text-panel-muted">{label}</span>
      <span className="break-all text-panel-text">{value}</span>
    </div>
  );
}

const EXPERIMENT_TYPES = new Set<ArtifactType>([
  "experiment_plan",
  "experiment_run",
  "experiment_review"
]);

function isExperimentType(type: ArtifactType): boolean {
  return EXPERIMENT_TYPES.has(type);
}

function ExperimentArtifactBody({
  type,
  content
}: {
  type: ArtifactType;
  content: unknown;
}) {
  const shaped = shapeExperimentArtifact(type, content);
  return (
    <div className="space-y-3">
      {/* Field rows */}
      {shaped.fields.length > 0 && (
        <div className="space-y-1 rounded-lg border border-panel-border bg-panel-bg p-3">
          {shaped.fields.map((f) => (
            <Meta key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      )}

      {/* run_ref for experiment_review */}
      {shaped.runRef && (
        <div className="space-y-1 rounded-lg border border-panel-border bg-panel-bg p-3">
          <Meta label="run_ref" value={<RefChip refValue={shaped.runRef} />} />
        </div>
      )}

      {/* Commands block */}
      {shaped.commands && shaped.commands.length > 0 && (
        <div className="rounded border border-amber-400/30 bg-black/30 p-2 font-mono text-xs text-amber-200">
          {shaped.commands.map((cmd, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              <span className="select-none text-amber-500/70">$ </span>
              {cmd}
            </div>
          ))}
        </div>
      )}

      {/* claim_support list */}
      {shaped.claimSupport && shaped.claimSupport.length > 0 && (
        <div className="space-y-1 rounded-lg border border-panel-border bg-panel-bg p-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-panel-muted">claim_support</div>
          {shaped.claimSupport.map((entry, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <span className="w-24 shrink-0 text-panel-muted">{entry.claim_id ?? "—"}</span>
              <span className="break-all text-panel-text">
                {entry.metric_ref ?? "—"} · {entry.support_type ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Slide-over panel showing a single artifact's metadata + structured content.
// Rendered once (in Panel); opened by any RefChip via the drawer store. Read-only
// — this is how a conclusion is traced to its artifact, never edited here.
export function ArtifactDetailDrawer({ projectId }: { projectId: string }) {
  const ref = useArtifactDrawer((s) => s.ref);
  const close = useArtifactDrawer((s) => s.close);

  const query = useQuery({
    queryKey: ["artifact", projectId, ref],
    queryFn: () => fetchArtifact(projectId, ref as string),
    enabled: Boolean(ref)
  });

  if (!ref) {
    return null;
  }

  const artifact = query.data;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />
      <aside className="relative flex w-full max-w-xl flex-col border-l border-panel-border bg-panel-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-panel-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-panel-muted" title={ref}>
              {ref}
            </div>
            <div className="text-sm font-semibold text-panel-text">
              {artifact ? `${artifact.type} · ${artifact.status}` : "artifact 详情"}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-sm text-panel-muted hover:bg-panel-bg hover:text-panel-text"
          >
            关闭 ✕
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-auto p-4">
          {query.isLoading && <p className="text-sm text-panel-muted">加载 artifact 中…</p>}
          {query.isError && <p className="text-sm text-accent-red">artifact 加载失败。</p>}
          {artifact && (
            <>
              <section className="space-y-1 rounded-lg border border-panel-border bg-panel-bg p-3">
                <Meta label="artifact_id" value={artifact.artifact_id} />
                <Meta label="type" value={artifact.type} />
                <Meta label="phase" value={artifact.phase} />
                <Meta label="adapter" value={<AdapterBadge adapter={artifact.producer?.adapter} />} />
                {artifact.producer?.cli && <Meta label="cli" value={artifact.producer.cli} />}
                {artifact.producer?.model && <Meta label="model" value={artifact.producer.model} />}
                {artifact.producer?.windowId && <Meta label="windowId" value={artifact.producer.windowId} />}
                <Meta label="workflow" value={artifact.producer?.workflow ?? "—"} />
                <Meta label="status" value={artifact.status} />
                <Meta label="created_at" value={artifact.created_at} />
                {artifact.input_refs?.length > 0 && (
                  <Meta label="input_refs" value={artifact.input_refs.join(", ")} />
                )}
                {artifact.evidence_refs?.length > 0 && (
                  <Meta label="evidence_refs" value={artifact.evidence_refs.join(", ")} />
                )}
              </section>

              <section>
                <div className="mb-1 text-xs uppercase tracking-wide text-panel-muted">content</div>
                {isExperimentType(artifact.type) ? (
                  <ExperimentArtifactBody type={artifact.type} content={artifact.content} />
                ) : (
                  <pre className="overflow-x-auto rounded-lg bg-panel-bg p-3 font-mono text-xs leading-relaxed text-panel-text">
                    {JSON.stringify(artifact.content, null, 2)}
                  </pre>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
