import { useState } from "react";
import type { CliChunk, ProjectState } from "../api/types";
import { ActionBar } from "./ActionBar";
import { MetricsRow } from "./MetricsRow";
import { PipelineProgress } from "./PipelineProgress";
import { ContractTab } from "./ContractTab";
import { PhaseStatusTab } from "./PhaseStatusTab";
import { EvidenceMapTab } from "./EvidenceMapTab";
import { ChangeHistoryTab } from "./ChangeHistoryTab";
import { EventStream } from "./EventStream";
import { CurrentPhaseCard } from "./CurrentPhaseCard";

type TabId = "contract" | "phase_status" | "evidence_map" | "change_history";

const TABS: { id: TabId; label: string }[] = [
  { id: "contract", label: "研究契约" },
  { id: "phase_status", label: "阶段状态" },
  { id: "evidence_map", label: "证据映射" },
  { id: "change_history", label: "变更历史" }
];

export function CenterColumn({ state, cliChunks = [] }: { state: ProjectState; cliChunks?: CliChunk[] }) {
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
      <CurrentPhaseCard state={state} />

      <section className="rounded-lg border border-panel-border bg-panel-surface">
        <div className="flex gap-1 border-b border-panel-border px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "px-3 py-2 text-sm hover:text-panel-text",
                tab === t.id ? "border-b-2 border-accent text-accent" : "text-panel-muted"
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === "contract" && <ContractTab state={state} />}
          {tab === "phase_status" && <PhaseStatusTab state={state} />}
          {tab === "evidence_map" && <EvidenceMapTab state={state} />}
          {tab === "change_history" && <ChangeHistoryTab state={state} />}
        </div>
      </section>

      <EventStream state={state} cliChunks={cliChunks} />
    </main>
  );
}
