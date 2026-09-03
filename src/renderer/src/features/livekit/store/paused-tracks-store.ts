import { create } from "zustand";
import {
  pausedTrackKey,
  type PausedTrackKind,
  type PausedTrackMap,
} from "../services/stream/types";

const EMPTY: PausedTrackMap = {};

interface PausedTracksState {
  pausedByKey: PausedTrackMap;
  setPaused: (paused: PausedTrackMap) => void;
  reset: () => void;
}

export const usePausedTracksStore = create<PausedTracksState>((set) => ({
  pausedByKey: EMPTY,
  setPaused: (paused) => set({ pausedByKey: paused }),
  reset: () =>
    set((state) =>
      Object.keys(state.pausedByKey).length === 0
        ? state
        : { pausedByKey: EMPTY },
    ),
}));

export const useTrackPaused = (
  userId: string | null | undefined,
  kind: PausedTrackKind | null,
): boolean =>
  usePausedTracksStore((state) =>
    userId && kind
      ? (state.pausedByKey[pausedTrackKey(userId, kind)] ?? false)
      : false,
  );
