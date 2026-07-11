import { adapterBadgeMeta, type AdapterTone } from "../lib/processFeed";

// Solid accent for a real Claude run, grey for mock, fainter for manual — so the
// two-channel source is visible at a glance and a mock is never dressed up as
// Claude (M2前端 §3.4 / 红线 §4).
const TONE_CLASS: Record<AdapterTone, string> = {
  claude: "border-accent/40 bg-accent/15 text-accent",
  gemini: "border-sky-400/40 bg-sky-400/15 text-sky-300",
  codex: "border-violet-400/40 bg-violet-400/15 text-violet-300",
  mock: "border-panel-border bg-panel-bg text-panel-muted",
  manual: "border-panel-border bg-panel-bg text-panel-muted/70",
  unknown: "border-panel-border bg-panel-bg text-panel-muted/70"
};

export function AdapterBadge({ adapter }: { adapter: string | undefined }) {
  const { label, tone } = adapterBadgeMeta(adapter);
  return (
    <span
      title={`产物来源：${label}`}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}
