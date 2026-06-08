import type { CliRawLogSummary } from "../api/types";

export type AdapterTone = "claude" | "mock" | "manual" | "unknown";

// Source badge metadata. Serves the two-channel honesty: a glance tells you
// whether a product came from a real CLI run or a mock replay (M2前端 §3.4).
export function adapterBadgeMeta(adapter: string | undefined): { label: string; tone: AdapterTone } {
  switch (adapter) {
    case "claude":
      return { label: "Claude", tone: "claude" };
    case "mock":
      return { label: "Mock", tone: "mock" };
    case "manual":
      return { label: "人工", tone: "manual" };
    default:
      return { label: adapter || "—", tone: "unknown" };
  }
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
