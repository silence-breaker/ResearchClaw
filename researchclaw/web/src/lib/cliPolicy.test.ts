import { describe, expect, it } from "vitest";
import { defaultCliForProvider, getDefaultModelForProvider, isModelValidForProvider, isValidCliForProvider } from "./cliPolicy";
import type { ProviderStatus } from "../api/types";

const providers: ProviderStatus[] = [
  { id: "claude", configured: true, baseUrlHost: "yunwu.ai", models: ["claude-haiku-4-5-20251001"] },
  { id: "gemini", configured: true, baseUrlHost: "yunwu.ai", models: ["gemini-3.1-flash-lite"] },
  { id: "codex", configured: false, baseUrlHost: "", models: [] }
];

describe("isValidCliForProvider", () => {
  it("allows matching real provider/cli pairs", () => {
    expect(isValidCliForProvider("claude", "claude-code")).toBe(true);
    expect(isValidCliForProvider("gemini", "gemini-cli")).toBe(true);
    expect(isValidCliForProvider("codex", "codex-cli")).toBe(true);
  });

  it("rejects mismatched real provider/cli pairs", () => {
    expect(isValidCliForProvider("claude", "gemini-cli")).toBe(false);
    expect(isValidCliForProvider("gemini", "codex-cli")).toBe(false);
  });

  it("allows only mock cli for mock provider", () => {
    expect(isValidCliForProvider("mock", "mock")).toBe(true);
    expect(isValidCliForProvider("mock", "claude-code")).toBe(false);
    expect(isValidCliForProvider("claude", "mock")).toBe(false);
  });
});

describe("defaultCliForProvider", () => {
  it("returns the matching CLI for real providers", () => {
    expect(defaultCliForProvider("claude")).toBe("claude-code");
    expect(defaultCliForProvider("mock")).toBe("mock");
  });
});

describe("getDefaultModelForProvider", () => {
  it("returns the first available model", () => {
    expect(getDefaultModelForProvider("claude", providers)).toBe("claude-haiku-4-5-20251001");
  });

  it("returns empty string for mock or unconfigured providers", () => {
    expect(getDefaultModelForProvider("mock", providers)).toBe("");
    expect(getDefaultModelForProvider("codex", providers)).toBe("");
  });
});

describe("isModelValidForProvider", () => {
  it("accepts models listed by the provider", () => {
    expect(isModelValidForProvider("claude", "claude-haiku-4-5-20251001", providers)).toBe(true);
  });

  it("rejects models not listed by the provider", () => {
    expect(isModelValidForProvider("claude", "gemini-3.1-flash-lite", providers)).toBe(false);
  });

  it("rejects models for unconfigured providers", () => {
    expect(isModelValidForProvider("codex", "gpt-5.4-mini", providers)).toBe(false);
  });

  it("accepts empty model for mock", () => {
    expect(isModelValidForProvider("mock", "", providers)).toBe(true);
  });
});
