import { useEffect, useRef } from "react";
import { useUiStore } from "@/store/ui-store";
import { MINIGAME_IDS, tracksScore } from "@/store/minigame-scores";
import { scoreService } from "./score-service";

/**
 * Keeps this machine's records and the server's in step.
 *
 * A hook rather than a call inside recordMinigameScore, because that action
 * lives in the ui store and the store may not import a feature -- everything
 * imports the store, so the arrow only points one way. This mounts once, in the
 * page that owns the games, which is also the only place a solo score can be
 * earned.
 *
 * The reconciliation is deliberately both ways, and both directions are real:
 *
 *   UP    Every local record is submitted on mount. The games run offline by
 *         design, so a run finished with the backend unreachable exists only
 *         here until something sends it. Submitting is idempotent -- the server
 *         keeps a score only if it beats what it has -- so re-sending the same
 *         number on every launch costs one request and changes nothing.
 *   DOWN  The server's records are merged back in, which is what puts a record
 *         set on the user's OTHER machine onto this one. localStorage stops
 *         being the truth and becomes the copy that survives being offline.
 */
export function useScoreSync(): void {
  const bestScores = useUiStore((state) => state.minigameBestScores);
  const recordScore = useUiStore((state) => state.recordMinigameScore);

  // What has already been sent, so the effect below fires on a NEW record and
  // not on every render that happens to touch the store.
  const submittedRef = useRef<Map<string, number>>(new Map());

  // Read inside the mount effect rather than depended on: this runs once, with
  // whatever records localStorage had, and re-running it on every change is
  // what the second effect is for.
  const bestScoresRef = useRef(bestScores);
  bestScoresRef.current = bestScores;

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      // UP first. Doing it the other way round would let the server's answer
      // overwrite a better local record before it had been offered.
      const local = bestScoresRef.current;
      for (const game of MINIGAME_IDS) {
        const score = local[game];
        if (score === undefined || !tracksScore(game)) {
          continue;
        }
        submittedRef.current.set(game, score);
        await scoreService.submitScore(game, score);
      }

      if (cancelled) {
        return;
      }

      const result = await scoreService.listScores();
      if (cancelled || !result.ok) {
        // A failed sync is silent on purpose. The page still works, the records
        // are still on screen, and an error banner about a leaderboard nobody
        // asked for would be noise on a game page.
        return;
      }

      for (const [game, score] of Object.entries(result.data?.scores ?? {})) {
        // recordMinigameScore, not a blind write: it applies the same
        // better-or-nothing rule the server does, so a stale server value
        // cannot pull a local record backwards.
        recordScore(game as (typeof MINIGAME_IDS)[number], score);
        submittedRef.current.set(game, score);
      }
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [recordScore]);

  // Every later record, as it is set. The store is written by the games the
  // moment one ends, so this is what carries a fresh record to the board.
  useEffect(() => {
    for (const game of MINIGAME_IDS) {
      const score = bestScores[game];
      if (score === undefined || !tracksScore(game)) {
        continue;
      }
      if (submittedRef.current.get(game) === score) {
        continue;
      }
      submittedRef.current.set(game, score);
      void scoreService.submitScore(game, score);
    }
  }, [bestScores]);
}
