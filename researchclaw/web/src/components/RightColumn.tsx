import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchArtifact } from "../api/client";
import type { CliChunk, ProjectCurrent, ProjectState } from "../api/types";
import type { LiveConsult } from "../lib/consult";
import { isDegradedChunk } from "../lib/cliStream";
import { readRawLogSummary } from "../lib/processFeed";
import { AdapterBadge } from "./AdapterBadge";
import { ConsultPanel } from "./ConsultPanel";
import { RefChip } from "./RefChip";

// The structured artifacts a project can produce, in pipeline order.
const STRUCTURED_ARTIFACTS: { key: keyof ProjectCurrent; label: string }[] = [
  { key: "contract_artifact_ref", label: "研究契约" },
  { key: "literature_artifact_ref", label: "文献卡片" },
  { key: "baseline_artifact_ref", label: "基线决策" },
  { key: "checklist_artifact_ref", label: "复现清单" },
  { key: "idea_artifact_ref", label: "想法卡片" },
  { key: "review_artifact_ref", label: "想法评审" },
  { key: "summary_artifact_ref", label: "研究总结" }
];

// One structured-artifact row: fetches the artifact to show its honest source
// badge (claude / mock / manual) next to a clickable ref.
function ArtifactRow({ projectId, label, refValue }: { projectId: string; label: string; refValue: string }) {
  const query = useQuery({ queryKey: ["artifact", projectId, refValue], queryFn: () => fetchArtifact(projectId, refValue) });
  return (
    <li className="flex items-center gap-2 text-xs text-panel-text">
      <span className="flex-1 truncate">{label}</span>
      <AdapterBadge adapter={query.data?.producer?.adapter} />
      <RefChip refValue={refValue} label="查看" />
    </li>
  );
}

// One process-feed card from a CLI transcript raw_log: model · time · role ·
// summary, with a chip to open the full transcript. Process channel only.
function ProcessFeedItem({ projectId, refValue }: { projectId: string; refValue: string }) {
  const query = useQuery({ queryKey: ["artifact", projectId, refValue], queryFn: () => fetchArtifact(projectId, refValue) });
  const item = readRawLogSummary(query.data?.content);
  return (
    <li className="rounded border border-panel-border bg-panel-bg p-2">
      <div className="flex items-center gap-2">
        <AdapterBadge adapter={query.data?.producer?.adapter} />
        <span className="text-[10px] text-panel-muted">{item.role}</span>
        <span className="ml-auto truncate font-mono text-[10px] text-panel-muted" title={item.time}>
          {item.model}
        </span>
      </div>
      <div className="mt-1 line-clamp-3 text-xs text-panel-text">{item.summary}</div>
      <div className="mt-1">
        <RefChip refValue={refValue} label="查看完整 transcript" />
      </div>
    </li>
  );
}

// Live cli_chunk region: the CLI's running actions, faint + collapsible. Clearly
// marked as process transparency — never a conclusion (两通道红线 §2.1).
function LiveChunks({ chunks }: { chunks: CliChunk[] }) {
  if (chunks.length === 0) {
    return null;
  }
  const recent = chunks.slice(-12);
  return (
    <details className="rounded border border-panel-border bg-panel-bg/60" open>
      <summary className="cursor-pointer px-2 py-1 text-[10px] uppercase tracking-wide text-panel-muted">
        实时过程（{chunks.length}）· 过程透明度，非结论
      </summary>
      <ul className="max-h-40 space-y-0.5 overflow-auto px-2 pb-2">
        {recent.map((c, i) => (
          <li key={`${c.ts}-${i}`} className="font-mono text-[10px] text-panel-muted/80">
            {c.tool ? `🛠 ${c.tool}` : c.text?.slice(0, 80)}
          </li>
        ))}
      </ul>
    </details>
  );
}

