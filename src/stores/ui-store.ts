"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UiState {
  cartOpen: boolean;
  mobileNavOpen: boolean;
  searchOpen: boolean;
  setCartOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  cartOpen: false,
  mobileNavOpen: false,
  searchOpen: false,
  setCartOpen: (cartOpen) => set({ cartOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
}));

interface RecentlyViewedState {
  ids: string[];
  add: (id: string) => void;
  clear: () => void;
}

/** Recently viewed products, persisted locally (no server round-trip, no PII). */
export const useRecentlyViewed = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      ids: [],
      add: (id) => set((s) => ({ ids: [id, ...s.ids.filter((x) => x !== id)].slice(0, 12) })),
      clear: () => set({ ids: [] }),
    }),
    { name: "atelier-recently-viewed", storage: createJSONStorage(() => localStorage) },
  ),
);
