import { describe, expect, test } from "vitest";
import {
  DEFAULT_SETTINGS,
  clampFontSize,
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

describe("migrateSettings", () => {
  test("returns defaults for non-object raw", () => {
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings("x")).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  test("keeps valid fields", () => {
    const input: Partial<AppSettings> = {
      theme: "system",
      language: "en",
      fontSize: 16,
      accentColor: "pink"
    };
    const out = migrateSettings(input);
    expect(out.theme).toBe("system");
    expect(out.language).toBe("en");
    expect(out.fontSize).toBe(16);
    expect(out.accentColor).toBe("pink");
    // unset fields fall back to defaults
    expect(out.dateFormat).toBe(DEFAULT_SETTINGS.dateFormat);
    expect(out.density).toBe(DEFAULT_SETTINGS.density);
  });

  test("reverts invalid enum fields to defaults and clamps font size", () => {
    const input = {
      theme: "neon",
      language: "fr",
      dateFormat: "invalid",
      fontSize: 99,
      density: "huge",
      codeFont: "Comic Sans",
      accentColor: "red"
    };
    const out = migrateSettings(input);
    expect(out.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(out.language).toBe(DEFAULT_SETTINGS.language);
    expect(out.dateFormat).toBe(DEFAULT_SETTINGS.dateFormat);
    expect(out.density).toBe(DEFAULT_SETTINGS.density);
    expect(out.codeFont).toBe(DEFAULT_SETTINGS.codeFont);
    expect(out.accentColor).toBe(DEFAULT_SETTINGS.accentColor);
    // fontSize is clamped, not reset to default
    expect(out.fontSize).toBe(18);
  });
});
