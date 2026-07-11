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

  function sourceOf(policy, adapterName) {
    return {
      provider: policy?.provider ?? null,
      cli: policy?.cli ?? null,
      model: policy?.model ?? null,
      adapter: adapterName
    };
  }

  function emitDegraded(request, reason) {
    eventBus?.emit(request.project_id, {
      type: "cli_chunk",
      data: {
        phase: request.phase,
        role: "系统",
        degraded: true,
        text: `${reason}，已降级 mock`,
        ts: new Date().toISOString()
      }
    });
  }

  async function degrade(request, policy, reason) {
    emitDegraded(request, reason);
    const result = await mock.run(request);
    return { ...result, degraded: true, source: sourceOf(policy, "mock") };
  }

  return {
    name: "cli-router",

    async run(request) {
      const policy = resolvePolicy(request.phase) || { provider: fallbackProvider, cli: "mock", model: null };
      const provider = policy.provider;

      // mock is explicitly configured for this phase → run it as the real choice
      // (not a degradation). Source still records the configured policy.
      if (provider === "mock") {
        const result = await mock.run(request);
        return { ...result, source: sourceOf(policy, "mock") };
      }

      const adapter = adapters[provider];
      if (!adapter || adapter.available === false || typeof adapter.run !== "function") {
        return degrade(request, policy, `${provider} CLI 不可用`);
      }
      if (costTracker?.overBudget(request.project_id)) {
        return degrade(request, policy, "超出会话预算");
      }

      let result;
      try {
        result = await adapter.run({ ...request, model: policy.model });
      } catch (err) {
        costTracker?.recordFailure(request.project_id, request.phase);
        return degrade(request, policy, `${provider} 运行异常（${err?.message || err}）`);
      }
      if (!result.ok) {
        costTracker?.recordFailure(request.project_id, request.phase);
        return degrade(request, policy, result.error?.code || `${provider} 运行失败`);
      }
      if (result.usage) {
        costTracker?.record(request.project_id, { ...result.usage, phase: request.phase });
      }
      return { ...result, source: sourceOf(policy, provider) };
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
