import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  archiveProject,
  deleteProject,
  fetchProjects,
  startProject,
  unarchiveProject
} from "../api/client";
import { makeProjectId, splitProjects } from "../lib/project";
import { ConfirmButton } from "../components/ConfirmButton";
import type { ProjectSummary } from "../api/types";

function statusLabel(p: ProjectSummary): { text: string; cls: string } {
  if (p.phase === "blocked") return { text: "已终止（可回退）", cls: "text-accent-red" };
  if (p.phase === "idle") return { text: "已完成 / 空闲", cls: "text-panel-muted" };
  return { text: "运行中", cls: "text-accent-green" };
}

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6);
}

function NewProjectForm() {
  const [direction, setDirection] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (text: string) => {
      const projectId = makeProjectId(text, randomSuffix());
      return startProject(projectId, text).then(() => projectId);
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/panel/${projectId}`);
    }
  });

  const trimmed = direction.trim();
  return (
    <form
      className="mt-6 rounded-lg border border-panel-border bg-panel-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) mutation.mutate(trimmed);
      }}
    >
      <label className="text-sm font-medium text-panel-text">新建研究</label>
      <p className="mt-0.5 text-xs text-panel-muted">
        输入研究方向，创建后引擎会起草研究契约并进入「契约待审」，由你批准或打回。
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder="例如：轻量级重排序提升领域内视觉-语言检索质量"
          className="flex-1 rounded border border-panel-border bg-panel-bg px-3 py-2 text-sm text-panel-text outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!trimmed || mutation.isPending}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-panel-bg hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? "创建中…" : "创建"}
        </button>
      </div>
      {mutation.isError && (
        <p className="mt-2 text-sm text-accent-red">创建失败：{(mutation.error as Error).message}</p>
      )}
    </form>
  );
}

function useProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] })
  });
}

function ActiveItem({ p, busy, onArchive }: { p: ProjectSummary; busy: boolean; onArchive: () => void }) {
  const s = statusLabel(p);
  return (
    <li className="flex items-center justify-between rounded-lg border border-panel-border bg-panel-surface px-4 py-3 hover:border-accent">
      <Link to={`/panel/${p.project_id}`} className="min-w-0 flex-1">
        <div className="truncate text-sm text-panel-text">{p.project_id}</div>
        <div className="text-xs text-panel-muted">{new Date(p.updated_at).toLocaleString()}</div>
      </Link>
      <div className="ml-3 flex shrink-0 items-center gap-2">
        <span className={`text-xs ${s.cls}`}>{s.text}</span>
        <ConfirmButton label="归档" confirmLabel="确认归档?" disabled={busy} onConfirm={onArchive} />
      </div>
    </li>
  );
}

function ArchivedItem({
  p,
  busy,
  onRestore,
  onDelete
}: {
  p: ProjectSummary;
  busy: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-panel-border bg-panel-bg px-4 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm text-panel-muted">{p.project_id}</div>
        <div className="text-xs text-panel-muted/70">{new Date(p.updated_at).toLocaleString()}</div>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2">
        <ConfirmButton label="恢复" confirmLabel="确认恢复?" disabled={busy} onConfirm={onRestore} />
        <ConfirmButton label="彻底删除" confirmLabel="不可恢复，确认删除?" danger disabled={busy} onConfirm={onDelete} />
      </div>
    </li>
  );
}

export function ProjectList() {
  const query = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const mutation = useProjectMutation();
  const busy = mutation.isPending;
  const [showArchived, setShowArchived] = useState(false);

  const { active, archived } = splitProjects(query.data ?? []);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold text-accent">ResearchClaw 控制台</h1>
      <p className="mt-1 text-sm text-panel-muted">选择一个研究项目进入实时面板，或新建一个研究。</p>

      <NewProjectForm />

      {query.isLoading && <p className="mt-6 text-panel-muted">加载项目列表…</p>}
      {query.isError && <p className="mt-6 text-accent-red">无法加载项目（后端是否在 :8787 运行？）。</p>}

      <ul className="mt-6 space-y-2">
        {active.length === 0 && !query.isLoading && <li className="text-panel-muted">暂无活跃项目。</li>}
        {active.map((p) => (
          <ActiveItem
            key={p.project_id}
            p={p}
            busy={busy}
            onArchive={() => mutation.mutate(() => archiveProject(p.project_id))}
          />
        ))}
      </ul>

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-sm text-panel-muted hover:text-panel-text"
          >
            {showArchived ? "▾" : "▸"} 已归档（{archived.length}）
          </button>
          {showArchived && (
            <>
              <p className="mt-1 text-xs text-panel-muted/70">归档只是隐藏，文件仍保留，可恢复；「彻底删除」不可恢复。</p>
              <ul className="mt-2 space-y-2">
                {archived.map((p) => (
                  <ArchivedItem
                    key={p.project_id}
                    p={p}
                    busy={busy}
                    onRestore={() => mutation.mutate(() => unarchiveProject(p.project_id))}
                    onDelete={() => mutation.mutate(() => deleteProject(p.project_id))}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {mutation.isError && (
        <p className="mt-3 text-sm text-accent-red">操作失败：{(mutation.error as Error).message}</p>
      )}
    </div>
  );
}
