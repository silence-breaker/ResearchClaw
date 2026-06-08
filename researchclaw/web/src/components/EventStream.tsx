import { useState } from "react";
import type { CliChunk, ProjectState } from "../api/types";
import { buildEventFeed, EVENT_FILTERS, EVENT_SOURCE_DOT, filterFeed, type EventSource } from "../lib/eventFeed";

// 实时事件流 (§5.2) + 最近事件 (§5.1): durable signals (OpenClaw / 系统) merged
// with live CLI activity (Claude), filterable by source. Process transparency —
// never a conclusion (两通道红线).
export function EventStream({ state, cliChunks = [] }: { state: ProjectState; cliChunks?: CliChunk[] }) {
  const [source, setSource] = useState<EventSource | "all">("all");
  const feed = filterFeed(buildEventFeed(state.signals ?? [], cliChunks), source).slice(0, 40);

  return (
    <section className="rounded-lg border border-panel-border bg-panel-surface">
      <div className="flex items-center gap-1 border-b border-panel-border px-2">
        <span className="mr-1 py-2 text-xs uppercase tracking-wide text-panel-muted">实时事件流</span>
        {EVENT_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setSource(f.id)}
            className={[
              "px-2 py-2 text-xs",
              source === f.id ? "border-b-2 border-accent text-accent" : "text-panel-muted hover:text-panel-text"
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="max-h-56 overflow-auto p-2">
        {feed.length === 0 ? (
          <p className="px-1 py-2 text-xs text-panel-muted">暂无事件。</p>
        ) : (
          <ul className="space-y-0.5">
            {feed.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-panel-bg">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_SOURCE_DOT[e.source]}`} />
                <span className="shrink-0 text-panel-text">{e.label}</span>
                <span className="flex-1 truncate text-panel-muted" title={e.detail}>
                  {e.detail}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-panel-muted/70" title={e.ts}>
                  {e.ts.slice(11, 19)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