// One promoted consult_note row, rendered in its own section — visually
// separated from gated conclusion artifacts. Honest: a human-adopted note, never
// a gate-validated conclusion, never counted as evidence (两通道红线).
function ConsultNoteRow({ projectId, refValue }: { projectId: string; refValue: string }) {
  const query = useQuery({ queryKey: ["artifact", projectId, refValue], queryFn: () => fetchArtifact(projectId, refValue) });
  const content = (query.data?.content ?? {}) as { question?: string; note?: string };
  return (
    <li className="flex items-center gap-2 text-xs text-panel-muted">
      <span className="flex-1 truncate" title={content.note ?? undefined}>
        {content.question ?? "consult 笔记"}
      </span>
      <RefChip refValue={refValue} label="查看" />
    </li>
  );
}

// M3: the right lane is the CLI process channel + a real consult 一问一答 view.
// Clicking Claude opens the chat; workflow chunks still drive the process feed.
// Gemini / Codex remain placeholders. consult is process-only — promoted notes
// live in a separate, clearly-labelled section, never mixed with conclusions.
export function RightColumn({
  state,
  cliChunks = [],
  liveConsult = null,
  onSendConsult
}: {
  state: ProjectState;
  cliChunks?: CliChunk[];
  liveConsult?: LiveConsult | null;
  onSendConsult?: (message: string) => void;
}) {
  const projectId = state.project_id;
  const rawLogs = state.current.raw_log_artifact_refs ?? [];
  const consultNoteRefs = state.current.consult_note_refs ?? [];
  const artifacts = STRUCTURED_ARTIFACTS.map((a) => ({
    label: a.label,
    ref: state.current[a.key] as string | undefined
  })).filter((a): a is { label: string; ref: string } => Boolean(a.ref));
  const degraded = cliChunks.some(isDegradedChunk);
  const [consultOpen, setConsultOpen] = useState(false);

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 border-l border-panel-border bg-panel-surface p-4">
      {degraded && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-300">
          Claude 当前不可用（无 key / 超限 / 失败），已自动降级 mock，产物来源已如实标注。
        </div>
      )}

      <div>
        <div className="text-sm font-semibold text-panel-text">模型互动 / 实时视图</div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setConsultOpen((open) => !open)}
            title="点击与 Claude 一问一答（Haiku）"
            className={`rounded border px-2 py-1 text-xs ${
              consultOpen ? "border-accent bg-accent/25 text-accent" : "border-accent/40 bg-accent/15 text-accent"
            }`}
          >
            Claude{cliChunks.length > 0 ? " ●" : ""}
          </button>
          {[
            { name: "Gemini", note: "未接入" },
            { name: "Codex", note: "未接入" }
          ].map((m) => (
            <button
              key={m.name}
              disabled
              title={m.note}
              className="cursor-not-allowed rounded border border-panel-border bg-panel-bg px-2 py-1 text-xs text-panel-muted/70"
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-panel-muted">点 Claude 一问一答（Haiku）；Gemini / Codex 待接入。</div>
      </div>

      {consultOpen && onSendConsult && (
        <ConsultPanel projectId={projectId} state={state} liveConsult={liveConsult} onSend={onSendConsult} />
      )}

      <LiveChunks chunks={cliChunks} />

      <div>
        <div className="text-xs uppercase tracking-wide text-panel-muted">关键产物（artifact）</div>
        {artifacts.length === 0 ? (
          <p className="mt-2 text-xs text-panel-muted">暂无结构化产物。</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {artifacts.map((a) => (
              <ArtifactRow key={a.ref} projectId={projectId} label={a.label} refValue={a.ref} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="text-xs uppercase tracking-wide text-panel-muted">过程流（CLI transcript）</div>
        {rawLogs.length === 0 ? (
          <p className="mt-2 text-xs text-panel-muted">暂无 raw_log。真实 CLI transcript 在此显示。</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {rawLogs.map((ref) => (
              <ProcessFeedItem key={ref} projectId={projectId} refValue={ref} />
            ))}
          </ul>
        )}
      </div>

      {consultNoteRefs.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-panel-muted">采纳笔记（consult，未过 gate）</div>
          <ul className="mt-2 space-y-1">
            {consultNoteRefs.map((ref) => (
              <ConsultNoteRow key={ref} projectId={projectId} refValue={ref} />
            ))}
          </ul>
          <div className="mt-1 text-[10px] text-panel-muted/80">人工从对话采纳，未经 gate 校验，不计入证据覆盖。</div>
        </div>
      )}
    </aside>
  );
}
