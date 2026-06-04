import { useEffect, useState } from "react";
import { LeftColumn } from "../components/LeftColumn";
import { ProfileSettings } from "../components/ProfileSettings";
import { useSettingsStore } from "../stores/settings";
import type { AppSettings } from "../lib/settings";

/* ── Category definitions ── */

interface CategoryDef {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: "profile", label: "个人资料与账户", icon: "👤", description: "管理头像、昵称、账户切换和登出" },
  { id: "general", label: "通用", icon: "⚙️", description: "语言、时区、文件路径、自动保存、启动选项" },
  { id: "appearance", label: "外观", icon: "🎨", description: "主题、字体、密度、代码字体、强调色" },
  { id: "model", label: "模型", icon: "🖥️", description: "默认模型、Token 限制、工具白名单" },
  { id: "notifications", label: "通知", icon: "🔔", description: "邮件提醒、浏览器通知、静音时段" },
  { id: "security", label: "安全", icon: "🔒", description: "API 密钥、双因素认证、会话管理" },
  { id: "accessibility", label: "辅助功能", icon: "♿", description: "减少动画、高对比度、屏幕阅读器优化" },
  { id: "system", label: "系统", icon: "💻", description: "版本信息、缓存清理、恢复默认、快捷键" }
];

type CategoryId = (typeof CATEGORIES)[number]["id"];

/* ── Card component ── */

