import { resolvePhasePolicy } from "../settings/cliPolicy.js";

// Phase-aware CLI router (技术路线指南 §5.1). Supersedes the Claude-primary
// route.js in the real wiring: each phase's provider/CLI/model comes from the
// persisted phase CLI policy (V3-M2), and the matching adapter runs it. `mock`
// is BOTH a valid configured target (honest, not degraded) AND the fallback when
// a real CLI is unavailable / errors / over budget. Every result carries
// `source` = {provider, cli, model, adapter} so the artifact and panel can label
// exactly where it came from (V3-06). Degradation to mock is always explicit and
// tagged degraded:true, so a fallback is never mistaken for a real CLI result.
export function createCliRouter({
  adapters,
  costTracker = null,
  eventBus = null,
  resolvePolicy = (phase) => resolvePhasePolicy(phase),
  fallbackProvider = "mock"
} = {}) {
  const mock = adapters?.mock;
  if (!mock) {
    throw new Error("createCliRouter requires a mock adapter (fallback base)");
  }

  function makeWindowId(phase) {
    return `win_${phase || "phase"}_${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}`;
  }

  function sourceOf(policy, adapterName, windowId) {
    return {
      provider: policy?.provider ?? null,
      cli: policy?.cli ?? null,
      model: policy?.model ?? null,
      adapter: adapterName,
      windowId
    };
  }

  function emitDegraded(request, policy, windowId, reason) {
    eventBus?.emit(request.project_id, {
      type: "cli_chunk",
      data: {
        kind: "workflow",
        phase: request.phase,
        provider: policy?.provider ?? null,
        cli: policy?.cli ?? null,
        model: policy?.model ?? null,
        windowId,
        role: "系统",
        degraded: true,
        text: `${reason}，已降级 mock`,
        ts: new Date().toISOString()
      }
    });
  }

  async function degrade(request, policy, windowId, reason) {
    emitDegraded(request, policy, windowId, reason);
    const result = await mock.run(request);
    return { ...result, degraded: true, source: sourceOf(policy, "mock", windowId) };
  }

  return {
    name: "cli-router",

    async run(request) {
      const policy = resolvePolicy(request.phase) || { provider: fallbackProvider, cli: "mock", model: null };
      const provider = policy.provider;
      const windowId = makeWindowId(request.phase);
      const runReq = { ...request, window_id: windowId };

      // mock is explicitly configured for this phase → run it as the real choice
      // (not a degradation). Source still records the configured policy.
      if (provider === "mock") {
        const result = await mock.run(runReq);
        return { ...result, source: sourceOf(policy, "mock", windowId) };
      }

      const adapter = adapters[provider];
      if (!adapter || adapter.available === false || typeof adapter.run !== "function") {
        return degrade(runReq, policy, windowId, `${provider} CLI 不可用`);
      }
      if (costTracker?.overBudget(request.project_id)) {
        return degrade(runReq, policy, windowId, "超出会话预算");
      }

      let result;
      try {
        result = await adapter.run({ ...runReq, model: policy.model });
      } catch (err) {
        costTracker?.recordFailure(request.project_id, request.phase, provider);
        return degrade(runReq, policy, windowId, `${provider} 运行异常（${err?.message || err}）`);
      }
      if (!result.ok) {
        costTracker?.recordFailure(request.project_id, request.phase, provider);
        return degrade(runReq, policy, windowId, result.error?.code || `${provider} 运行失败`);
      }
      if (result.usage) {
        costTracker?.record(request.project_id, { ...result.usage, phase: request.phase, provider });
      }
      return { ...result, source: sourceOf(policy, provider, windowId) };
    },

    // consult stays Claude-only (V3-M4: ConsultPanel keeps Claude semantics;
    // gemini/codex consult is not implemented and must not pretend to be). Never
    // degrades to mock — there is no pipeline to keep alive and a faked reply
    // would break the two-channel red line. Usage is recorded under "consult".
    async consult(request) {
      const claude = adapters.claude;
      if (!claude || claude.available === false || typeof claude.consult !== "function") {
        return { ok: false, adapter: "claude", error: { code: "unavailable", message: "Claude 未接入，一问一答不可用", retryable: false } };
      }
      if (costTracker?.overBudget(request.project_id)) {
        return { ok: false, adapter: "claude", error: { code: "over_budget", message: "超出会话预算，consult 已暂停", retryable: false } };
      }
      const result = await claude.consult(request);
      if (!result.ok) {
        costTracker?.recordFailure(request.project_id, "consult");
        return result;
      }
      if (result.usage) {
        costTracker?.record(request.project_id, { ...result.usage, phase: "consult" });
      }
      return result;
    }
  };
}
