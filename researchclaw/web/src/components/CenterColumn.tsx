import { useState } from "react";
import type { ProjectState } from "../api/types";
import { ActionBar } from "./ActionBar";
import { MetricsRow } from "./MetricsRow";
import { PipelineProgress } from "./PipelineProgress";
import { ContractTab } from "./ContractTab";

type TabId = "contract" | "phase_status" | "evidence_map" | "change_history";

const TABS: { id: TabId; label: string; ready: boolean }[] = [
  { id: "contract", label: "研究契约", ready: true },
  { id: "phase_status", label: "阶段状态", ready: false },
  { id: "evidence_map", label: "证据映射", ready: false },
  { id: "change_history", label: "变更历史", ready: false }
];

export function CenterColumn({ state }: { state: ProjectState }) {
  const [tab, setTab] = useState<TabId>("contract");

  return (
    <main className="flex-1 space-y-4 overflow-auto p-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-panel-text">{state.project_id}</h1>
          <div className="text-xs text-panel-muted">phase: {state.phase}</div>
        </div>
      </header>

      <ActionBar state={state} />
      <MetricsRow state={state} />
      <PipelineProgress state={state} />

      <section className="rounded-lg border border-panel-border bg-panel-surface">
        <div className="flex gap-1 border-b border-panel-border px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => t.ready && setTab(t.id)}
              disabled={!t.ready}
              className={[
                "px-3 py-2 text-sm",
                tab === t.id ? "border-b-2 border-accent text-accent" : "text-panel-muted",
                t.ready ? "hover:text-panel-text" : "cursor-not-allowed opacity-50"
              ].join(" ")}
              title={t.ready ? undefined : "M1.4 接入"}
            >
              {t.label}
              {!t.ready && <span className="ml-1 text-[10px]">·M1.4</span>}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === "contract" ? (
            <ContractTab state={state} />
          ) : (
            <p className="text-sm text-panel-muted">该 Tab 将在 M1.4 接入真实数据。</p>
          )}
        </div>
      </section>
    </main>
  );
}
