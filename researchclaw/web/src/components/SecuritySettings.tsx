import { useState } from "react";
import { useSecurityStore } from "../stores/security";
import { maskKey, validatePasswordChange } from "../lib/security";

/* ── Section helpers ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-base font-bold text-panel-text border-l-2 border-accent pl-3">{title}</h2>
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
        <div className="text-sm font-medium text-panel-text">{label}</div>
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
        <div className="text-sm font-medium text-panel-text">{label}</div>
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

/* ── Password Section ── */

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    const err = validatePasswordChange(current, newPwd, confirm);
    if (err) {
      setError(err);
      return;
    }
    // TODO(M3): POST /api/v1/auth/password { current, new: newPwd }
    setError(null);
    setSuccess(true);
    setCurrent("");
    setNewPwd("");
    setConfirm("");
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <Section title="修改密码">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-panel-muted">当前密码</label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded border border-panel-border bg-panel-bg px-3 py-2 text-sm text-panel-text outline-none focus:border-accent"
            placeholder="输入当前密码"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-panel-muted">新密码</label>
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            className="w-full rounded border border-panel-border bg-panel-bg px-3 py-2 text-sm text-panel-text outline-none focus:border-accent"
            placeholder="至少 8 位，包含字母和数字"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-panel-muted">确认新密码</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded border border-panel-border bg-panel-bg px-3 py-2 text-sm text-panel-text outline-none focus:border-accent"
            placeholder="再次输入新密码"
          />
        </div>
        {error && <div className="text-xs text-red-400">{error}</div>}
        {success && <div className="text-xs text-accent-green">密码修改成功</div>}
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-panel-bg hover:opacity-90"
        >
          修改密码
        </button>
      </form>
    </Section>
  );
}

/* ── API Keys Section ── */

function ApiKeyRow({ keyItem }: { keyItem: { id: string; name: string; key: string; createdAt: string; lastUsed?: string } }) {
  const { revokeApiKey, regenerateApiKey } = useSecurityStore();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyItem.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-lg border border-panel-border bg-panel-bg p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-panel-text">{keyItem.name}</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded bg-panel-surface px-2 py-0.5 text-xs text-panel-muted">
              {revealed ? keyItem.key : maskKey(keyItem.key)}
            </code>
            <button
              onClick={() => setRevealed(!revealed)}
              className="text-xs text-accent hover:underline"
            >
              {revealed ? "隐藏" : "显示"}
            </button>
            <button
              onClick={handleCopy}
              className="text-xs text-accent hover:underline"
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
          <div className="mt-1 text-xs text-panel-muted">
            创建于 {keyItem.createdAt}
            {keyItem.lastUsed && ` · 最后使用 ${keyItem.lastUsed}`}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirm("确定要重新生成此密钥吗？旧密钥将立即失效。")) {
                regenerateApiKey(keyItem.id);
              }
            }}
            className="rounded border border-panel-border px-2 py-1 text-xs text-panel-text hover:bg-panel-surface"
          >
            重新生成
          </button>
          <button
            onClick={() => {
              if (confirm("确定要删除此密钥吗？此操作不可撤销。")) {
                revokeApiKey(keyItem.id);
              }
            }}
            className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

function ApiKeysSection() {
  const { apiKeys, addApiKey } = useSecurityStore();
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    const name = newName.trim() || `新密钥 ${apiKeys.length + 1}`;
    addApiKey(name);
    setNewName("");
  };

  return (
    <Section title="API 密钥">
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="密钥名称（可选）"
          className="flex-1 rounded border border-panel-border bg-panel-bg px-3 py-2 text-sm text-panel-text outline-none focus:border-accent"
        />
        <button
          onClick={handleAdd}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-panel-bg hover:opacity-90"
        >
          创建密钥
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {apiKeys.map((key) => (
          <ApiKeyRow key={key.id} keyItem={key} />
        ))}
      </div>
    </Section>
  );
}

/* ── Sessions Section ── */

