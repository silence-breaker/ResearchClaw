import { create } from "zustand";
import { DEMO_API_KEYS, DEMO_SESSIONS, DEFAULT_PRIVACY, type ApiKey, type PrivacySettings, type Session } from "../lib/security";

interface SecurityStore {
  apiKeys: ApiKey[];
  sessions: Session[];
  privacy: PrivacySettings;

  // ── API Keys (TODO(M3): connect to /api/v1/keys) ──
  addApiKey: (name: string) => void;
  revokeApiKey: (id: string) => void;
  regenerateApiKey: (id: string) => void;

  // ── Sessions (TODO(M3): connect to /api/v1/sessions) ──
  terminateSession: (id: string) => void;
  terminateOtherSessions: () => void;

  // ── Privacy (TODO(M3): connect to /api/v1/privacy) ──
  updatePrivacy: (patch: Partial<PrivacySettings>) => void;
}

function generateKey(): string {
  const chars = "abcdef0123456789";
  let result = "sk-rc-";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export const useSecurityStore = create<SecurityStore>()((set) => ({
  apiKeys: [...DEMO_API_KEYS],
  sessions: [...DEMO_SESSIONS],
  privacy: { ...DEFAULT_PRIVACY },

  addApiKey: (name) =>
    set((state) => ({
      apiKeys: [
        ...state.apiKeys,
        {
          id: `key-${Date.now()}`,
          name,
          key: generateKey(),
          createdAt: new Date().toISOString().slice(0, 10)
        }
      ]
    })),

  revokeApiKey: (id) =>
    set((state) => ({
      apiKeys: state.apiKeys.filter((k) => k.id !== id)
    })),

  regenerateApiKey: (id) =>
    set((state) => ({
      apiKeys: state.apiKeys.map((k) =>
        k.id === id ? { ...k, key: generateKey() } : k
      )
    })),

  terminateSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id)
    })),

  terminateOtherSessions: () =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.isCurrent)
    })),

  updatePrivacy: (patch) =>
    set((state) => ({
      privacy: { ...state.privacy, ...patch }
    }))
}));
