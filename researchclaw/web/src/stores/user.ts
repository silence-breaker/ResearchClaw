import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_USER_STATE, migrateUserState, generateUserId, type UserProfile, type UserState } from "../lib/user";

interface UserStore extends UserState {
  // ── Queries ──
  currentUser: () => UserProfile;

  // ── Mutations (TODO(M3): replace with API calls) ──
  switchUser: (id: string) => void;
  updateCurrentUser: (patch: Partial<Omit<UserProfile, "id" | "account" | "email">>) => void;
  addUser: (profile: Omit<UserProfile, "id">) => void;
  removeUser: (id: string) => void;
  logout: () => void;
}

const STORAGE_KEY = "researchclaw-users";

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_USER_STATE,

      currentUser: () => {
        const state = get();
        return state.users.find((u) => u.id === state.currentUserId) ?? state.users[0] ?? DEFAULT_USER_STATE.users[0];
      },

      switchUser: (id) => {
        // TODO(M3): POST /api/v1/auth/switch { userId }
        set((state) => {
          if (!state.users.some((u) => u.id === id)) return state;
          return { currentUserId: id };
        });
      },

      updateCurrentUser: (patch) => {
        // TODO(M3): PATCH /api/v1/users/{id} { ...patch }
        set((state) => {
          const nextUsers = state.users.map((u) =>
            u.id === state.currentUserId ? { ...u, ...patch } : u
          );
          return { users: nextUsers };
        });
      },

      addUser: (profile) => {
        // TODO(M3): POST /api/v1/auth/register { ...profile }
        const id = generateUserId();
        const newUser: UserProfile = { ...profile, id };
        set((state) => ({
          users: [...state.users, newUser],
          currentUserId: id
        }));
      },

      removeUser: (id) => {
        // TODO(M3): DELETE /api/v1/users/{id}
        set((state) => {
          const nextUsers = state.users.filter((u) => u.id !== id);
          if (nextUsers.length === 0) {
            // Don't remove the last user; reset to default instead
            return { users: DEFAULT_USER_STATE.users, currentUserId: DEFAULT_USER_STATE.users[0].id };
          }
          const nextCurrent = state.currentUserId === id ? nextUsers[0].id : state.currentUserId;
          return { users: nextUsers, currentUserId: nextCurrent };
        });
      },

      logout: () => {
        // TODO(M3): POST /api/v1/auth/logout
        // For now, just clear current user selection state (or redirect to login)
        // In a real app this would clear auth tokens and redirect.
        set({ currentUserId: "", users: [] });
      }
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== "object") {
          return { ...DEFAULT_USER_STATE } as UserStore;
        }
        const raw = persisted as { currentUserId?: unknown; users?: unknown };
        return migrateUserState({ currentUserId: raw.currentUserId, users: raw.users }) as UserStore;
      }
    }
  )
);
