import type { CliChunk, SignalRef } from "../api/types";

// Unified panel event stream (技术路线指南 §5.1 最近事件 + §5.2 实时事件流).
// Merges durable signals (OpenClaw hooks / system) with live CLI chunks (Claude),
// each tagged with a source so the panel can filter 全部 / OpenClaw / 系统 / Claude.
export type EventSource = "openclaw" | "system" | "claude";

export const EVENT_FILTERS: { id: EventSource | "all"; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "openclaw", label: "OpenClaw" },
  { id: "system", label: "系统" },
  { id: "claude", label: "Claude" }
];

export const EVENT_SOURCE_DOT: Record<EventSource, string> = {
  openclaw: "bg-accent",
  system: "bg-panel-muted",
  claude: "bg-accent-green"
};

export interface FeedEvent {
  id: string;
  source: EventSource;
  label: string;
  detail: string;
  ts: string;
}

// OpenClaw hook event names (mirrors gateway.js openClawHookEvents). Anything
// else (manual-start, etc.) is engine/system-originated.
const OPENCLAW_EVENTS = new Set([
  "session-start",
  "session-end",
  "pre-tool-use",
  "post-tool-use",
  "stop",
  "keyword-detector",
  "ask-user-question"
]);

const INTENT_LABEL: Record<string, string> = {
  start_research: "研究请求",
  start_or_resume: "会话开始",
  human_feedback: "人工反馈",
  record_tool_result: "工具结果",
  checkpoint: "检查点",
  noop: "事件"
};

function signalSource(signal: SignalRef): EventSource {
  return OPENCLAW_EVENTS.has(signal.event) ? "openclaw" : "system";
}

export function buildEventFeed(
  signals: SignalRef[],
  cliChunks: CliChunk[],
  { claudeCap = 24 }: { claudeCap?: number } = {}
): FeedEvent[] {
  const fromSignals: FeedEvent[] = (signals ?? []).map((s) => ({
    id: s.id,
    source: signalSource(s),
    label: INTENT_LABEL[s.intent] ?? s.event,
    detail: s.routeKey,
    ts: s.timestamp
  }));

  // Keep only the most recent claude chunks so live process noise never floods
  // the durable event history.
  const recentChunks = (cliChunks ?? []).slice(-claudeCap);
  const fromChunks: FeedEvent[] = recentChunks.map((c, i) => ({
    id: `cli_${c.ts}_${i}`,
    source: "claude",
    label: c.kind === "consult" ? "对话" : c.role,
    detail: c.tool ? `🛠 ${c.tool}` : (c.text ?? "").slice(0, 120),
    ts: c.ts
  }));

  return [...fromSignals, ...fromChunks].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}

export function filterFeed(feed: FeedEvent[], source: EventSource | "all"): FeedEvent[] {
  return source === "all" ? feed : feed.filter((e) => e.source === source);
}
