import { useEffect, useState } from "react";
import { LeftColumn } from "../components/LeftColumn";
import { useSettingsStore } from "../stores/settings";
import type { AppSettings } from "../lib/settings";

const CATEGORIES = [
  { id: "general", label: "通用", icon: "⚙️" },
  { id: "model", label: "模型配置", icon: "🖥️" },
  { id: "notifications", label: "通知", icon: "🔔" },
  { id: "integrations", label: "集成", icon: "⚡" },
  { id: "account", label: "账户", icon: "👤" }
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

export function SettingsPage() {
  const [category, setCategory] = useState<CategoryId>("general");

  return (
    <div className="flex min-h-screen">
      <LeftColumn />

      <main className="flex flex-1 gap-4 overflow-auto p-5">
        {/* 左侧设置分类菜单 */}
        <section className="flex w-56 shrink-0 flex-col gap-1">
          <h1 className="mb-2 text-xl font-semibold text-panel-text">系统设置</h1>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={[
                "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                category === c.id
                  ? "bg-panel-bg font-medium text-accent"
                  : "text-panel-text hover:bg-panel-bg/60"
              ].join(" ")}
            >
              <span>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </section>

        {/* 右侧设置内容区 */}
        <section className="flex-1 rounded-lg border border-panel-border bg-panel-surface p-5">
          {category === "general" && <GeneralSettings />}
          {category === "model" && <ModelSettingsPlaceholder />}
          {category === "notifications" && <PlaceholderSettings title="通知" />}
          {category === "integrations" && <PlaceholderSettings title="集成" />}
          {category === "account" && <PlaceholderSettings title="账户" />}
        </section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-panel-text">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  description,
  children
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm text-panel-text">{label}</div>
        {description && <div className="text-xs text-panel-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralSettings() {
  const { settings, update, reset } = useSettingsStore();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Sync draft when persisted settings change externally.
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  const patch = (p: Partial<AppSettings>) => setDraft((d) => ({ ...d, ...p }));

  const handleSave = () => {
    update(draft);
    setSavedMsg("已保存");
    setTimeout(() => setSavedMsg(null), 1500);
  };

  const handleCancel = () => {
    setDraft(settings);
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-panel-text">通用</h2>

      <Section title="语言与区域">
        <Field label="界面语言" description="设置系统界面的显示语言">
          <select
            value={draft.language}
            onChange={(e) => patch({ language: e.target.value as AppSettings["language"] })}
            className="rounded border border-panel-border bg-panel-bg px-3 py-1.5 text-sm text-panel-text outline-none focus:border-accent"
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label="时区" description="所有时间戳将按此时区显示">
          <select
            disabled
            className="cursor-not-allowed rounded border border-panel-border bg-panel-bg px-3 py-1.5 text-sm text-panel-muted/70"
          >
            <option>(UTC+8) 北京，上海，香港，台北</option>
          </select>
        </Field>
        <Field label="日期格式">
          <div className="flex gap-3 text-sm text-panel-text">
            {(["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"] as const).map((fmt) => (
              <label key={fmt} className="flex cursor-pointer items-center gap-1">
                <input
                  type="radio"
                  name="dateFormat"
                  value={fmt}
                  checked={draft.dateFormat === fmt}
                  onChange={() => patch({ dateFormat: fmt })}
                  className="accent-accent"
                />
                {fmt}
              </label>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="外观主题">
        <Field label="主题模式">
          <div className="flex gap-2">
            {[
              { key: "light", label: "浅色" },
              { key: "dark", label: "深色" },
              { key: "system", label: "跟随系统" }
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => patch({ theme: m.key as AppSettings["theme"] })}
                className={[
                  "rounded border px-3 py-1.5 text-xs",
                  draft.theme === m.key
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-panel-border bg-panel-bg text-panel-text hover:border-accent"
                ].join(" ")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="界面字体大小" description={`当前: ${draft.fontSize}px`}>
          <input
            type="range"
            min={12}
            max={18}
            value={draft.fontSize}
            onChange={(e) => patch({ fontSize: Number(e.target.value) })}
            className="w-32 accent-accent"
          />
        </Field>
        <Field label="界面密度">
          <div className="flex gap-2 text-xs">
            {(["compact", "comfortable", "spacious"] as const).map((d) => (
              <button
                key={d}
                onClick={() => patch({ density: d })}
                className={[
                  "rounded border px-2 py-1",
                  draft.density === d
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-panel-border bg-panel-bg text-panel-text hover:border-accent"
                ].join(" ")}
              >
                {d === "compact" ? "紧凑" : d === "comfortable" ? "舒适" : "宽松"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="代码块字体">
          <select
            value={draft.codeFont}
            onChange={(e) => patch({ codeFont: e.target.value as AppSettings["codeFont"] })}
            className="rounded border border-panel-border bg-panel-bg px-3 py-1.5 text-sm text-panel-text outline-none focus:border-accent"
          >
            <option value="JetBrains Mono">JetBrains Mono</option>
            <option value="Fira Code">Fira Code</option>
            <option value="SF Mono">SF Mono</option>
          </select>
        </Field>
        <Field label="强调色">
          <div className="flex gap-2">
            {([
              { key: "blue", color: "#58a6ff" },
              { key: "cyan", color: "#22d3ee" },
              { key: "pink", color: "#f472b6" },
              { key: "orange", color: "#fb923c" },
              { key: "green", color: "#4ade80" }
            ] as const).map((c) => (
              <button
                key={c.key}
                onClick={() => patch({ accentColor: c.key })}
                title={c.key}
                className={[
                  "h-6 w-6 rounded-full border-2",
                  draft.accentColor === c.key ? "border-panel-text" : "border-transparent"
                ].join(" ")}
                style={{ backgroundColor: c.color }}
              />
            ))}
          </div>
        </Field>
      </Section>

      <div className="sticky bottom-0 mt-4 flex items-center justify-end gap-2 border-t border-panel-border bg-panel-surface pt-3">
        {hasChanges ? (
          <span className="mr-auto text-xs text-accent-amber">有未保存的更改</span>
        ) : savedMsg ? (
          <span className="mr-auto text-xs text-accent-green">{savedMsg}</span>
        ) : (
          <span className="mr-auto text-xs text-panel-muted">已同步到本地存储</span>
        )}
        <button
          onClick={handleCancel}
          disabled={!hasChanges}
          className="rounded border border-panel-border px-4 py-1.5 text-sm text-panel-text hover:bg-panel-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-panel-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存更改
        </button>
        <button
          onClick={reset}
          className="rounded border border-accent-amber/50 px-3 py-1.5 text-xs text-accent-amber hover:bg-accent-amber/10"
        >
          恢复默认
        </button>
      </div>
    </div>
  );
}

function ModelSettingsPlaceholder() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-panel-text">模型配置</h2>
      <div className="rounded border border-panel-border bg-panel-bg p-4">
        <p className="text-sm text-panel-muted">模型配置将在 M2 接入真实 CLI 后开放。</p>
        <div className="mt-4 space-y-4 opacity-50">
          <Field label="默认模型">
            <select
              disabled
              className="cursor-not-allowed rounded border border-panel-border bg-panel-bg px-3 py-1.5 text-sm"
            >
              <option>claude-haiku-4-5（默认）</option>
            </select>
          </Field>
          <Field label="单次最大 token">
            <input type="range" disabled min={1024} max={8192} className="w-32" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function PlaceholderSettings({ title }: { title: string }) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-panel-text">{title}</h2>
      <div className="rounded border border-panel-border bg-panel-bg p-4 text-sm text-panel-muted">
        该模块将在后续版本开放，当前为占位界面。
      </div>
    </div>
  );
}
