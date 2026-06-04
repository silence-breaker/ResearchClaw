import { describe, expect, test } from "vitest";
import {
  DEMO_MODELS,
  clampTokenLimit,
  isValidModelStatus,
  isValidModelConfig,
  statusLabel,
  statusColor
} from "./model";

describe("clampTokenLimit", () => {
  test("clamps to [256, 128000]", () => {
    expect(clampTokenLimit(100)).toBe(256);
    expect(clampTokenLimit(256)).toBe(256);
    expect(clampTokenLimit(4096)).toBe(4096);
    expect(clampTokenLimit(128000)).toBe(128000);
    expect(clampTokenLimit(200000)).toBe(128000);
  });
});

describe("isValidModelStatus", () => {
  test("accepts valid statuses", () => {
    expect(isValidModelStatus("idle")).toBe(true);
    expect(isValidModelStatus("working")).toBe(true);
    expect(isValidModelStatus("error")).toBe(true);
    expect(isValidModelStatus("stopped")).toBe(true);
  });
  test("rejects invalid statuses", () => {
    expect(isValidModelStatus("offline")).toBe(false);
    expect(isValidModelStatus("")).toBe(false);
  });
});

describe("isValidModelConfig", () => {
  test("returns true for valid demo model", () => {
    expect(isValidModelConfig(DEMO_MODELS[0])).toBe(true);
  });
  test("returns false for incomplete object", () => {
    expect(isValidModelConfig({ id: "x", name: "y" })).toBe(false);
    expect(isValidModelConfig(null)).toBe(false);
    expect(isValidModelConfig("string")).toBe(false);
  });
});

describe("statusLabel", () => {
  test("returns Chinese labels", () => {
    expect(statusLabel("idle")).toBe("闲置");
    expect(statusLabel("working")).toBe("工作中");
    expect(statusLabel("error")).toBe("异常");
    expect(statusLabel("stopped")).toBe("已停止");
  });
});

describe("statusColor", () => {
  test("returns hex colors", () => {
    expect(statusColor("idle")).toMatch(/^#/);
    expect(statusColor("working")).toMatch(/^#/);
    expect(statusColor("error")).toMatch(/^#/);
    expect(statusColor("stopped")).toMatch(/^#/);
  });
});
