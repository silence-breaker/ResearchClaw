// Model configuration types and utilities.
// TODO(M2): Replace DEMO_MODELS with real data from backend API.

export type ModelStatus = "idle" | "working" | "error" | "stopped";

export interface ModelConfig {
  /** Unique identifier assigned by backend. Immutable. */
  id: string;
  /** Display name — user editable. */
  name: string;
  /** Provider: claude | gemini | openai | local — set by backend. */
  provider: string;
  /** Actual model ID used in API calls: e.g. "claude-3-sonnet-20240229" — set by backend. */
  modelId: string;
  /** Current runtime status. Updated by backend polling or WebSocket. */
  status: ModelStatus;
  /** Max tokens allowed per session / per request. User configurable. */
  tokenLimit: number;
  /** Tokens consumed in current session. Updated by backend. */
  tokensUsed: number;
  /** Temperature (0-1). User configurable. */
  temperature: number;
  /** Max output tokens per response. User configurable. */
  maxTokens: number;
  /** Whether the model is forcibly stopped by user. */
  isStopped: boolean;
  /** Icon/avatar URL or emoji. Optional. */
  avatar?: string;
}

// ── Demo data for M1 development ──
// Replace this entire array with API response in M2.
// Expected backend shape (JSON):
// {
//   id: string;
//   provider: string;
//   model_id: string;
//   status: "idle" | "working" | "error" | "stopped";
//   tokens_used: number;
//   temperature: number;
//   max_tokens: number;
//   is_stopped: boolean;
// }
// Frontend maps snake_case -> camelCase via adapter.

export const DEMO_MODELS: ModelConfig[] = [
  {
    id: "model-claude-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "claude",
    modelId: "claude-3-5-sonnet-20241022",
    status: "idle",
    tokenLimit: 4096,
    tokensUsed: 0,
    temperature: 0.7,
    maxTokens: 4096,
    isStopped: false,
    avatar: "🟠"
  },
  {
    id: "model-gemini-pro",
    name: "Gemini 1.5 Pro",
    provider: "gemini",
    modelId: "gemini-1.5-pro",
    status: "working",
    tokenLimit: 8192,
    tokensUsed: 1247,
    temperature: 0.5,
    maxTokens: 8192,
    isStopped: false,
    avatar: "🔵"
  },
  {
    id: "model-gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    modelId: "gpt-4o",
    status: "idle",
    tokenLimit: 4096,
    tokensUsed: 0,
    temperature: 0.8,
    maxTokens: 4096,
    isStopped: false,
    avatar: "🟢"
  },
  {
    id: "model-claude-haiku",
    name: "Claude 3 Haiku",
    provider: "claude",
    modelId: "claude-3-haiku-20240307",
    status: "stopped",
    tokenLimit: 2048,
    tokensUsed: 512,
    temperature: 0.6,
    maxTokens: 2048,
    isStopped: true,
    avatar: "🟡"
  },
  {
    id: "model-local-llama",
    name: "本地 Llama 3",
    provider: "local",
    modelId: "llama-3-8b-instruct",
    status: "error",
    tokenLimit: 4096,
    tokensUsed: 0,
    temperature: 0.7,
    maxTokens: 4096,
    isStopped: false,
    avatar: "🦙"
  }
];

export const DEFAULT_TOKEN_LIMIT = 4096;
export const TOKEN_LIMIT_MIN = 256;
export const TOKEN_LIMIT_MAX = 128000;

export function clampTokenLimit(n: number): number {
  return Math.max(TOKEN_LIMIT_MIN, Math.min(TOKEN_LIMIT_MAX, Math.round(n)));
}

export function isValidModelStatus(s: string): s is ModelStatus {
  return ["idle", "working", "error", "stopped"].includes(s);
}

export function isValidModelConfig(m: unknown): m is ModelConfig {
  if (!m || typeof m !== "object") return false;
  const c = m as Partial<ModelConfig>;
  return (
    typeof c.id === "string" &&
    c.id.length > 0 &&
    typeof c.name === "string" &&
    typeof c.provider === "string" &&
    typeof c.modelId === "string" &&
    isValidModelStatus(c.status as string) &&
    typeof c.tokenLimit === "number" &&
    typeof c.tokensUsed === "number" &&
    typeof c.temperature === "number" &&
    typeof c.maxTokens === "number" &&
    typeof c.isStopped === "boolean"
  );
}

export function statusLabel(status: ModelStatus): string {
  switch (status) {
    case "idle": return "闲置";
    case "working": return "工作中";
    case "error": return "异常";
    case "stopped": return "已停止";
  }
}

export function statusColor(status: ModelStatus): string {
  switch (status) {
    case "idle": return "#22c55e";    // green
    case "working": return "#3b82f6"; // blue
    case "error": return "#ef4444";   // red
    case "stopped": return "#6b7280"; // gray
  }
}
