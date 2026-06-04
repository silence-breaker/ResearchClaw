import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SETTINGS, migrateSettings, type AppSettings } from "../lib/settings";

interface SettingsState {
  settings: AppSettings;
  preview: Partial<AppSettings> | null;
  update: (patch: Partial<AppSettings>) => void;
  setPreview: (patch: Partial<AppSettings> | null) => void;
  reset: () => void;
}

const STORAGE_KEY = "researchclaw-settings";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      preview: null,
      update: (patch) =>
        set((state) => ({
          settings: migrateSettings({ ...state.settings, ...patch }),
          preview: null
        })),
      setPreview: (patch) => set({ preview: patch }),
      reset: () => set({ settings: DEFAULT_SETTINGS, preview: null })
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ settings: state.settings }),
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { settings: DEFAULT_SETTINGS, preview: null } as SettingsState;
        }
        const raw = (persistedState as { settings?: unknown }).settings;
        return { settings: migrateSettings(raw), preview: null } as SettingsState;
      }
    }
  )
);
