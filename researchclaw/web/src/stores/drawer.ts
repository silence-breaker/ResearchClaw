import { create } from "zustand";

// Holds the artifact ref currently shown in the detail drawer. Any tab / column
// can call open(ref); the drawer is rendered once in Panel. Keeps us from prop
// drilling the selected ref through center and right columns.
interface DrawerStore {
  ref: string | null;
  open: (ref: string) => void;
  close: () => void;
}

export const useArtifactDrawer = create<DrawerStore>((set) => ({
  ref: null,
  open: (ref) => set({ ref }),
  close: () => set({ ref: null })
}));
