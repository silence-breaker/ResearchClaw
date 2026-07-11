// Per-token USD pricing. claude-haiku-4-5 is the v2 default (cost is a hard
// constraint — see 技术路线指南 §7). Cache rates verified against Anthropic's
// published Haiku 4.5 pricing (2026-06-08): cache write (5m TTL) = 1.25× input,
// cache read = 0.1× input. M4 counts cache tokens so est_cost is no longer the
// systematic underestimate M2 had (cache_read dominates real usage). Opus/Sonnet
// are reference only; using them requires explicit config and a panel/log warning.
export const HAIKU_PRICING = {
  input: 1.0 / 1_000_000,
  output: 5.0 / 1_000_000,
  cache_write: 1.25 / 1_000_000,
  cache_read: 0.1 / 1_000_000
};
export const PRICING_BY_MODEL = {
  "claude-haiku-4-5": HAIKU_PRICING,
  // ⚠ far pricier — never a default. Present so an explicit override can be costed.
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000, cache_write: 3.75 / 1_000_000, cache_read: 0.3 / 1_000_000 },
  "claude-opus-4-8": { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000, cache_write: 18.75 / 1_000_000, cache_read: 1.5 / 1_000_000 }
};

// Accepts either bucket-style names (cache_creation_tokens) or the raw adapter
// usage names (cache_creation_input_tokens), so it works on a CostTracker bucket
// or a fresh usage object.
export function estimateCostUsd(usage = {}, pricing = HAIKU_PRICING) {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheCreate = usage.cache_creation_tokens ?? usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_tokens ?? usage.cache_read_input_tokens ?? 0;
  return (
    input * pricing.input +
    output * pricing.output +
    cacheCreate * (pricing.cache_write ?? 0) +
    cacheRead * (pricing.cache_read ?? 0)
  );
}

function emptyBucket() {
  return { input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0, cli_calls: 0, cli_failures: 0 };
}

// Session-level usage accumulator, keyed by projectId. In-memory: the engine
// persists snapshot() into state.usage on each write, so the durable record
// lives in state.json; this tracker drives the live budget gate.
export class CostTracker {
  constructor({ sessionBudgetUsd = null, pricing = HAIKU_PRICING, warnRatio = 0.8 } = {}) {
    this.sessionBudgetUsd = sessionBudgetUsd;
    this.pricing = pricing;
    this.warnRatio = warnRatio;
    this.byProject = new Map();
  }

  _project(projectId) {
    let entry = this.byProject.get(projectId);
    if (!entry) {
      entry = { ...emptyBucket(), by_phase: {}, by_provider: {} };
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

  _provider(entry, provider) {
    if (!provider) return null;
    if (!entry.by_provider[provider]) {
      entry.by_provider[provider] = emptyBucket();
    }
    return entry.by_provider[provider];
  }

  // Accepts the adapter usage shape: input_tokens / output_tokens plus the
  // API's cache_creation_input_tokens / cache_read_input_tokens (the cache reads
  // dominate real spend — M4技术路线-后端 §4).
  record(projectId, {
    input_tokens = 0,
    output_tokens = 0,
    cache_creation_input_tokens = 0,
    cache_read_input_tokens = 0,
    phase,
    provider
  } = {}) {
    const entry = this._project(projectId);
    const apply = (b) => {
      if (!b) return;
      b.input_tokens += input_tokens;
      b.output_tokens += output_tokens;
      b.cache_creation_tokens += cache_creation_input_tokens;
      b.cache_read_tokens += cache_read_input_tokens;
      b.cli_calls += 1;
    };
    apply(entry);
    apply(this._phase(entry, phase));
    apply(this._provider(entry, provider));
  }

  recordFailure(projectId, phase, provider) {
    const entry = this._project(projectId);
    entry.cli_failures += 1;
    this._phase(entry, phase).cli_failures += 1;
    const pb = this._provider(entry, provider);
    if (pb) pb.cli_failures += 1;
  }

  // Clone a {key: bucket} map and attach est_cost_usd to each bucket, so the
  // panel can show per-phase / per-provider spend without re-pricing on the
  // frontend (red line: pricing lives in one place — 技术路线指南 §7).
  _bucketsWithCost(map) {
    const out = {};
    for (const [key, bucket] of Object.entries(map)) {
      out[key] = { ...bucket, est_cost_usd: estimateCostUsd(bucket, this.pricing) };
    }
    return out;
  }

  snapshot(projectId) {
    const entry = this.byProject.get(projectId);
    if (!entry) {
      return {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        est_cost_usd: 0,
        cli_calls: 0,
        cli_failures: 0,
        by_phase: {},
        by_provider: {},
        budget: this.budgetStatus(projectId)
      };
    }
    return {
      input_tokens: entry.input_tokens,
      output_tokens: entry.output_tokens,
      cache_creation_tokens: entry.cache_creation_tokens,
      cache_read_tokens: entry.cache_read_tokens,
      est_cost_usd: estimateCostUsd(entry, this.pricing),
      cli_calls: entry.cli_calls,
      cli_failures: entry.cli_failures,
      by_phase: this._bucketsWithCost(entry.by_phase),
      by_provider: this._bucketsWithCost(entry.by_provider),
      budget: this.budgetStatus(projectId)
    };
  }

  // Spent cost vs the session budget, classified ok / warn / over so the panel
  // can highlight (warn) before the hard stop (over). M4技术路线-后端 §5.
  budgetStatus(projectId) {
    const entry = this.byProject.get(projectId);
    const spent = entry ? estimateCostUsd(entry, this.pricing) : 0;
    if (this.sessionBudgetUsd == null) {
      return { limit: null, spent, ratio: null, state: "ok" };
    }
    const ratio = spent / this.sessionBudgetUsd;
    const state = ratio > 1 ? "over" : ratio >= this.warnRatio ? "warn" : "ok";
    return { limit: this.sessionBudgetUsd, spent, ratio, state };
  }

  overBudget(projectId) {
    if (this.sessionBudgetUsd == null) {
      return false;
    }
    return this.budgetStatus(projectId).state === "over";
  }
}