function CategoryCard({
  icon,
  label,
  description,
  onClick
}: {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-lg border border-panel-border bg-panel-bg p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md"
    >
      <span className="text-xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-panel-text">{label}</div>
        <div className="text-xs text-panel-muted">{description}</div>
      </div>
      <svg
        className="h-5 w-5 text-panel-muted transition-colors group-hover:text-accent"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/* ── Breadcrumb ── */

function Breadcrumb({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      <button
        onClick={onBack}
        className="flex items-center gap-1 rounded p-1 text-sm text-panel-muted hover:bg-panel-bg hover:text-panel-text transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </button>
      <span className="text-panel-muted">/</span>
      <span className="text-sm font-semibold text-panel-text">{label}</span>
    </div>
  );
}

/* ── Page shell ── */

export function SettingsPage() {
  const [view, setView] = useState<"home" | "detail">("home");
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);

  const enterCategory = (id: CategoryId) => {
    setActiveCategory(id);
    setView("detail");
  };

  const goHome = () => {
    setView("home");
    setActiveCategory(null);
  };

  const activeDef = CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div className="flex min-h-screen">
      <LeftColumn />

      <main className="flex-1 overflow-auto p-5">
        {view === "home" ? (
          <div className="mx-auto max-w-2xl">
            <h1 className="mb-6 text-2xl font-semibold text-panel-text">系统设置</h1>
            <div className="flex flex-col gap-3">
              {CATEGORIES.map((c) => (
                <CategoryCard
                  key={c.id}
                  icon={c.icon}
                  label={c.label}
                  description={c.description}
                  onClick={() => enterCategory(c.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            {activeDef && <Breadcrumb label={activeDef.label} onBack={goHome} />}
            <div className="rounded-lg border border-panel-border bg-panel-surface p-5">
              {activeCategory === "general" && <GeneralSettings />}
              {activeCategory === "model" && <PlaceholderSettings description="模型选择、Token 限制、工具白名单等配置将在 M2 接入真实 CLI 后开放。" />}
              {activeCategory === "notifications" && <PlaceholderSettings />}
              {activeCategory === "profile" && <ProfileSettings />}
              {activeCategory === "appearance" && <AppearanceSettings />}
              {activeCategory === "security" && <PlaceholderSettings />}
              {activeCategory === "accessibility" && <AccessibilitySettings />}
              {activeCategory === "system" && <SystemSettings />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Shared UI primitives ── */

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

function ToggleField({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm text-panel-text">{label}</div>
        {description && <div className="text-xs text-panel-muted">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-panel-border"
        ].join(" ")}
        aria-pressed={checked}
      >
        <span
          className={[
            "inline-block h-4 w-4 transform rounded-full bg-panel-bg transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          ].join(" ")}
          style={{ marginTop: "2px" }}
        />
      </button>
    </div>
  );
}

function SaveBar({
  hasChanges,
  savedMsg,
  onSave,
  onCancel,
  onReset
}: {
  hasChanges: boolean;
  savedMsg: string | null;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  return (
    <div className="sticky bottom-0 mt-4 flex items-center justify-end gap-2 border-t border-panel-border bg-panel-surface pt-3">
      {hasChanges ? (
        <span className="mr-auto text-xs text-accent-amber">有未保存的更改</span>
      ) : savedMsg ? (
        <span className="mr-auto text-xs text-accent-green">{savedMsg}</span>
      ) : (
        <span className="mr-auto text-xs text-panel-muted">已同步到本地存储</span>
      )}
      <button
        onClick={onCancel}
        disabled={!hasChanges}
        className="rounded border border-panel-border px-4 py-1.5 text-sm text-panel-text hover:bg-panel-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        取消
      </button>
      <button
        onClick={onSave}
        disabled={!hasChanges}
        className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-panel-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        保存更改
      </button>
      <button
        onClick={onReset}
        className="rounded border border-accent-amber/50 px-3 py-1.5 text-xs text-accent-amber hover:bg-accent-amber/10"
      >
        恢复默认
      </button>
    </div>
  );
}

/* ── Category: General ── */

const TIMEZONES = [
  { value: "Asia/Shanghai", label: "(UTC+8) 北京，上海，香港，台北" },
  { value: "Asia/Tokyo", label: "(UTC+9) 东京，首尔" },
  { value: "Europe/London", label: "(UTC+0) 伦敦" },
  { value: "Europe/Paris", label: "(UTC+1) 巴黎，柏林" },
  { value: "America/New_York", label: "(UTC-5) 纽约" },
  { value: "America/Los_Angeles", label: "(UTC-8) 洛杉矶" },
  { value: "Australia/Sydney", label: "(UTC+10) 悉尼" }
];

const AUTO_SAVE_OPTIONS: { value: AppSettings["autoSaveInterval"]; label: string }[] = [
  { value: "off", label: "关闭" },
  { value: "30s", label: "30 秒" },
  { value: "1m", label: "1 分钟" },
  { value: "5m", label: "5 分钟" }
];

const STARTUP_OPTIONS: { value: AppSettings["startupPage"]; label: string }[] = [
  { value: "projects", label: "项目列表" },
  { value: "last", label: "继续上次" },
  { value: "blank", label: "空白工作台" }
];

function GeneralSettings() {
  const { settings, update, reset } = useSettingsStore();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => setDraft(settings), [settings]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);
  const patch = (p: Partial<AppSettings>) => setDraft((d) => ({ ...d, ...p }));

  const handleSave = () => {
    update(draft);
    setSavedMsg("已保存");
    setTimeout(() => setSavedMsg(null), 1500);
  };

  return (
    <div>
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
            value={draft.timezone}
            onChange={(e) => patch({ timezone: e.target.value })}
            className="rounded border border-panel-border bg-panel-bg px-3 py-1.5 text-sm text-panel-text outline-none focus:border-accent"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
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

      <Section title="文件与导出">
        <Field label="默认导出路径" description="研究报告和资料的默认保存位置">
          <input
            type="text"
            value={draft.defaultExportPath}
            onChange={(e) => patch({ defaultExportPath: e.target.value })}
            className="w-64 rounded border border-panel-border bg-panel-bg px-3 py-1.5 text-sm text-panel-text outline-none focus:border-accent"
            placeholder="~/ResearchClaw/Exports"
          />
        </Field>
        <Field label="自动保存间隔" description="研究项目自动保存的频率">
          <div className="flex gap-2 text-xs">
            {AUTO_SAVE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => patch({ autoSaveInterval: opt.value })}
                className={[
                  "rounded border px-2.5 py-1.5",
                  draft.autoSaveInterval === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-panel-border bg-panel-bg text-panel-text hover:border-accent"
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="启动与行为">
        <Field label="启动页面" description="打开应用时默认显示的页面">
          <select
            value={draft.startupPage}
            onChange={(e) => patch({ startupPage: e.target.value as AppSettings["startupPage"] })}
            className="rounded border border-panel-border bg-panel-bg px-3 py-1.5 text-sm text-panel-text outline-none focus:border-accent"
          >
            {STARTUP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <ToggleField
          label="删除前确认"
          description="删除项目或数据前显示确认对话框"
          checked={draft.confirmBeforeDelete}
          onChange={(v) => patch({ confirmBeforeDelete: v })}
        />
      </Section>

      <SaveBar
        hasChanges={hasChanges}
        savedMsg={savedMsg}
        onSave={handleSave}
        onCancel={() => setDraft(settings)}
        onReset={reset}
      />
    </div>
  );
}

/* ── Category: Appearance ── */

function AppearanceSettings() {
  const { settings, update, reset } = useSettingsStore();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => setDraft(settings), [settings]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);
  const patch = (p: Partial<AppSettings>) => setDraft((d) => ({ ...d, ...p }));

  const handleSave = () => {
    update(draft);
    setSavedMsg("已保存");
    setTimeout(() => setSavedMsg(null), 1500);
  };

  return (
    <div>
      <Section title="主题">
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
      </Section>

      <Section title="字体与排版">
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
      </Section>

      <Section title="颜色">
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

      <SaveBar
        hasChanges={hasChanges}
        savedMsg={savedMsg}
        onSave={handleSave}
        onCancel={() => setDraft(settings)}
        onReset={reset}
      />
    </div>
  );
}

/* ── Category: Accessibility ── */

function AccessibilitySettings() {
  const { settings, update, reset } = useSettingsStore();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => setDraft(settings), [settings]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);
  const patch = (p: Partial<AppSettings>) => setDraft((d) => ({ ...d, ...p }));

  const handleSave = () => {
    update(draft);
    setSavedMsg("已保存");
    setTimeout(() => setSavedMsg(null), 1500);
  };

  return (
    <div>
      <Section title="视觉">
        <ToggleField
          label="减少动画"
          description="减弱界面过渡动画效果"
          checked={draft.reduceMotion}
          onChange={(v) => patch({ reduceMotion: v })}
        />
        <ToggleField
          label="高对比度"
          description="增强文本与背景的对比度"
          checked={draft.highContrast}
          onChange={(v) => patch({ highContrast: v })}
        />
        <ToggleField
          label="屏幕阅读器优化"
          description="优化 ARIA 标签和焦点顺序"
          checked={draft.screenReaderOptimized}
          onChange={(v) => patch({ screenReaderOptimized: v })}
        />
        <ToggleField
          label="焦点指示器"
          description="始终显示清晰的键盘焦点轮廓"
          checked={draft.focusIndicator}
          onChange={(v) => patch({ focusIndicator: v })}
        />
      </Section>

      <SaveBar
        hasChanges={hasChanges}
        savedMsg={savedMsg}
        onSave={handleSave}
        onCancel={() => setDraft(settings)}
        onReset={reset}
      />
    </div>
  );
}

/* ── Category: System ── */

function SystemSettings() {
  const { reset } = useSettingsStore();
  const [cleared, setCleared] = useState(false);

  const handleClearCache = () => {
    setCleared(true);
    setTimeout(() => setCleared(false), 1500);
  };

  return (
    <div>
      <Section title="关于">
        <Field label="OpenClaw Research" description="版本 v2.1.0">
          <span className="text-sm text-panel-muted">研究助手 · M1 阶段</span>
        </Field>
      </Section>

      <Section title="维护">
        <Field label="缓存清理" description="清除本地缓存数据，不影响项目数据">
          <button
            onClick={handleClearCache}
            className="rounded border border-panel-border px-3 py-1.5 text-sm text-panel-text hover:bg-panel-bg"
          >
            {cleared ? "已清理" : "立即清理"}
          </button>
        </Field>
        <Field label="恢复默认设置" description="将所有设置重置为出厂默认值">
          <button
            onClick={reset}
            className="rounded border border-accent-amber/50 px-3 py-1.5 text-sm text-accent-amber hover:bg-accent-amber/10"
          >
            恢复默认
          </button>
        </Field>
      </Section>

      <Section title="高级">
        <Field label="导入/导出设置" description="备份或恢复设置配置">
          <div className="flex gap-2">
            <button
              disabled
              className="rounded border border-panel-border px-3 py-1.5 text-sm text-panel-muted disabled:cursor-not-allowed"
            >
              导出
            </button>
            <button
              disabled
              className="rounded border border-panel-border px-3 py-1.5 text-sm text-panel-muted disabled:cursor-not-allowed"
            >
              导入
            </button>
          </div>
        </Field>
        <Field label="快捷键" description="自定义键盘快捷键">
          <button
            disabled
            className="rounded border border-panel-border px-3 py-1.5 text-sm text-panel-muted disabled:cursor-not-allowed"
          >
            查看快捷键
          </button>
        </Field>
      </Section>
    </div>
  );
}

/* ── Placeholder ── */

function PlaceholderSettings({ description }: { description?: string }) {
  return (
    <div className="rounded border border-panel-border bg-panel-bg p-4 text-sm text-panel-muted">
      {description ?? "该模块将在后续版本开放，当前为占位界面。"}
    </div>
  );
}
