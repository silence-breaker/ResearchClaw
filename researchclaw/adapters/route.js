// Composes a primary (Claude) + fallback (mock) adapter into one that keeps the
// orchestrator/workflow layer unchanged (技术路线指南 §2.2, 后端文档 §7).
//
// Routing rules per run(request):
//   1. phase not opted-in, primary unavailable, or over budget → fallback (mock),
//      marked degraded.
//   2. primary errors (timeout / schema_violation / …) → record a CLI failure,
//      emit a degraded event, fall back to mock (degraded).
//   3. primary succeeds → record usage, return as-is (adapter: "claude").
//
// Degradation is always honest: the returned result carries adapter:"mock" and
// degraded:true so the panel can label the source and show a banner.
export function createRoutingAdapter({ phases = [], primary, fallback, costTracker = null, eventBus = null }) {
  const phaseSet = new Set(phases);

  function emitDegraded(request, reason) {
    eventBus?.emit(request.project_id, {
      type: "cli_chunk",
      data: {
        phase: request.phase,
        role: "系统",
        degraded: true,
        text: `Claude 不可用，已降级 mock（${reason}）`,
        ts: new Date().toISOString()
      }
    });
  }

  async function degrade(request, reason) {
    emitDegraded(request, reason);
    const result = await fallback.run(request);
    return { ...result, degraded: true };
  }

  return {
    name: "routing",
    async run(request) {
      if (!phaseSet.has(request.phase)) {
        return degrade(request, "phase 未接入");
      }
      if (primary?.available === false) {
        return degrade(request, "无 key / CLI 不可用");
      }
      if (costTracker?.overBudget(request.project_id)) {
        return degrade(request, "超出会话预算");
      }

      const result = await primary.run(request);
      if (!result.ok) {
        costTracker?.recordFailure(request.project_id, request.phase);
        return degrade(request, result.error?.code || "运行失败");
      }
      if (result.usage) {
        costTracker?.record(request.project_id, { ...result.usage, phase: request.phase });
      }
      return result;
    }
  };
}
