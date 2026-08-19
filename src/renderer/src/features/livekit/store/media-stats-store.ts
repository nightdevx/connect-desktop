import { create } from "zustand";
import {
  EMPTY_MEDIA_STATS,
  type MediaStatsSnapshot,
} from "../services/stream/stats-collector";

interface MediaStatsState {
  snapshot: MediaStatsSnapshot;
  setSnapshot: (snapshot: MediaStatsSnapshot) => void;
}

/**
 * The once-a-second WebRTC stats sample, kept out of React's prop tree.
 *
 * The collector emits a fresh snapshot every 1000ms for as long as the user is
 * in a room. Held as state in the session hook it re-rendered the entire
 * workspace shell — rail, sidebar, main panel, stage and chat — once a second
 * whether or not anything on screen depended on a number that had changed.
 *
 * Only three places read it, and all three are small: the connection card, the
 * quality popover behind it, and the headroom line in the screen-share modal.
 * A store lets exactly those subscribe.
 */
export const useMediaStatsStore = create<MediaStatsState>((set) => ({
  snapshot: EMPTY_MEDIA_STATS,
  setSnapshot: (snapshot) => set({ snapshot }),
}));

/** The current sample. Subscribing re-renders the caller once a second. */
export const useMediaStats = (): MediaStatsSnapshot =>
  useMediaStatsStore((state) => state.snapshot);
