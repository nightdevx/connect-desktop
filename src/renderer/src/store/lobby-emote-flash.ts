import { create } from "zustand";

export interface LobbyEmoteFlash {
  label: string;
  emote: string;
  at: number;
}

interface LobbyEmoteFlashState {
  flashes: Record<string, LobbyEmoteFlash>;
  flash: (userId: string, entry: LobbyEmoteFlash, holdMs: number) => void;
  clear: (userId: string, at: number) => void;
}

const DEFAULT_HOLD_MS = 2600;
const MAX_HOLD_MS = 6000;

export const useLobbyEmoteFlashStore = create<LobbyEmoteFlashState>((set, get) => ({
  flashes: {},

  flash: (userId, entry, holdMs) => {
    if (!userId) return;

    set((state) => ({ flashes: { ...state.flashes, [userId]: entry } }));

    const hold = Math.min(Math.max(holdMs || DEFAULT_HOLD_MS, 800), MAX_HOLD_MS);
    window.setTimeout(() => get().clear(userId, entry.at), hold);
  },

  clear: (userId, at) => {
    set((state) => {
      if (state.flashes[userId]?.at !== at) {
        return state;
      }
      const next = { ...state.flashes };
      delete next[userId];
      return { flashes: next };
    });
  },
}));

export const useLobbyEmoteFlash = (userId: string): LobbyEmoteFlash | undefined =>
  useLobbyEmoteFlashStore((state) => state.flashes[userId]);
