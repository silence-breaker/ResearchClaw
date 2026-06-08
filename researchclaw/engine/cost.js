// Per-token USD pricing. claude-haiku-4-5 is the v2 default (cost is a hard
// constraint — see 技术路线指南 §7). Opus/Sonnet are listed for reference only;
// using them requires explicit config and a panel/log warning.
export const HAIKU_PRICING = { input: 1.0 / 1_000_000, output: 5.0 / 1_000_000 };
export const PRICING_BY_MODEL = {
  "claude-haiku-4-5": HAIKU_PRICING,
  // ⚠ far pricier — never a default. Present so an explicit override can be costed.
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "claude-opus-4-8": { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 }
};

export function estimateCostUsd({ input_tokens = 0, output_tokens = 0 }, pricing = HAIKU_PRICING) {
  return input_tokens * pricing.input + output_tokens * pricing.output;
}

function emptyBucket() {
  return { input_tokens: 0, output_tokens: 0, cli_calls: 0, cli_failures: 0 };
}

// Session-level usage accumulator, keyed by projectId. In-memory: the engine
// persists snapshot() into state.usage on each write, so the durable record
// lives in state.json; this tracker drives the live budget gate.
export class CostTracker {
  constructor({ sessionBudgetUsd = null, pricing = HAIKU_PRICING } = {}) {
    this.sessionBudgetUsd = sessionBudgetUsd;
    this.pricing = pricing;
    this.byProject = new Map();
  }

  _project(projectId) {
    let entry = this.byProject.get(projectId);
    if (!entry) {
      entry = { ...emptyBucket(), by_phase: {} };
      this.byProject.set(projectId, entry);
    }
    return entry;
  }

  _phase(entry, phase) {
    const key = phase || "unknown";
    if (!entry.by_phase[key]) {
      entry.by_phase[key] = emptyBucket();
    }
    return entry.by_phase[key];
  }

  record(projectId, { input_tokens = 0, output_tokens = 0, phase } = {}) {
    const entry = this._project(projectId);
    entry.input_tokens += input_tokens;
    entry.output_tokens += output_tokens;
    entry.cli_calls += 1;
    const bucket = this._phase(entry, phase);
    bucket.input_tokens += input_tokens;
    bucket.output_tokens += output_tokens;
    bucket.cli_calls += 1;
  }

  recordFailure(projectId, phase) {
    const entry = this._project(projectId);
    entry.cli_failures += 1;
    this._phase(entry, phase).cli_failures += 1;
  }

  snapshot(projectId) {
    const entry = this.byProject.get(projectId);
    if (!entry) {
      return { input_tokens: 0, output_tokens: 0, est_cost_usd: 0, cli_calls: 0, cli_failures: 0, by_phase: {} };
    }
    return {
      input_tokens: entry.input_tokens,
      output_tokens: entry.output_tokens,
      est_cost_usd: estimateCostUsd(entry, this.pricing),
      cli_calls: entry.cli_calls,
      cli_failures: entry.cli_failures,
      by_phase: JSON.parse(JSON.stringify(entry.by_phase))
    };
  }

  overBudget(projectId) {
    if (this.sessionBudgetUsd == null) {
      return false;
    }
    return this.snapshot(projectId).est_cost_usd > this.sessionBudgetUsd;
  }
}
