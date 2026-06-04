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
      accentColor: "pink",
      reduceMotion: true,
      highContrast: true,
      timezone: "America/New_York",
      defaultExportPath: "/custom/path",
      autoSaveInterval: "5m",
      startupPage: "last",
      confirmBeforeDelete: false
    };
    const out = migrateSettings(input);
    expect(out.theme).toBe("system");
    expect(out.language).toBe("en");
    expect(out.fontSize).toBe(16);
    expect(out.accentColor).toBe("pink");
    expect(out.reduceMotion).toBe(true);
    expect(out.highContrast).toBe(true);
    expect(out.timezone).toBe("America/New_York");
    expect(out.defaultExportPath).toBe("/custom/path");
    expect(out.autoSaveInterval).toBe("5m");
    expect(out.startupPage).toBe("last");
    expect(out.confirmBeforeDelete).toBe(false);
    // unset fields fall back to defaults
    expect(out.dateFormat).toBe(DEFAULT_SETTINGS.dateFormat);
    expect(out.density).toBe(DEFAULT_SETTINGS.density);
    expect(out.screenReaderOptimized).toBe(DEFAULT_SETTINGS.screenReaderOptimized);
    expect(out.focusIndicator).toBe(DEFAULT_SETTINGS.focusIndicator);
  });

  test("reverts invalid enum fields to defaults and clamps font size", () => {
    const input = {
      theme: "neon",
      language: "fr",
      dateFormat: "invalid",
      fontSize: 99,
      density: "huge",
      codeFont: "Comic Sans",
      accentColor: "red",
      reduceMotion: "yes",
      highContrast: 1,
      screenReaderOptimized: null,
      focusIndicator: undefined,
      timezone: 123,
      defaultExportPath: null,
      autoSaveInterval: "10m",
      startupPage: "home",
      confirmBeforeDelete: "no"
    };
    const out = migrateSettings(input);
    expect(out.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(out.language).toBe(DEFAULT_SETTINGS.language);
    expect(out.dateFormat).toBe(DEFAULT_SETTINGS.dateFormat);
    expect(out.density).toBe(DEFAULT_SETTINGS.density);
    expect(out.codeFont).toBe(DEFAULT_SETTINGS.codeFont);
    expect(out.accentColor).toBe(DEFAULT_SETTINGS.accentColor);
    expect(out.reduceMotion).toBe(DEFAULT_SETTINGS.reduceMotion);
    expect(out.highContrast).toBe(DEFAULT_SETTINGS.highContrast);
    expect(out.screenReaderOptimized).toBe(DEFAULT_SETTINGS.screenReaderOptimized);
    expect(out.focusIndicator).toBe(DEFAULT_SETTINGS.focusIndicator);
    expect(out.timezone).toBe(DEFAULT_SETTINGS.timezone);
    expect(out.defaultExportPath).toBe(DEFAULT_SETTINGS.defaultExportPath);
    expect(out.autoSaveInterval).toBe(DEFAULT_SETTINGS.autoSaveInterval);
    expect(out.startupPage).toBe(DEFAULT_SETTINGS.startupPage);
    expect(out.confirmBeforeDelete).toBe(DEFAULT_SETTINGS.confirmBeforeDelete);
    // fontSize is clamped, not reset to default
    expect(out.fontSize).toBe(18);
  });
});
