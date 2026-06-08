import { describe, expect, it } from "vitest";
import { budgetTone, costTooltip, elapsedLabel } from "./metrics";
import type { UsageSummary } from "../api/types";

describe("elapsedLabel", () => {
  const base = Date.parse("2026-06-08T12:00:00.000Z");
  it("returns — when there is no start time", () => {
    expect(elapsedLabel(undefined, base)).toBe("—");
  });
  it("formats mm:ss under an hour", () => {
    expect(elapsedLabel("2026-06-08T11:59:00.000Z", base)).toBe("01:00");
    expect(elapsedLabel("2026-06-08T11:58:30.000Z", base)).toBe("01:30");
  });
  it("formats h:mm:ss at or over an hour", () => {
    expect(elapsedLabel("2026-06-08T10:30:00.000Z", base)).toBe("1:30:00");
  });
  it("clamps a future start time to 00:00 rather than going negative", () => {
    expect(elapsedLabel("2026-06-08T12:01:00.000Z", base)).toBe("00:00");
  });
});

describe("budgetTone", () => {
  it("maps the backend budget state, defaulting to ok", () => {
    expect(budgetTone(undefined)).toBe("ok");
    expect(budgetTone({ limit: 1, spent: 0.9, ratio: 0.9, state: "warn" })).toBe("warn");
    expect(budgetTone({ limit: 1, spent: 1.2, ratio: 1.2, state: "over" })).toBe("over");
  });
});

describe("costTooltip", () => {
  it("breaks down input / output / cache tokens and CLI calls", () => {
    const usage: UsageSummary = {
      input_tokens: 16,
      output_tokens: 520,
      cache_creation_tokens: 40885,
      cache_read_tokens: 36748,
      est_cost_usd: 0.03,
      cli_calls: 2,
      cli_failures: 1
    };
    const tip = costTooltip(usage);
    expect(tip).toContain("in 16");
    expect(tip).toContain("out 520");
    expect(tip).toContain("cache 写 40885");
    expect(tip).toContain("读 36748");
    expect(tip).toContain("2 调用");
    expect(tip).toContain("1 失败");
  });
});
