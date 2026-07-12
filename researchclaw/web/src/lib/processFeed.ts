import type { CliRawLogSummary } from "../api/types";

export type AdapterTone = "claude" | "gemini" | "codex" | "mock" | "manual" | "runner" | "unknown";

// Source badge metadata. Serves the two-channel honesty: a glance tells you
// whether a product came from a real CLI run or a mock replay (M2前端 §3.4).
export function adapterBadgeMeta(adapter: string | undefined): { label: string; tone: AdapterTone } {
  switch (adapter) {
    case "claude":
      return { label: "Claude", tone: "claude" };
    case "gemini":
      return { label: "Gemini", tone: "gemini" };
    case "codex":
      return { label: "Codex", tone: "codex" };
    case "mock":
      return { label: "Mock", tone: "mock" };
    case "manual":
      return { label: "人工", tone: "manual" };
    case "runner":
      return { label: "执行器", tone: "runner" };
    default:
      return { label: adapter || "—", tone: "unknown" };
  }
}

const CLI_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  "gemini-cli": "Gemini CLI",
  "codex-cli": "Codex CLI",
  mock: "Mock"
};

export function cliLabel(cli: string | undefined): string {
  if (!cli) return "—";
  return CLI_LABELS[cli] ?? cli;
}

export interface NormalizedRawLog {
  model: string;
  time: string;
  role: string;
  summary: string;
  artifactRefs: string[];
  transcriptRef?: string;
}

// Defensive read of a raw_log artifact's content into a process-feed summary.
// Every field is optional on the wire (older/leaner raw_logs), so missing values
// degrade to "—" rather than throwing.
export function readRawLogSummary(content: unknown): NormalizedRawLog {
  const c = (content && typeof content === "object" ? content : {}) as CliRawLogSummary;
  return {
    model: c.model || "—",
    time: c.time || "—",
    role: c.role || "—",
    summary: c.summary || "—",
    artifactRefs: Array.isArray(c.artifact_refs) ? c.artifact_refs : [],
    transcriptRef: c.transcript_ref
  };
}
