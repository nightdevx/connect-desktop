import { create } from "zustand";
import type { ScreenWatcherMap } from "../services/stream/screen-watchers";

interface ScreenWatchersState {
  /** Share owner user id -> everyone currently watching it. */
  watchersByUserId: ScreenWatcherMap;
  setWatchers: (watchers: ScreenWatcherMap) => void;
}

// One shared empty array: returning a new [] from the selector would make every
// store write look like a change to every tile with no audience.
const EMPTY_LIST: string[] = [];

const EMPTY: ScreenWatcherMap = {};

/**
 * Who is watching each screen share right now.
 *
 * A store rather than a prop because the only thing that draws it is the badge
 * on a share tile, four levels below the shell that owns the LiveKit session —
 * and the audio cue that reacts to it is mounted somewhere else again. Threading
 * it down would have added the same prop to four components that do not
 * otherwise care.
 */
export const useScreenWatchersStore = create<ScreenWatchersState>((set) => ({
  watchersByUserId: EMPTY,
  setWatchers: (watchers) => set({ watchersByUserId: watchers }),
}));

/** Everyone watching one person's share. Stable identity while unchanged. */
export const useScreenWatchers = (userId: string | null): string[] =>
  useScreenWatchersStore((state) =>
    userId ? (state.watchersByUserId[userId] ?? EMPTY_LIST) : EMPTY_LIST,
  );
