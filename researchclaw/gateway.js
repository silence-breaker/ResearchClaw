import { makeId, projectIdFromPayload } from "./util.js";

export const openClawHookEvents = [
  "session-start",
  "session-end",
  "pre-tool-use",
  "post-tool-use",
  "stop",
  "keyword-detector",
  "ask-user-question"
];

export function validateOpenClawPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["payload must be an object"] };
  }
  if (!payload.event) {
    errors.push("event is required");
  } else if (!openClawHookEvents.includes(payload.event)) {
    errors.push(`unsupported event: ${payload.event}`);
  }
  if (typeof payload.instruction !== "string") {
    errors.push("instruction is required");
  }
  if (typeof payload.timestamp !== "string") {
    errors.push("timestamp is required");
  }
  if (!payload.signal || typeof payload.signal !== "object") {
    errors.push("signal is required");
  } else if (typeof payload.signal.routeKey !== "string") {
    errors.push("signal.routeKey is required");
  }
  if (!payload.context || typeof payload.context !== "object" || Array.isArray(payload.context)) {
    errors.push("context is required");
  }
  return { ok: errors.length === 0, errors };
}

export function intentFromPayload(payload) {
  switch (payload.event) {
    case "session-start":
      return "start_or_resume";
    case "keyword-detector": {
      const prompt = payload.context?.prompt || payload.instruction;
      return hasResearchClawTrigger(prompt) ? "start_research" : "noop";
    }
    case "ask-user-question":
      return "human_feedback";
    case "post-tool-use":
      return ["tool", "test", "pull-request"].includes(payload.signal?.kind) ? "record_tool_result" : "noop";
    case "stop":
    case "session-end":
      return "checkpoint";
    default:
      return "noop";
  }
}

export function hasResearchClawTrigger(text) {
  return /(?:启动|啟動|打开|打開|start|open|launch)\s*research\s*claw|(?:启动|啟動|打开|打開|start|open|launch)\s*researchclaw|researchclaw\s*(?:启动|啟動|打开|打開|start|open|launch)/i.test(
    String(text || "")
  );
}

export function extractResearchDirection(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return undefined;
  }
  if (!hasResearchClawTrigger(raw)) {
    return raw;
  }
  const cleaned = raw
    .replace(/(?:启动|啟動|打开|打開|start|open|launch)\s*research\s*claw/gi, "")
    .replace(/(?:启动|啟動|打开|打開|start|open|launch)\s*researchclaw/gi, "")
    .replace(/researchclaw\s*(?:启动|啟動|打开|打開|start|open|launch)/gi, "")
    .replace(/^[：:，,\s-]+/, "")
    .trim();
  return cleaned || undefined;
}

export function toResearchSignal(payload, rawPayloadRef) {
  const promptText = payload.context?.prompt || payload.context?.question || payload.instruction;
  return {
    id: makeId("sig"),
    source: "openclaw",
    intent: intentFromPayload(payload),
    event: payload.event,
    routeKey: payload.signal.routeKey,
    priority: payload.signal.priority || "low",
    timestamp: payload.timestamp,
    projectId: projectIdFromPayload(payload),
    sessionId: payload.sessionId || payload.context?.sessionId,
    projectPath: payload.projectPath || payload.context?.projectPath,
    userText: payload.event === "keyword-detector" ? extractResearchDirection(promptText) : promptText,
    toolName: payload.context?.toolName || payload.signal?.toolName,
    rawPayloadRef
  };
}

export async function handleOpenClawPayload({ payload, store, orchestrator }) {
  const validation = validateOpenClawPayload(payload);
  if (!validation.ok) {
    return {
      status: 400,
      body: {
        ok: false,
        errors: validation.errors
      }
    };
  }
  const projectId = projectIdFromPayload(payload);
  const rawPayloadRef = store.saveRawPayload(projectId, payload.event, payload);
  const signal = toResearchSignal(payload, rawPayloadRef);
  const result = await orchestrator.handle(signal);
  return {
    status: 200,
    body: result
  };
}
