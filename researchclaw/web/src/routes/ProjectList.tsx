import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchProjects } from "../api/client";
import type { ProjectSummary } from "../api/types";

function statusLabel(p: ProjectSummary): { text: string; cls: string } {
  if (p.phase === "blocked") return { text: "已终止（可回退）", cls: "text-accent-red" };
  if (p.phase === "idle") return { text: "已完成 / 空闲", cls: "text-panel-muted" };
  return { text: "运行中", cls: "text-accent-green" };
}

export function ProjectList() {
  const query = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold text-accent">ResearchClaw 控制台</h1>
      <p className="mt-1 text-sm text-panel-muted">选择一个研究项目进入实时面板。</p>

      {query.isLoading && <p className="mt-6 text-panel-muted">加载项目列表…</p>}
      {query.isError && <p className="mt-6 text-accent-red">无法加载项目（后端是否在 :8787 运行？）。</p>}

      <ul className="mt-6 space-y-2">
        {query.data?.length === 0 && <li className="text-panel-muted">暂无项目。</li>}
        {query.data?.map((p) => {
          const s = statusLabel(p);
          return (
            <li key={p.project_id}>
              <Link
                to={`/panel/${p.project_id}`}
                className="flex items-center justify-between rounded-lg border border-panel-border bg-panel-surface px-4 py-3 hover:border-accent"
              >
                <div>
                  <div className="text-sm text-panel-text">{p.project_id}</div>
                  <div className="text-xs text-panel-muted">{new Date(p.updated_at).toLocaleString()}</div>
                </div>
                <span className={`text-xs ${s.cls}`}>{s.text}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
