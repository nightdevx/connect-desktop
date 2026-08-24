import { useEffect, useRef } from "react";
import { soundEffectManager, type MinigameCue } from "@/features/sound-effects";

/**
 * Plays a table sound whenever `signal` changes -- and never on arrival.
 *
 * The boards are re-rendered from server snapshots, so "did something happen"
 * is not an event anywhere, it is a value that differs from the last one. That
 * value is what this watches: the top card of a pile, the number of tiles in a
 * hand, how many shells have landed.
 *
 * Silent on the first render on purpose. Sitting down at a table that is already
 * in progress would otherwise replay its whole history at once -- and joining a
 * game as a spectator would greet you with a burst of gunfire.
 *
 * Sound is a bigger part of a game feeling real than most of the pixels are, and
 * this is the entire cost of it: the cues are synthesised (see
 * sound-effects/manager.ts), so there is no audio file anywhere in the app, and
 * nothing to download, licence, or ship in the installer.
 */
export function useMinigameCue(cue: MinigameCue, signal: string | number): void {
  // Seeded with the first value rather than with a sentinel: a hand that starts
  // at zero tiles and a board that starts with nothing fired must both count as
  // "nothing has happened yet".
  const previous = useRef(signal);

  useEffect(() => {
    if (previous.current === signal) {
      return;
    }
    previous.current = signal;
    soundEffectManager.playMinigameCue(cue);
  }, [cue, signal]);
}
