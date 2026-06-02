import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ProjectState } from "../api/types";
import { deriveActions } from "../lib/actions";
import { advancePhase, approveContract, recoverProject, reviseContract } from "../api/client";

// Human-in-the-loop controls. Buttons fire a POST and then do nothing locally —
// the engine broadcasts a `snapshot` over SSE and the panel re-renders from it.
export function ActionBar({ state }: { state: ProjectState }) {
  const projectId = state.project_id;
  const actions = deriveActions(state.pending_human_actions);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  // One mutation drives every button: mutationFn just runs the supplied thunk,
  // so isPending/error are shared across the whole bar (only one action at a time).
  const mutation = useMutation({ mutationFn: (run: () => Promise<unknown>) => run() });
  const busy = mutation.isPending;

  if (actions.length === 0) {
    return null;
  }

  const recover = actions.find((a) => a.kind === "recover");
  const reviseAction = actions.find((a) => a.kind === "revise");
  const reviseArtifactId = reviseAction?.kind === "revise" ? reviseAction.artifactId : undefined;

  return (
    <section className="rounded-lg border border-panel-border bg-panel-surface p-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-panel-muted">待办操作</div>

      {recover?.kind === "recover" && recover.errors.length > 0 && (
        <ul className="mb-2 list-disc space-y-0.5 pl-5 text-xs text-accent-red">
          {recover.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a, i) => {
          if (a.kind === "note") {
            return (
              <span key={i} className="text-sm text-panel-text">
                {a.label}
              </span>
            );
          }
          if (a.kind === "approve") {
            return (
              <button
                key={i}
                disabled={busy}
                onClick={() =>
                  mutation.mutate(() =>
                    approveContract(projectId, { artifactId: a.artifactId, artifactRef: a.artifactRef })
                  )
                }
                className="rounded bg-accent-green/90 px-3 py-1.5 text-sm font-medium text-panel-bg hover:bg-accent-green disabled:opacity-50"
              >
                {a.label}
              </button>
            );
          }
          if (a.kind === "revise") {
            return (
              <button
                key={i}
                disabled={busy}
                onClick={() => setReviseOpen((v) => !v)}
                className="rounded border border-panel-border px-3 py-1.5 text-sm text-panel-text hover:border-accent disabled:opacity-50"
              >
                {a.label}
              </button>
            );
          }
          if (a.kind === "advance") {
            return (
              <button
                key={i}
                disabled={busy}
                onClick={() => mutation.mutate(() => advancePhase(projectId))}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-panel-bg hover:opacity-90 disabled:opacity-50"
              >
                {a.label}
              </button>
            );
          }
          // recover
          return (
            <button
              key={i}
              disabled={busy}
              onClick={() => mutation.mutate(() => recoverProject(projectId, { to: a.to }))}
              className="rounded bg-accent-amber/90 px-3 py-1.5 text-sm font-medium text-panel-bg hover:bg-accent-amber disabled:opacity-50"
            >
              {a.label}
            </button>
          );
        })}
        {busy && <span className="text-xs text-panel-muted">处理中…</span>}
      </div>

      {reviseOpen && (
        <div className="mt-3 space-y-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="说明需要修订什么（必填）"
            className="w-full rounded border border-panel-border bg-panel-bg p-2 text-sm text-panel-text outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <button
              disabled={busy || !feedback.trim()}
              onClick={() =>
                mutation.mutate(
                  () => reviseContract(projectId, { artifactId: reviseArtifactId, feedback: feedback.trim() }),
                  {
                    onSuccess: () => {
                      setReviseOpen(false);
                      setFeedback("");
                    }
                  }
                )
              }
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-panel-bg hover:opacity-90 disabled:opacity-50"
            >
              提交修订
            </button>
            <button
              disabled={busy}
              onClick={() => setReviseOpen(false)}
              className="text-sm text-panel-muted hover:text-panel-text"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {mutation.isError && (
        <p className="mt-2 text-sm text-accent-red">操作失败：{(mutation.error as Error).message}</p>
      )}
    </section>
  );
}
