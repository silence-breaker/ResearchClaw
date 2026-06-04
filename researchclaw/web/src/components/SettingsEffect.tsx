import { useEffect } from "react";
import { useSettingsStore } from "../stores/settings";

const ACCENT_CSS: Record<string, string> = {
  blue: "#58a6ff",
  cyan: "#22d3ee",
  pink: "#f472b6",
  orange: "#fb923c",
  green: "#4ade80"
};

function resolvedTheme(theme: "dark" | "light" | "system"): "dark" | "light" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function SettingsEffect() {
  const settings = useSettingsStore((s) => s.settings);
  const preview = useSettingsStore((s) => s.preview);

  // Merge preview over settings so draft changes are visible immediately
  const effective = { ...settings, ...preview };

  useEffect(() => {
    const root = document.documentElement;
    const theme = resolvedTheme(effective.theme);

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    root.style.setProperty("--rc-font-size", `${effective.fontSize}px`);
    root.style.setProperty("--rc-font-family", effective.fontFamily);
    root.style.setProperty("--rc-accent", ACCENT_CSS[effective.accentColor] ?? ACCENT_CSS.blue);
    root.style.setProperty("--rc-brightness", `${effective.brightness}%`);
    root.style.setProperty("--rc-bg", effective.backgroundColor);
    root.style.setProperty("--rc-chat-bg", effective.chatColor);
    root.style.setProperty("--rc-code-bg", effective.codeColor);

    const densityMap = { compact: "0.75", comfortable: "1", spacious: "1.25" };
    root.style.setProperty("--rc-density", densityMap[effective.density] ?? "1");
    root.style.setProperty("--rc-line-height", String(effective.lineHeight));

    root.classList.toggle("rc-reduce-motion", effective.reduceMotion);
    root.classList.toggle("rc-high-contrast", effective.highContrast);
    root.classList.toggle("rc-screen-reader", effective.screenReaderOptimized);
    root.classList.toggle("rc-focus-indicator", effective.focusIndicator);
    root.classList.toggle("rc-reduce-transparency", effective.reduceTransparency);
    root.classList.toggle("rc-night-mode", effective.nightMode);
  }, [effective]);

  return null;
}
