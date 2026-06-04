import { Link, useLocation } from "react-router-dom";
import type { ProjectState, ResearchPhase } from "../api/types";
import type { StreamStatus } from "../api/useProjectStream";

const PHASE_LABEL: Partial<Record<ResearchPhase, string>> = {
  idle: "空闲 / 已完成",
  intake: "接收中",
  contract_draft: "起草契约",
  contract_review: "契约待审",
  literature_scouting: "文献侦察",
  baseline_selection: "基线选择",
  baseline_reproduction_checklist: "复现清单",
  idea_generation: "想法生成",
  idea_review: "想法评审",
  summary: "总结",
  blocked: "需修订"
};

const NAV_ITEMS: { label: string; path: string }[] = [
  { label: "概览", path: "/" },
  { label: "研究工作流", path: "/" },
  { label: "设置", path: "/settings" }
];

const NAV_PLACEHOLDER = ["文献库", "实验管理", "记忆库"];

function elapsed(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function isActive(currentPath: string, navPath: string): boolean {
  if (navPath === "/") {
    return currentPath === "/" || currentPath === "/app/" || currentPath === "/app";
  }
  return currentPath === navPath || currentPath.startsWith(`${navPath}/`);
}

export function LeftColumn({ state, status }: { state?: ProjectState; status?: StreamStatus }) {
  const location = useLocation();
  const currentPath = location.pathname;
  const running = state && state.phase !== "idle" && state.phase !== "blocked";

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-4 border-r border-panel-border bg-panel-surface p-4">
      <div>
        <div className="text-sm font-semibold text-accent">OpenClaw Research</div>
        <div className="text-xs text-panel-muted">Time Series Lab</div>
      </div>

      <nav className="space-y-1 text-sm">
        {NAV_ITEMS.map((item) => {
          const active = isActive(currentPath, item.path);
          return (
            <Link
              key={item.label}
              to={item.path}
              className={[
                "block rounded px-2 py-1",
                active
                  ? "bg-panel-bg font-medium text-accent"
                  : "text-panel-text hover:bg-panel-bg"
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
        {NAV_PLACEHOLDER.map((item) => (
          <div
            key={item}
            className="cursor-not-allowed rounded px-2 py-1 text-panel-muted/60"
            title="后续版本"
          >
            {item}
          </div>
        ))}
      </nav>

      {state && (
        <div className="rounded-lg border border-panel-border bg-panel-bg p-3">
          <div className="text-xs text-panel-muted">当前研究</div>
          <div
            className="mt-1 truncate text-sm text-panel-text"
            title={state.current.research_direction}
          >
            {state.current.research_direction ?? state.project_id}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={running ? "text-accent-green" : "text-panel-muted"}>
              {PHASE_LABEL[state.phase] ?? state.phase}
            </span>
            <span className="text-panel-muted">{elapsed(state.created_at)}</span>
          </div>
        </div>
      )}

      <div className="mt-auto space-y-2">
        {status && (
          <div className="flex items-center gap-2 text-xs text-panel-muted">
            <span
              className={`h-2 w-2 rounded-full ${status === "live" ? "bg-accent-green" : "bg-accent-amber"}`}
            />
            {status === "live" ? "实时连接" : status === "polling" ? "轮询兜底" : "连接中"}
          </div>
        )}
        <Link to="/" className="block text-xs text-accent hover:underline">
          ← 返回项目列表
        </Link>
      </div>
    </aside>
  );
}
