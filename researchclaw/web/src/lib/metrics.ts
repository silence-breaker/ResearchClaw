import type { BudgetStatus, UsageSummary } from "../api/types";

// Pure metrics-panel helpers (M4技术路线-前端). Cost + budget are read straight
// from the backend snapshot — the frontend never estimates cost or picks a
// threshold itself.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Elapsed time in the current phase. "—" when there is no start time; clamps a
// future start to 00:00 rather than rendering a negative duration.
export function elapsedLabel(startIso: string | undefined, nowMs: number): string {
  if (!startIso) {
    return "—";
  }
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) {
    return "—";
  }
  const total = Math.max(0, Math.floor((nowMs - start) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// The backend owns the threshold decision; the UI just reads its state.
export function budgetTone(budget: BudgetStatus | undefined): "ok" | "warn" | "over" {
  return budget?.state ?? "ok";
}

// Tooltip breakdown for the cost metric — input / output / cache tokens + CLI calls.
export function costTooltip(usage: UsageSummary): string {
  const cacheWrite = usage.cache_creation_tokens ?? 0;
  const cacheRead = usage.cache_read_tokens ?? 0;
  return (
    `in ${usage.input_tokens} / out ${usage.output_tokens} tokens · ` +
    `cache 写 ${cacheWrite} / 读 ${cacheRead} · ` +
    `CLI ${usage.cli_calls} 调用 / ${usage.cli_failures} 失败`
  );
}
