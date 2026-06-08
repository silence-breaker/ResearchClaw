import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { archiveProject, recoverProject } from "../api/client";
import type { CliChunk, HealthStatus, ProjectState, ProjectSummary } from "../api/types";
import type { StreamStatus } from "../api/useProjectStream";
import { buildEventFeed, EVENT_FILTERS, EVENT_SOURCE_DOT, filterFeed, type EventSource } from "../lib/eventFeed";
import { phaseLabel } from "../lib/phase";
import { splitProjects } from "../lib/project";
import { ConfirmButton } from "./ConfirmButton";

const NAV_ITEMS: { label: string; path: string }[] = [
  { label: "概览", path: "/" },
  { label: "研究工作流", path: "/" },
  { label: "设置", path: "/settings" }
];

const NAV_PLACEHOLDER = ["文献库", "实验管理", "记忆库"];

type HealthView = {
  data?: HealthStatus;
  isLoading?: boolean;
  isError?: boolean;
};

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

function GatewayStatus({ health }: { health?: HealthView }) {
  const state = health?.isError ? "error" : health?.data?.ok ? "ok" : "checking";
  const dot = state === "ok" ? "bg-accent-green" : state === "error" ? "bg-accent-red" : "bg-accent-amber";
  const label = state === "ok" ? "Gateway 正常" : state === "error" ? "Gateway 异常" : "Gateway 检查中";
  return (
    <div className="rounded-lg border border-panel-border bg-panel-bg p-3 text-xs">
      <div className="flex items-center gap-2 text-panel-text">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-1 text-panel-muted">
        {health?.data?.service ?? "researchclaw"}
        {typeof health?.data?.projects === "number" ? ` · ${health.data.projects} projects` : ""}
      </div>
    </div>
  );
}

function WorkspaceSwitcher() {
  return (
    <div>
      <div className="text-sm font-semibold text-accent">OpenClaw Research</div>
      <button
        type="button"
        disabled
        title="第二版当前为单工作空间配置"
        className="mt-2 w-full rounded border border-panel-border bg-panel-bg px-2 py-1.5 text-left text-xs text-panel-text disabled:cursor-not-allowed disabled:opacity-80"
      >
        <span className="block font-medium">默认工作区</span>
        <span className="text-panel-muted">Time Series Lab · 单工作空间</span>
      </button>
    </div>
  );
}

