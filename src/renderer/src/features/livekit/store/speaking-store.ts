import { create } from "zustand";

interface SpeakingState {
  /** Everyone the client currently believes is talking, sorted by user id. */
  speakingUserIds: string[];
  setSpeakingUserIds: (userIds: string[]) => void;
}

const EMPTY: string[] = [];

const isSameSet = (previous: string[], next: string[]): boolean =>
  previous.length === next.length &&
  previous.every((userId, index) => userId === next[index]);

/**
 * Who is talking right now, for surfaces outside the stage.
 *
 * The stage derives this per participant from the media map it is already
 * handed. The sidebar roster is not: it sits three components away from the
 * LiveKit session, and speaking flips several times a second — threading it
 * down as a prop would re-render the whole lobby list, with its avatars,
 * dropdowns and popovers, on every syllable.
 *
 * Same shape and same reasoning as the screen-watchers store beside it: a store
 * write, and one subscription per element that actually draws a ring.
 */
export const useSpeakingStore = create<SpeakingState>((set) => ({
  speakingUserIds: EMPTY,
  setSpeakingUserIds: (userIds) =>
    set((state) =>
      // A new array only when the SET changed, so a store write that says the
      // same thing does not wake every subscriber up.
      isSameSet(state.speakingUserIds, userIds)
        ? state
        : { speakingUserIds: userIds },
    ),
}));

/** Whether one person is talking. Boolean, so the row re-renders only on flips. */
export const useIsSpeaking = (userId: string | null | undefined): boolean =>
  useSpeakingStore((state) =>
    userId ? state.speakingUserIds.includes(userId) : false,
  );
