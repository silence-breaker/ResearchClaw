import { create } from "zustand";
import { DEMO_MODELS, clampTokenLimit, type ModelConfig, type ModelStatus } from "../lib/model";

interface ModelState {
  /** List of available models. TODO(M2): replace with API fetch. */
  models: ModelConfig[];

  // ── Mutations (TODO(M2): add API calls) ──
  /** Update model display name. TODO(M2): PATCH /api/v1/models/{id} { name } */
  renameModel: (id: string, name: string) => void;
  /** Set token consumption limit. TODO(M2): PATCH /api/v1/models/{id} { tokenLimit } */
  setTokenLimit: (id: string, limit: number) => void;
  /** Forcibly stop or resume a model. TODO(M2): POST /api/v1/models/{id}/stop or /resume */
  toggleStop: (id: string) => void;
  /** Update status from backend polling. TODO(M2): called by polling loop / WebSocket. */
  updateStatus: (id: string, status: ModelStatus, tokensUsed?: number) => void;
  /** Refresh model list. TODO(M2): GET /api/v1/models */
  refreshModels: () => void;
}

export const useModelStore = create<ModelState>()((set) => ({
  models: [...DEMO_MODELS],

  renameModel: (id, name) =>
    set((state) => ({
      models: state.models.map((m) => (m.id === id ? { ...m, name } : m))
    })),

  setTokenLimit: (id, limit) =>
    set((state) => ({
      models: state.models.map((m) =>
        m.id === id ? { ...m, tokenLimit: clampTokenLimit(limit) } : m
      )
    })),

  toggleStop: (id) =>
    set((state) => ({
      models: state.models.map((m) => {
        if (m.id !== id) return m;
        const nextStopped = !m.isStopped;
        return {
          ...m,
          isStopped: nextStopped,
          status: nextStopped ? "stopped" : "idle"
        };
      })
    })),

  updateStatus: (id, status, tokensUsed) =>
    set((state) => ({
      models: state.models.map((m) => {
        if (m.id !== id) return m;
        // If model is forcibly stopped, ignore backend status updates
        if (m.isStopped && status !== "stopped") return m;
        return {
          ...m,
          status,
          tokensUsed: tokensUsed ?? m.tokensUsed
        };
      })
    })),

  refreshModels: () => {
    // TODO(M2): fetch('/api/v1/models').then(r => r.json()).then(data => set({ models: adapt(data) }))
    // For now, just reset to demo data
    set({ models: [...DEMO_MODELS] });
  }
}));
