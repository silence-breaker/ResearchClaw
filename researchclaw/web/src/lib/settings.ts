// Pure settings utilities: defaults, validation, migration.
// No React / no Zustand — testable with vitest.

export type ThemeMode = "dark" | "light" | "system";
export type Language = "zh-CN" | "en";
export type DateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
export type Density = "compact" | "comfortable" | "spacious";
export type AccentColor = "blue" | "cyan" | "pink" | "orange" | "green";
export type CodeFont = "JetBrains Mono" | "Fira Code" | "SF Mono";

export interface AppSettings {
  theme: ThemeMode;
  language: Language;
  dateFormat: DateFormat;
  fontSize: number;
  density: Density;
  codeFont: CodeFont;
  accentColor: AccentColor;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  language: "zh-CN",
  dateFormat: "YYYY-MM-DD",
  fontSize: 14,
  density: "comfortable",
  codeFont: "JetBrains Mono",
  accentColor: "blue"
};

export const VALID_THEMES: ThemeMode[] = ["dark", "light", "system"];
export const VALID_LANGUAGES: Language[] = ["zh-CN", "en"];
export const VALID_DATE_FORMATS: DateFormat[] = ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"];
export const VALID_DENSITIES: Density[] = ["compact", "comfortable", "spacious"];
export const VALID_ACCENT_COLORS: AccentColor[] = ["blue", "cyan", "pink", "orange", "green"];
export const VALID_CODE_FONTS: CodeFont[] = ["JetBrains Mono", "Fira Code", "SF Mono"];

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 18;

export function clampFontSize(n: number): number {
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(n)));
}

export function isValidAccentColor(c: string): c is AccentColor {
  return VALID_ACCENT_COLORS.includes(c as AccentColor);
}

export function isValidCodeFont(f: string): f is CodeFont {
  return VALID_CODE_FONTS.includes(f as CodeFont);
}

export function migrateSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SETTINGS };
  }
  const partial = raw as Partial<AppSettings>;
  return {
    theme: VALID_THEMES.includes(partial.theme as ThemeMode) ? (partial.theme as ThemeMode) : DEFAULT_SETTINGS.theme,
    language: VALID_LANGUAGES.includes(partial.language as Language)
      ? (partial.language as Language)
      : DEFAULT_SETTINGS.language,
    dateFormat: VALID_DATE_FORMATS.includes(partial.dateFormat as DateFormat)
      ? (partial.dateFormat as DateFormat)
      : DEFAULT_SETTINGS.dateFormat,
    fontSize: clampFontSize(typeof partial.fontSize === "number" ? partial.fontSize : DEFAULT_SETTINGS.fontSize),
    density: VALID_DENSITIES.includes(partial.density as Density)
      ? (partial.density as Density)
      : DEFAULT_SETTINGS.density,
    codeFont: isValidCodeFont(partial.codeFont as string) ? (partial.codeFont as CodeFont) : DEFAULT_SETTINGS.codeFont,
    accentColor: isValidAccentColor(partial.accentColor as string)
      ? (partial.accentColor as AccentColor)
      : DEFAULT_SETTINGS.accentColor
  };
}
