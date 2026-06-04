import { useState } from "react";
import { useModelStore } from "../stores/model";
import { statusLabel, statusColor, type ModelConfig, type ModelStatus } from "../lib/model";

const PROVIDER_ICONS: Record<string, string> = {
  claude: "🟠",
  gemini: "🔵",
  openai: "🟢",
  local: "🦙"
};

function ModelAvatar({ model }: { model: ModelConfig }) {
  const icon = model.avatar ?? PROVIDER_ICONS[model.provider] ?? "🤖";
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel-bg text-lg">
      {icon}
    </div>
  );
}

function StatusBadge({ status }: { status: ModelStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: statusColor(status) + "20",
        color: statusColor(status)
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: statusColor(status) }}
      />
      {statusLabel(status)}
    </span>
  );
}

function TokenBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs text-panel-muted">
        <span>Token 消耗</span>
        <span>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-border">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e"
          }}
        />
      </div>
    </div>
  );
}

function ModelDetail({
  model,
  onClose
}: {
  model: ModelConfig;
  onClose: () => void;
}) {
  const { renameModel, setTokenLimit, toggleStop } = useModelStore();
  const [editName, setEditName] = useState(model.name);
  const [editLimit, setEditLimit] = useState(model.tokenLimit);

  const handleSave = () => {
    if (editName.trim() && editName !== model.name) {
      renameModel(model.id, editName.trim());
    }
    if (editLimit !== model.tokenLimit) {
      setTokenLimit(model.id, editLimit);
    }
    onClose();
  };

  return (
    <div className="rounded-lg border border-panel-border bg-panel-bg p-4">
      <div className="mb-4 flex items-center gap-3">
        <ModelAvatar model={model} />
        <div className="min-w-0 flex-1">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full bg-transparent text-base font-semibold text-panel-text outline-none"
          />
          <div className="text-xs text-panel-muted">
            {model.provider} · {model.modelId}
          </div>
        </div>
        <StatusBadge status={model.status} />
      </div>

      <div className="mb-4">
        <TokenBar used={model.tokensUsed} limit={model.tokenLimit} />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs text-panel-muted">Token 限制</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={256}
            max={32768}
            step={256}
            value={editLimit}
            onChange={(e) => setEditLimit(Number(e.target.value))}
            className="w-40 accent-accent"
          />
          <input
            type="number"
            min={256}
            max={32768}
            value={editLimit}
            onChange={(e) => setEditLimit(Number(e.target.value))}
            className="w-20 rounded border border-panel-border bg-panel-surface px-2 py-1 text-sm text-panel-text outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-xs text-panel-muted">温度</span>
          <div className="text-panel-text">{model.temperature}</div>
        </div>
        <div>
          <span className="text-xs text-panel-muted">最大输出</span>
          <div className="text-panel-text">{model.maxTokens.toLocaleString()}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => {
            toggleStop(model.id);
            onClose();
          }}
          className={[
            "rounded px-4 py-1.5 text-sm font-medium",
            model.isStopped
              ? "bg-accent text-panel-bg hover:opacity-90"
              : "border border-red-500/50 text-red-400 hover:bg-red-500/10"
          ].join(" ")}
        >
          {model.isStopped ? "恢复运行" : "强制停止"}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded border border-panel-border px-3 py-1.5 text-sm text-panel-text hover:bg-panel-surface"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-panel-bg hover:opacity-90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelRow({
  model,
  isOpen,
  onToggle
}: {
  model: ModelConfig;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={["rounded-lg border", isOpen ? "border-accent/40 bg-panel-bg" : "border-panel-border bg-panel-bg hover:border-accent/30"].join(" ")}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <ModelAvatar model={model} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-panel-text">{model.name}</span>
            {model.isStopped && (
              <span className="rounded bg-panel-border px-1.5 py-0.5 text-[10px] text-panel-muted">已停止</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-panel-muted">
            <span>{statusLabel(model.status)}</span>
            <span>·</span>
            <span>Token {model.tokensUsed.toLocaleString()} / {model.tokenLimit.toLocaleString()}</span>
          </div>
        </div>
        <StatusBadge status={model.status} />
        <svg
          className={`h-4 w-4 text-panel-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="border-t border-panel-border px-3 pb-3">
          <div className="pt-3">
            <ModelDetail model={model} onClose={onToggle} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ModelSettings() {
  const { models, refreshModels } = useModelStore();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-panel-muted">
          {models.length} 个模型 · 点击展开配置
        </span>
        <button
          onClick={refreshModels}
          className="rounded border border-panel-border px-2 py-1 text-xs text-panel-muted hover:bg-panel-bg"
        >
          刷新列表
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {models.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            isOpen={openId === model.id}
            onToggle={() => setOpenId(openId === model.id ? null : model.id)}
          />
        ))}
      </div>

      <div className="mt-6 rounded border border-dashed border-panel-border bg-panel-bg p-3 text-xs text-panel-muted">
        <div className="mb-1 font-medium text-panel-text">M2 接口预留</div>
        <ul className="list-inside list-disc space-y-0.5">
          <li>{"模型列表：GET /api/v1/models → 替换 DEMO_MODELS"}</li>
          <li>{"重命名：PATCH /api/v1/models/{id} { name: string }"}</li>
          <li>{"Token 限制：PATCH /api/v1/models/{id} { tokenLimit: number }"}</li>
          <li>{"强制停止：POST /api/v1/models/{id}/stop | /resume"}</li>
          <li>{"状态推送：WebSocket / SSE 实时更新 status + tokensUsed"}</li>
        </ul>
      </div>
    </div>
  );
}
