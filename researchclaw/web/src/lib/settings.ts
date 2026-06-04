// Pure settings utilities: defaults, validation, migration.
// No React / no Zustand — testable with vitest.

export type ThemeMode = "dark" | "light" | "system";
export type Language = "zh-CN" | "en";
export type DateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
export type Density = "compact" | "comfortable" | "spacious";
export type AccentColor = "blue" | "cyan" | "pink" | "orange" | "green";
export type AutoSaveInterval = "off" | "30s" | "1m" | "5m";
export type StartupPage = "projects" | "last" | "blank";
export type NotificationFrequency = "immediate" | "batch" | "digest";

export interface AppSettings {
  // ── General ──
  language: Language;
  timezone: string;
  dateFormat: DateFormat;
  defaultExportPath: string;
  autoSaveInterval: AutoSaveInterval;
  startupPage: StartupPage;
  confirmBeforeDelete: boolean;
  volume: number;

  // ── Appearance ──
  theme: ThemeMode;
  fontSize: number;
  density: Density;
  fontFamily: string;
  accentColor: AccentColor;
  brightness: number;
  nightMode: boolean;
  backgroundColor: string;
  chatColor: string;
  codeColor: string;

  // ── Notifications ──
  messageNotification: boolean;
  soundEnabled: boolean;
  emailNotification: boolean;
  popupNotification: boolean;
  phaseCompleteNotification: boolean;
  doNotDisturb: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  errorNotification: boolean;
  mentionNotification: boolean;
  systemAnnouncement: boolean;
  notificationFrequency: NotificationFrequency;

  // ── Accessibility ──
  reduceMotion: boolean;
  highContrast: boolean;
  screenReaderOptimized: boolean;
  focusIndicator: boolean;
  reduceTransparency: boolean;
  lineHeight: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "zh-CN",
  timezone: "Asia/Shanghai",
  dateFormat: "YYYY-MM-DD",
  defaultExportPath: "~/ResearchClaw/Exports",
  autoSaveInterval: "1m",
  startupPage: "projects",
  confirmBeforeDelete: true,
  volume: 50,
  theme: "dark",
  fontSize: 14,
  density: "comfortable",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  accentColor: "blue",
  brightness: 100,
  nightMode: false,
  backgroundColor: "#0d1117",
  chatColor: "#161b22",
  codeColor: "#1e2530",
  messageNotification: true,
  soundEnabled: true,
  emailNotification: false,
  popupNotification: true,
  phaseCompleteNotification: true,
  doNotDisturb: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  errorNotification: true,
  mentionNotification: true,
  systemAnnouncement: true,
  notificationFrequency: "immediate",
  reduceMotion: false,
  highContrast: false,
  screenReaderOptimized: false,
  focusIndicator: false,
  reduceTransparency: false,
  lineHeight: 1.6
};

export const VALID_THEMES: ThemeMode[] = ["dark", "light", "system"];
export const VALID_LANGUAGES: Language[] = ["zh-CN", "en"];
export const VALID_DATE_FORMATS: DateFormat[] = ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"];
export const VALID_DENSITIES: Density[] = ["compact", "comfortable", "spacious"];
export const VALID_ACCENT_COLORS: AccentColor[] = ["blue", "cyan", "pink", "orange", "green"];
export const VALID_AUTO_SAVE_INTERVALS: AutoSaveInterval[] = ["off", "30s", "1m", "5m"];
export const VALID_STARTUP_PAGES: StartupPage[] = ["projects", "last", "blank"];
export const VALID_NOTIFICATION_FREQUENCIES: NotificationFrequency[] = ["immediate", "batch", "digest"];

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 18;
export const BRIGHTNESS_MIN = 50;
export const BRIGHTNESS_MAX = 150;
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 100;
export const LINE_HEIGHT_MIN = 1.2;
export const LINE_HEIGHT_MAX = 2.0;

export function clampFontSize(n: number): number {
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(n)));
}

export function clampBrightness(n: number): number {
  return Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX, Math.round(n)));
}

export function clampVolume(n: number): number {
  return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(n)));
}

export function clampLineHeight(n: number): number {
  const clamped = Math.max(LINE_HEIGHT_MIN, Math.min(LINE_HEIGHT_MAX, n));
  return Math.round(clamped * 10) / 10;
}

export function isValidAccentColor(c: string): c is AccentColor {
  return VALID_ACCENT_COLORS.includes(c as AccentColor);
}

export function isValidHexColor(c: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(c);
}

