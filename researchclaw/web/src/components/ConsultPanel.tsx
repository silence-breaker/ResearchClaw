import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchArtifact, promoteConsult } from "../api/client";
import type { Artifact, CliRawLogSummary, ProjectState } from "../api/types";
import type { LiveConsult } from "../lib/consult";
import { liveSettledIntoHistory } from "../lib/consult";
import { RefChip } from "./RefChip";

// One finalized consult turn (from snapshot history). Fetches its raw_log to show
// the question + answer, with a promote-to-consult_note button. Process channel —
// promoting marks it as a human-adopted note, never a gated conclusion.
function ConsultTurnCard({
  projectId,
  refValue,
  promoted
}: {
  projectId: string;
  refValue: string;
  promoted: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["artifact", projectId, refValue], queryFn: () => fetchArtifact(projectId, refValue) });
  const content = (query.data?.content ?? {}) as CliRawLogSummary;

  const onPromote = async () => {
    setBusy(true);
    setError(null);
    try {
      await promoteConsult(projectId, refValue);
      await queryClient.invalidateQueries({ queryKey: ["consult-notes", projectId] });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded border border-panel-border bg-panel-bg p-2">
      {content.question && <div className="text-[11px] font-medium text-panel-text">你：{content.question}</div>}
      <div className="mt-1 whitespace-pre-wrap text-xs text-panel-muted">{content.answer_text ?? content.summary}</div>
      <div className="mt-1 flex items-center gap-2">
        <RefChip refValue={refValue} label="查看 transcript" />
        {promoted ? (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300" title="已人工采纳为 consult_note（未过 gate）">
            已采纳为笔记
          </span>
        ) : (
          <button
            onClick={onPromote}
            disabled={busy}
            className="rounded border border-panel-border px-1.5 py-0.5 text-[10px] text-panel-muted hover:text-panel-text disabled:opacity-50"
          >
            {busy ? "采纳中…" : "提升为 artifact"}
          </button>
        )}
      </div>
      {error && <div className="mt-1 text-[10px] text-amber-300">{error}</div>}
    </li>
  );
}

// consult 一问一答 view (M3). Finalized turns come from the snapshot
// (state.consult.raw_log_refs); the live turn is the optimistic in-flight reply.
// Default model is Haiku — no model picker (workflow mode is pinned to Haiku;
// consult follows). consult never advances research state.
export function ConsultPanel({
  projectId,
  state,
  liveConsult,
  onSend
}: {
  projectId: string;
  state: ProjectState;
  liveConsult: LiveConsult | null;
  onSend: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const historyRefs = state.consult?.raw_log_refs ?? [];

  // Promoted-source set, so a turn already adopted shows a badge instead of the button.
  const notesQuery = useQuery({
    queryKey: ["consult-notes", projectId, (state.current.consult_note_refs ?? []).join(",")],
    queryFn: () => Promise.all((state.current.consult_note_refs ?? []).map((ref) => fetchArtifact(projectId, ref))),
    enabled: (state.current.consult_note_refs ?? []).length > 0
  });
  const promotedSources = new Set(
    (notesQuery.data ?? []).map((note: Artifact) => (note.content as { source_raw_log_ref?: string }).source_raw_log_ref).filter(Boolean) as string[]
  );

  // Show the live turn only until its raw_log lands in snapshot history (then the
  // finalized card renders it from the durable source).
  const showLive = liveConsult && !liveSettledIntoHistory(liveConsult, historyRefs);

  const submit = () => {
    const message = draft.trim();
    if (!message) {
      return;
    }
    onSend(message);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-panel-muted">
        与 Claude 一问一答 · Haiku · 过程流，promote 才入证据库（非 gate 结论）
      </div>

      <ul className="max-h-72 space-y-1.5 overflow-auto">
        {historyRefs.map((ref) => (
          <ConsultTurnCard key={ref} projectId={projectId} refValue={ref} promoted={promotedSources.has(ref)} />
        ))}
        {showLive && (
          <li className="rounded border border-accent/30 bg-panel-bg p-2">
            <div className="text-[11px] font-medium text-panel-text">你：{liveConsult.question}</div>
            {liveConsult.status === "error" ? (
              <div className="mt-1 text-xs text-amber-300">{liveConsult.error}</div>
            ) : (
              <div className="mt-1 whitespace-pre-wrap text-xs text-panel-muted">
                {liveConsult.answer || (liveConsult.status === "streaming" ? "Claude 正在回复…" : "")}
                {liveConsult.status === "streaming" && <span className="ml-0.5 animate-pulse">▍</span>}
              </div>
            )}
          </li>
        )}
        {historyRefs.length === 0 && !showLive && (
          <li className="text-xs text-panel-muted">还没有对话。向 Claude 提一个问题开始。</li>
        )}
      </ul>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="向 Claude 提问（Haiku）…"
          className="flex-1 rounded border border-panel-border bg-panel-bg px-3 py-2 text-xs text-panel-text placeholder:text-panel-muted/70"
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || liveConsult?.status === "streaming"}
          className="rounded border border-accent/40 bg-accent/15 px-3 py-2 text-xs text-accent disabled:opacity-50"
        >
          发送
        </button>
      </div>
    </div>
  );
}
