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

// Applies settings to the DOM so every route sees them.
export function SettingsEffect() {
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    const root = document.documentElement;
    const effective = resolvedTheme(settings.theme);

    if (effective === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    root.style.setProperty("--rc-font-size", `${settings.fontSize}px`);
    root.style.setProperty("--rc-code-font", settings.codeFont);
    root.style.setProperty("--rc-accent", ACCENT_CSS[settings.accentColor] ?? ACCENT_CSS.blue);

    const densityMap = { compact: "0.75", comfortable: "1", spacious: "1.25" };
    root.style.setProperty("--rc-density", densityMap[settings.density] ?? "1");

    // Accessibility flags
    root.classList.toggle("rc-reduce-motion", settings.reduceMotion);
    root.classList.toggle("rc-high-contrast", settings.highContrast);
    root.classList.toggle("rc-screen-reader", settings.screenReaderOptimized);
    root.classList.toggle("rc-focus-indicator", settings.focusIndicator);
  }, [settings]);

  return null;
}
