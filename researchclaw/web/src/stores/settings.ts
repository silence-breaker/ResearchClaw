import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SETTINGS, migrateSettings, type AppSettings } from "../lib/settings";

interface SettingsState {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

const STORAGE_KEY = "researchclaw-settings";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) =>
        set((state) => ({
          settings: migrateSettings({ ...state.settings, ...patch })
        })),
      reset: () => set({ settings: DEFAULT_SETTINGS })
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ settings: state.settings }),
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { settings: DEFAULT_SETTINGS } as SettingsState;
        }
        const raw = (persistedState as { settings?: unknown }).settings;
        return { settings: migrateSettings(raw) } as SettingsState;
      }
    }
  )
);