export function migrateSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SETTINGS };
  }
  const partial = raw as Partial<AppSettings> & { codeFont?: string };

  let fontFamily = DEFAULT_SETTINGS.fontFamily;
  if (typeof partial.fontFamily === "string") {
    fontFamily = partial.fontFamily;
  } else if (typeof partial.codeFont === "string") {
    fontFamily = `${partial.codeFont}, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  }

  return {
    language: VALID_LANGUAGES.includes(partial.language as Language)
      ? (partial.language as Language)
      : DEFAULT_SETTINGS.language,
    timezone: typeof partial.timezone === "string" ? partial.timezone : DEFAULT_SETTINGS.timezone,
    dateFormat: VALID_DATE_FORMATS.includes(partial.dateFormat as DateFormat)
      ? (partial.dateFormat as DateFormat)
      : DEFAULT_SETTINGS.dateFormat,
    defaultExportPath:
      typeof partial.defaultExportPath === "string"
        ? partial.defaultExportPath
        : DEFAULT_SETTINGS.defaultExportPath,
    autoSaveInterval: VALID_AUTO_SAVE_INTERVALS.includes(partial.autoSaveInterval as AutoSaveInterval)
      ? (partial.autoSaveInterval as AutoSaveInterval)
      : DEFAULT_SETTINGS.autoSaveInterval,
    startupPage: VALID_STARTUP_PAGES.includes(partial.startupPage as StartupPage)
      ? (partial.startupPage as StartupPage)
      : DEFAULT_SETTINGS.startupPage,
    confirmBeforeDelete:
      typeof partial.confirmBeforeDelete === "boolean"
        ? partial.confirmBeforeDelete
        : DEFAULT_SETTINGS.confirmBeforeDelete,
    volume: clampVolume(typeof partial.volume === "number" ? partial.volume : DEFAULT_SETTINGS.volume),
    theme: VALID_THEMES.includes(partial.theme as ThemeMode) ? (partial.theme as ThemeMode) : DEFAULT_SETTINGS.theme,
    fontSize: clampFontSize(typeof partial.fontSize === "number" ? partial.fontSize : DEFAULT_SETTINGS.fontSize),
    density: VALID_DENSITIES.includes(partial.density as Density)
      ? (partial.density as Density)
      : DEFAULT_SETTINGS.density,
    fontFamily,
    accentColor: isValidAccentColor(partial.accentColor as string)
      ? (partial.accentColor as AccentColor)
      : DEFAULT_SETTINGS.accentColor,
    brightness: clampBrightness(typeof partial.brightness === "number" ? partial.brightness : DEFAULT_SETTINGS.brightness),
    nightMode: typeof partial.nightMode === "boolean" ? partial.nightMode : DEFAULT_SETTINGS.nightMode,
    backgroundColor: isValidHexColor(partial.backgroundColor as string)
      ? (partial.backgroundColor as string)
      : DEFAULT_SETTINGS.backgroundColor,
    chatColor: isValidHexColor(partial.chatColor as string)
      ? (partial.chatColor as string)
      : DEFAULT_SETTINGS.chatColor,
    codeColor: isValidHexColor(partial.codeColor as string)
      ? (partial.codeColor as string)
      : DEFAULT_SETTINGS.codeColor,
    messageNotification:
      typeof partial.messageNotification === "boolean"
        ? partial.messageNotification
        : DEFAULT_SETTINGS.messageNotification,
    soundEnabled: typeof partial.soundEnabled === "boolean" ? partial.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
    emailNotification: typeof partial.emailNotification === "boolean" ? partial.emailNotification : DEFAULT_SETTINGS.emailNotification,
    popupNotification: typeof partial.popupNotification === "boolean" ? partial.popupNotification : DEFAULT_SETTINGS.popupNotification,
    phaseCompleteNotification:
      typeof partial.phaseCompleteNotification === "boolean"
        ? partial.phaseCompleteNotification
        : DEFAULT_SETTINGS.phaseCompleteNotification,
    doNotDisturb: typeof partial.doNotDisturb === "boolean" ? partial.doNotDisturb : DEFAULT_SETTINGS.doNotDisturb,
    quietHoursStart: typeof partial.quietHoursStart === "string" ? partial.quietHoursStart : DEFAULT_SETTINGS.quietHoursStart,
    quietHoursEnd: typeof partial.quietHoursEnd === "string" ? partial.quietHoursEnd : DEFAULT_SETTINGS.quietHoursEnd,
    errorNotification: typeof partial.errorNotification === "boolean" ? partial.errorNotification : DEFAULT_SETTINGS.errorNotification,
    mentionNotification: typeof partial.mentionNotification === "boolean" ? partial.mentionNotification : DEFAULT_SETTINGS.mentionNotification,
    systemAnnouncement: typeof partial.systemAnnouncement === "boolean" ? partial.systemAnnouncement : DEFAULT_SETTINGS.systemAnnouncement,
    notificationFrequency: VALID_NOTIFICATION_FREQUENCIES.includes(partial.notificationFrequency as NotificationFrequency)
      ? (partial.notificationFrequency as NotificationFrequency)
      : DEFAULT_SETTINGS.notificationFrequency,
    reduceMotion: typeof partial.reduceMotion === "boolean" ? partial.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    highContrast: typeof partial.highContrast === "boolean" ? partial.highContrast : DEFAULT_SETTINGS.highContrast,
    screenReaderOptimized:
      typeof partial.screenReaderOptimized === "boolean"
        ? partial.screenReaderOptimized
        : DEFAULT_SETTINGS.screenReaderOptimized,
    focusIndicator:
      typeof partial.focusIndicator === "boolean" ? partial.focusIndicator : DEFAULT_SETTINGS.focusIndicator,
    reduceTransparency:
      typeof partial.reduceTransparency === "boolean"
        ? partial.reduceTransparency
        : DEFAULT_SETTINGS.reduceTransparency,
    lineHeight: clampLineHeight(
      typeof partial.lineHeight === "number" ? partial.lineHeight : DEFAULT_SETTINGS.lineHeight
    )
  };
}

export const FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
  { value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif', label: "系统默认" },
  { value: '"Inter", ui-sans-serif, system-ui, sans-serif', label: "Inter" },
  { value: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif', label: "Noto Sans SC" },
  { value: '"LXGW WenKai", "PingFang SC", sans-serif', label: "霞鹜文楷" }
];