function SessionsSection() {
  const { sessions, terminateSession, terminateOtherSessions } = useSecurityStore();

  return (
    <Section title="会话管理">
      <div className="flex flex-col gap-2">
        {sessions.map((sess) => (
          <div
            key={sess.id}
            className={`rounded-lg border p-3 ${
              sess.isCurrent ? "border-accent/30 bg-accent/5" : "border-panel-border bg-panel-bg"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-panel-text">
                  {sess.device}
                  {sess.isCurrent && (
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">当前</span>
                  )}
                </div>
                <div className="text-xs text-panel-muted">
                  {sess.browser} · {sess.ip} · {sess.location} · {sess.createdAt}
                </div>
              </div>
              {!sess.isCurrent && (
                <button
                  onClick={() => terminateSession(sess.id)}
                  className="rounded border border-panel-border px-2 py-1 text-xs text-panel-text hover:bg-panel-surface"
                >
                  登出
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {sessions.length > 1 && (
        <button
          onClick={() => {
            if (confirm("确定要登出所有其他设备吗？")) {
              terminateOtherSessions();
            }
          }}
          className="mt-2 rounded border border-accent-amber/50 px-3 py-1.5 text-xs text-accent-amber hover:bg-accent-amber/10"
        >
          登出其他所有设备
        </button>
      )}
    </Section>
  );
}

/* ── Privacy Section ── */

function PrivacySection() {
  const { privacy, updatePrivacy } = useSecurityStore();

  return (
    <Section title="隐私管理">
      <ToggleField
        label="数据收集"
        description="允许收集使用数据以改进产品体验"
        checked={privacy.dataCollection}
        onChange={(v) => updatePrivacy({ dataCollection: v })}
      />
      <ToggleField
        label="使用分析"
        description="发送匿名分析数据帮助优化性能"
        checked={privacy.analyticsEnabled}
        onChange={(v) => updatePrivacy({ analyticsEnabled: v })}
      />
      <Field label="Cookie 偏好">
        <select
          value={privacy.cookieConsent}
          onChange={(e) => updatePrivacy({ cookieConsent: e.target.value as "all" | "essential" | "none" })}
          className="rounded border border-panel-border bg-panel-bg px-3 py-1.5 text-sm text-panel-text outline-none focus:border-accent"
        >
          <option value="all">允许全部</option>
          <option value="essential">仅必要</option>
          <option value="none">拒绝全部</option>
        </select>
      </Field>
      <Field label="自动清理数据" description="超过设定天数后自动删除历史数据">
        <select
          value={privacy.autoDeleteDays}
          onChange={(e) => updatePrivacy({ autoDeleteDays: Number(e.target.value) })}
          className="rounded border border-panel-border bg-panel-bg px-3 py-1.5 text-sm text-panel-text outline-none focus:border-accent"
        >
          <option value={7}>7 天</option>
          <option value={30}>30 天</option>
          <option value={90}>90 天</option>
          <option value={365}>1 年</option>
        </select>
      </Field>
    </Section>
  );
}

/* ── Main Component ── */

export function SecuritySettings() {
  return (
    <div>
      <PasswordSection />
      <ApiKeysSection />
      <SessionsSection />
      <PrivacySection />

      {/* M3 API integration notes */}
      <div className="mt-6 rounded border border-dashed border-panel-border bg-panel-bg p-3 text-xs text-panel-muted">
        <div className="mb-1 font-medium text-panel-text">M3 接口预留</div>
        <ul className="list-inside list-disc space-y-0.5">
          <li>{"密码修改：POST /api/v1/auth/password { current, new }"}</li>
          <li>{"API 密钥：GET/POST/DELETE /api/v1/keys"}</li>
          <li>{"会话管理：GET /api/v1/sessions + DELETE /api/v1/sessions/{id}"}</li>
          <li>{"隐私设置：GET/PATCH /api/v1/privacy"}</li>
          <li>{"2FA：POST /api/v1/auth/2fa/enable（待开发）"}</li>
        </ul>
      </div>
    </div>
  );
}