function RecentEvents({ state, cliChunks }: { state: ProjectState; cliChunks: CliChunk[] }) {
  const [source, setSource] = useState<EventSource | "all">("all");
  const feed = useMemo(
    () => filterFeed(buildEventFeed(state.signals ?? [], cliChunks), source).slice(0, 6),
    [state.signals, cliChunks, source]
  );

  return (
    <div className="rounded-lg border border-panel-border bg-panel-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-panel-text">最近事件</div>
        <div className="flex gap-1">
          {EVENT_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSource(f.id)}
              className={["rounded px-1 py-0.5 text-[10px]", source === f.id ? "bg-accent text-panel-bg" : "text-panel-muted hover:text-panel-text"].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {feed.length === 0 ? (
        <p className="mt-2 text-xs text-panel-muted">暂无事件。</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {feed.map((e) => (
            <li key={e.id} className="flex items-center gap-1.5 text-xs">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_SOURCE_DOT[e.source]}`} />
              <span className="shrink-0 text-panel-text">{e.label}</span>
              <span className="min-w-0 flex-1 truncate text-panel-muted" title={e.detail}>{e.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryList({ currentId, projects }: { currentId: string; projects: ProjectSummary[] }) {
  const { active, archived } = splitProjects(projects);
  const visible = active.filter((p) => p.project_id !== currentId).slice(0, 5);
  const archivedVisible = archived.slice(0, 3);

  return (
    <div className="rounded-lg border border-panel-border bg-panel-bg p-3">
      <div className="mb-2 text-xs font-medium text-panel-text">历史研究</div>
      {visible.length === 0 && archivedVisible.length === 0 ? (
        <p className="text-xs text-panel-muted">暂无其他项目。</p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((p) => (
            <li key={p.project_id}>
              <Link to={`/panel/${p.project_id}`} className="block rounded px-1 py-1 hover:bg-panel-surface">
                <div className="truncate text-xs text-panel-text" title={p.project_id}>{p.project_id}</div>
                <div className={p.phase === "blocked" ? "text-[10px] text-accent-red" : "text-[10px] text-panel-muted"}>
                  {p.phase === "blocked" ? "已终止 · 进入后可回退" : phaseLabel(p.phase)}
                </div>
              </Link>
            </li>
          ))}
          {archivedVisible.map((p) => (
            <li key={p.project_id}>
              <Link to={`/panel/${p.project_id}`} className="block rounded px-1 py-1 text-panel-muted hover:bg-panel-surface">
                <div className="truncate text-xs" title={p.project_id}>{p.project_id}</div>
                <div className="text-[10px] text-panel-muted/70">已归档 · 列表页可恢复</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/" className="mt-2 block text-xs text-accent hover:underline">查看全部项目</Link>
    </div>
  );
}

export function LeftColumn({
  state,
  status,
  cliChunks = [],
  projects = [],
  health
}: {
  state?: ProjectState;
  status?: StreamStatus;
  cliChunks?: CliChunk[];
  projects?: ProjectSummary[];
  health?: HealthView;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentPath = location.pathname;
  const running = state && state.phase !== "idle" && state.phase !== "blocked";

  const archive = useMutation({
    mutationFn: (projectId: string) => archiveProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/");
    }
  });

  const recover = useMutation({
    mutationFn: () => recoverProject(state?.project_id ?? "", { to: state?.block?.retreat_to }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-panel-border bg-panel-surface p-4">
      <WorkspaceSwitcher />

      <nav className="space-y-1 text-sm">
        {NAV_ITEMS.map((item) => {
          const active = isActive(currentPath, item.path);
          return (
            <Link
              key={item.label}
              to={item.path}
              className={[
                "block rounded px-2 py-1",
                active ? "bg-panel-bg font-medium text-accent" : "text-panel-text hover:bg-panel-bg"
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
        {NAV_PLACEHOLDER.map((item) => (
          <div key={item} className="cursor-not-allowed rounded px-2 py-1 text-panel-muted/60" title="后续版本">
            {item}
          </div>
        ))}
      </nav>

      <GatewayStatus health={health} />

      {state && (
        <div className="rounded-lg border border-panel-border bg-panel-bg p-3">
          <div className="text-xs text-panel-muted">当前研究</div>
          <div className="mt-1 truncate text-sm text-panel-text" title={state.current.research_direction}>
            {state.current.research_direction ?? state.project_id}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={running ? "text-accent-green" : state.phase === "blocked" ? "text-accent-red" : "text-panel-muted"}>
              {phaseLabel(state.phase)}
            </span>
            <span className="text-panel-muted">{elapsed(state.created_at)}</span>
          </div>
          {state.phase === "blocked" && (
            <button
              type="button"
              disabled={recover.isPending}
              onClick={() => recover.mutate()}
              className="mt-2 w-full rounded border border-accent-red/40 px-2 py-1 text-xs text-accent-red hover:bg-panel-surface disabled:opacity-50"
            >
              {recover.isPending ? "回退中…" : `就地 recover${state.block?.retreat_to ? ` → ${phaseLabel(state.block.retreat_to)}` : ""}`}
            </button>
          )}
          {recover.isError && <p className="mt-1 text-xs text-accent-red">recover 失败：{(recover.error as Error).message}</p>}
        </div>
      )}

      {state && <RecentEvents state={state} cliChunks={cliChunks} />}
      {state && <HistoryList currentId={state.project_id} projects={projects} />}

      <div className="mt-auto space-y-2">
        {status && (
          <div className="flex items-center gap-2 text-xs text-panel-muted">
            <span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-accent-green" : "bg-accent-amber"}`} />
            {status === "live" ? "实时连接" : status === "polling" ? "轮询兜底" : "连接中"}
          </div>
        )}
        <Link to="/" className="block text-xs text-accent hover:underline">
          ← 返回项目列表
        </Link>
        {state && (
          <ConfirmButton
            label="归档此项目"
            confirmLabel="确认归档?（可在列表恢复）"
            disabled={archive.isPending}
            onConfirm={() => archive.mutate(state.project_id)}
            className="w-full"
          />
        )}
      </div>
    </aside>
  );
}
