import { describe, expect, test } from "vitest";
import {
  DEFAULT_SETTINGS,
  clampFontSize,
  clampBrightness,
  isValidHexColor,
  migrateSettings,
  type AppSettings
} from "./settings";

describe("clampFontSize", () => {
  test("rounds and clamps to [12, 18]", () => {
    expect(clampFontSize(10)).toBe(12);
    expect(clampFontSize(12)).toBe(12);
    expect(clampFontSize(14.4)).toBe(14);
    expect(clampFontSize(18)).toBe(18);
    expect(clampFontSize(22)).toBe(18);
  });
});

describe("clampBrightness", () => {
  test("clamps to [50, 150]", () => {
    expect(clampBrightness(30)).toBe(50);
    expect(clampBrightness(50)).toBe(50);
    expect(clampBrightness(100)).toBe(100);
    expect(clampBrightness(150)).toBe(150);
    expect(clampBrightness(200)).toBe(150);
  });
});

describe("isValidHexColor", () => {
  test("accepts valid 6-digit hex", () => {
    expect(isValidHexColor("#0d1117")).toBe(true);
    expect(isValidHexColor("#FFFFFF")).toBe(true);
    expect(isValidHexColor("#abc123")).toBe(true);
  });
  test("rejects invalid hex", () => {
    expect(isValidHexColor("0d1117")).toBe(false);
    expect(isValidHexColor("#GGG")).toBe(false);
    expect(isValidHexColor("#12345")).toBe(false);
    expect(isValidHexColor("red")).toBe(false);
  });
});

describe("migrateSettings", () => {
  test("returns defaults for non-object raw", () => {
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings("x")).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  test("keeps valid appearance fields", () => {
    const input: Partial<AppSettings> = {
      theme: "system",
      language: "en",
      fontSize: 16,
      fontFamily: '"Inter", sans-serif',
      accentColor: "pink",
      brightness: 120,
      nightMode: true,
      backgroundColor: "#1a1a2e",
      chatColor: "#16213e",
      codeColor: "#0f3460",
      reduceMotion: true
    };
    const out = migrateSettings(input);
    expect(out.theme).toBe("system");
    expect(out.language).toBe("en");
    expect(out.fontSize).toBe(16);
    expect(out.fontFamily).toBe('"Inter", sans-serif');
    expect(out.accentColor).toBe("pink");
    expect(out.brightness).toBe(120);
    expect(out.nightMode).toBe(true);
    expect(out.backgroundColor).toBe("#1a1a2e");
    expect(out.chatColor).toBe("#16213e");
    expect(out.codeColor).toBe("#0f3460");
    expect(out.reduceMotion).toBe(true);
  });

  test("migrates old codeFont to fontFamily", () => {
    const input = { codeFont: "Fira Code" };
    const out = migrateSettings(input);
    expect(out.fontFamily).toContain("Fira Code");
  });

  test("reverts invalid fields to defaults", () => {
    const input = {
      theme: "neon",
      fontSize: 99,
      brightness: 200,
      nightMode: "yes",
      backgroundColor: "not-a-color",
      chatColor: "#123",
      codeColor: "blue"
    };
    const out = migrateSettings(input);
    expect(out.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(out.fontSize).toBe(18);
    expect(out.brightness).toBe(150);
    expect(out.nightMode).toBe(DEFAULT_SETTINGS.nightMode);
    expect(out.backgroundColor).toBe(DEFAULT_SETTINGS.backgroundColor);
    expect(out.chatColor).toBe(DEFAULT_SETTINGS.chatColor);
    expect(out.codeColor).toBe(DEFAULT_SETTINGS.codeColor);
  });
});
