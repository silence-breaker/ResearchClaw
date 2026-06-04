import { describe, expect, test } from "vitest";
import {
  DEFAULT_SETTINGS,
  clampFontSize,
  clampBrightness,
  clampVolume,
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
    expect(clampBrightness(100)).toBe(100);
    expect(clampBrightness(200)).toBe(150);
  });
});

describe("clampVolume", () => {
  test("clamps to [0, 100]", () => {
    expect(clampVolume(-10)).toBe(0);
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(50)).toBe(50);
    expect(clampVolume(100)).toBe(100);
    expect(clampVolume(150)).toBe(100);
  });
});

describe("isValidHexColor", () => {
  test("accepts valid 6-digit hex", () => {
    expect(isValidHexColor("#0d1117")).toBe(true);
    expect(isValidHexColor("#FFFFFF")).toBe(true);
  });
  test("rejects invalid hex", () => {
    expect(isValidHexColor("0d1117")).toBe(false);
    expect(isValidHexColor("#GGG")).toBe(false);
    expect(isValidHexColor("#12345")).toBe(false);
  });
});

describe("migrateSettings", () => {
  test("returns defaults for non-object raw", () => {
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings("x")).toEqual(DEFAULT_SETTINGS);
  });

  test("keeps valid fields including notifications", () => {
    const input: Partial<AppSettings> = {
      volume: 75,
      messageNotification: false,
      soundEnabled: false,
      emailNotification: true,
      popupNotification: false,
      phaseCompleteNotification: false,
      doNotDisturb: true,
      quietHoursStart: "23:00",
      quietHoursEnd: "07:00",
      errorNotification: false,
      mentionNotification: false,
      systemAnnouncement: false,
      notificationFrequency: "digest"
    };
    const out = migrateSettings(input);
    expect(out.volume).toBe(75);
    expect(out.messageNotification).toBe(false);
    expect(out.soundEnabled).toBe(false);
    expect(out.emailNotification).toBe(true);
    expect(out.popupNotification).toBe(false);
    expect(out.phaseCompleteNotification).toBe(false);
    expect(out.doNotDisturb).toBe(true);
    expect(out.quietHoursStart).toBe("23:00");
    expect(out.quietHoursEnd).toBe("07:00");
    expect(out.errorNotification).toBe(false);
    expect(out.mentionNotification).toBe(false);
    expect(out.systemAnnouncement).toBe(false);
    expect(out.notificationFrequency).toBe("digest");
  });

  test("reverts invalid fields to defaults", () => {
    const input = {
      volume: 200,
      notificationFrequency: "hourly",
      quietHoursStart: 22,
      doNotDisturb: "yes"
    };
    const out = migrateSettings(input);
    expect(out.volume).toBe(100);
    expect(out.notificationFrequency).toBe(DEFAULT_SETTINGS.notificationFrequency);
    expect(out.quietHoursStart).toBe(DEFAULT_SETTINGS.quietHoursStart);
    expect(out.doNotDisturb).toBe(DEFAULT_SETTINGS.doNotDisturb);
  });
});
