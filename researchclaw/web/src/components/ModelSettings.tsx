import { useEffect, useMemo, useState } from "react";
import { fetchCliPolicy, fetchCliStatus, fetchProviders, updateCliPolicy } from "../api/client";
import type { CliId, CliProvider, CliStatus, PhaseCliEntry, ProviderStatus, ResearchPhase } from "../api/types";
import { defaultCliForProvider, getDefaultModelForProvider, isModelValidForProvider, isValidCliForProvider } from "../lib/cliPolicy";

const PHASE_LABELS: Record<ResearchPhase, string> = {
  idle: "空闲",
  intake: "接收",
  contract_draft: "契约起草",
  contract_review: "契约评审",
  literature_scouting: "文献侦察",
  baseline_selection: "基线选择",
  baseline_reproduction_checklist: "基线复现清单",
  idea_generation: "Idea 生成",
  idea_review: "Idea 评审",
  summary: "总结",
  blocked: "阻塞"
};

const PHASE_ORDER: ResearchPhase[] = [
  "contract_draft",
  "literature_scouting",
  "baseline_selection",
  "baseline_reproduction_checklist",
  "idea_generation",
  "idea_review",
  "summary"
];

function ProviderCard({ provider }: { provider: ProviderStatus }) {
  return (
    <div className="rounded-lg border border-panel-border bg-panel-bg p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium capitalize text-panel-text">{provider.id}</span>
        <span
          className={[
            "rounded px-2 py-0.5 text-xs font-medium",
            provider.configured ? "bg-green-500/10 text-green-500" : "bg-gray-500/10 text-gray-500"
          ].join(" ")}
        >
          {provider.configured ? "已配置" : "未配置"}
        </span>
      </div>
      {provider.configured && (
        <div className="space-y-1 text-sm text-panel-muted">
          <div>Host: {provider.baseUrlHost || "—"}</div>
          <div>Models: {provider.models.join(", ") || "—"}</div>
        </div>
      )}
    </div>
  );
}

function CliCard({ cli }: { cli: CliStatus }) {
  return (
    <div className="rounded-lg border border-panel-border bg-panel-bg p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-panel-text">{cli.id}</span>
        <span
          className={[
            "rounded px-2 py-0.5 text-xs font-medium",
            cli.available ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          ].join(" ")}
        >
          {cli.available ? "可用" : "不可用"}
        </span>
      </div>
      <div className="text-sm text-panel-muted">Command: {cli.command}</div>
    </div>
  );
}



export function ModelSettings() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [clis, setClis] = useState<CliStatus[]>([]);
  const [policy, setPolicy] = useState<Partial<Record<ResearchPhase, PhaseCliEntry>>>({});
  const [defaults, setDefaults] = useState<Partial<Record<ResearchPhase, PhaseCliEntry>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, c, pol] = await Promise.all([fetchProviders(), fetchCliStatus(), fetchCliPolicy()]);
      setProviders(p);
      setClis(c);
      setPolicy(pol.policy);
      setDefaults(pol.defaults);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const effectivePolicy = useMemo(() => {
    const merged: Partial<Record<ResearchPhase, PhaseCliEntry>> = { ...defaults };
    for (const phase of Object.keys(policy) as ResearchPhase[]) {
      if (policy[phase]) merged[phase] = policy[phase];
    }
    return merged;
  }, [policy, defaults]);

  const handleProviderChange = (phase: ResearchPhase, provider: CliProvider) => {
    setPolicy((prev) => {
      const current = prev[phase] ?? defaults[phase] ?? { provider: "mock", cli: "mock" };
      let cli: CliId = current.cli;
      if (!isValidCliForProvider(provider, cli)) {
        cli = defaultCliForProvider(provider);
      }
      let model = current.model;
      if (provider === "mock") {
        model = undefined;
      } else if (!isModelValidForProvider(provider, model ?? "", providers)) {
        model = getDefaultModelForProvider(provider, providers);
      }
      return { ...prev, [phase]: { provider, cli, model } };
    });
    setSaveOk(false);
  };

  const handleCliChange = (phase: ResearchPhase, cli: CliId) => {
    setPolicy((prev) => {
      const current = prev[phase] ?? defaults[phase] ?? { provider: "mock", cli: "mock" };
      return { ...prev, [phase]: { ...current, cli } };
    });
    setSaveOk(false);
  };

  const handleModelChange = (phase: ResearchPhase, model: string) => {
    setPolicy((prev) => {
      const current = prev[phase] ?? defaults[phase] ?? { provider: "mock", cli: "mock" };
      return { ...prev, [phase]: { ...current, model } };
    });
    setSaveOk(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await updateCliPolicy(policy);
      setPolicy(res.policy);
      setDefaults(res.defaults);
      setSaveOk(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <span className="text-xs text-panel-muted">V3 模型 / CLI 路由配置</span>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded border border-panel-border px-3 py-1 text-xs text-panel-muted hover:bg-panel-bg disabled:opacity-50"
        >
          {loading ? "刷新中…" : "刷新状态"}
        </button>
      </div>

      {error && <div className="rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      <section>
        <h3 className="mb-3 text-sm font-medium text-panel-text">Provider 状态</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-panel-text">CLI 状态</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clis.map((c) => (
            <CliCard key={c.id} cli={c} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-panel-text">Phase CLI Policy</h3>
          <span className="text-xs text-panel-muted">为每个研究阶段选择 provider、CLI 与模型</span>
        </div>

        <div className="overflow-hidden rounded-lg border border-panel-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel-bg text-xs uppercase text-panel-muted">
              <tr>
                <th className="px-4 py-2">阶段</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">CLI</th>
                <th className="px-4 py-2">Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border">
              {PHASE_ORDER.map((phase) => {
                const entry = effectivePolicy[phase] ?? { provider: "mock", cli: "mock" };
                return (
                  <tr key={phase} className="bg-panel-surface">
                    <td className="px-4 py-3 text-panel-text">{PHASE_LABELS[phase]}</td>
                    <td className="px-4 py-3">
                      <select
                        value={entry.provider}
                        onChange={(e) => handleProviderChange(phase, e.target.value as CliProvider)}
                        className="rounded border border-panel-border bg-panel-bg px-2 py-1 text-panel-text outline-none focus:border-accent"
                      >
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id} {p.configured ? "" : "(未配置)"}
                          </option>
                        ))}
                        <option value="mock">mock</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={entry.cli}
                        onChange={(e) => handleCliChange(phase, e.target.value as CliId)}
                        className="rounded border border-panel-border bg-panel-bg px-2 py-1 text-panel-text outline-none focus:border-accent"
                      >
                        {["claude-code", "gemini-cli", "codex-cli", "mock"]
                          .filter((cli) => isValidCliForProvider(entry.provider, cli as CliId))
                          .map((cli) => (
                            <option key={cli} value={cli}>
                              {cli}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {entry.provider === "mock" ? (
                        <span className="text-panel-muted">—</span>
                      ) : (
                        <select
                          value={entry.model ?? ""}
                          onChange={(e) => handleModelChange(phase, e.target.value)}
                          className="rounded border border-panel-border bg-panel-bg px-2 py-1 text-panel-text outline-none focus:border-accent"
                        >
                          {providers
                            .find((p) => p.id === entry.provider)
                            ?.models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-panel-bg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存策略"}
          </button>
          {saveOk && <span className="text-sm text-green-500">已保存</span>}
          {saveError && <span className="text-sm text-red-400">{saveError}</span>}
        </div>
      </section>
    </div>
  );
}
