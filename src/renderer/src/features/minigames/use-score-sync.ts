import { useCallback, useEffect, useRef, useState } from "react";
import { useUiStore } from "@/store/ui-store";
import { splitScoreKey, tracksScore, type MinigameId } from "@/store/minigame-scores";
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
 *
 * It returns a counter, bumped whenever a submission has LANDED, and that
 * number is the whole point of the return value. The leaderboard used to
 * refetch when the local record changed -- which is the instant the game ends,
 * before the score has left the machine. The read and the write raced, the read
 * usually won, and the board came back without the run that had just been
 * played. Pressing refresh was the only way to see it, which is exactly the
 * complaint. Waiting for the write to finish is the fix.
 */
export function useScoreSync(): number {
  const bestScores = useUiStore((state) => state.minigameBestScores);
  const recordScore = useUiStore((state) => state.recordMinigameScore);
  const [syncedAt, setSyncedAt] = useState(0);

  // A counter rather than a timestamp: two submissions inside one millisecond
  // are one value, and this is a dependency that has to change every time.
  const markSynced = useCallback(() => setSyncedAt((value) => value + 1), []);

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
      //
      // Over the KEYS of the map, not over the game ids: a key is
      // "game:difficulty", so a loop over the seven games finds nothing at all.
      // That is not a missing record, it is silence -- the submission never
      // happens and the board never learns the run took place.
      const local = bestScoresRef.current;
      for (const [key, score] of Object.entries(local)) {
        if (!isSendable(key, score)) {
          continue;
        }
        submittedRef.current.set(key, score);
        await scoreService.submitScore(key, score);
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

      for (const [key, score] of Object.entries(result.data?.scores ?? {})) {
        // recordMinigameScore, not a blind write: it applies the same
        // better-or-nothing rule the server does, so a stale server value
        // cannot pull a local record backwards. It also drops anything whose
        // key this build does not recognise, which is what a server one version
        // ahead would send.
        recordScore(key, score);
        submittedRef.current.set(key, score);
      }

      // The catch-up is done and the server has whatever this machine was
      // holding, so anything reading the board now reads it complete.
      markSynced();
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [recordScore, markSynced]);

  // Every later record, as it is set. The store is written by the games the
  // moment one ends, so this is what carries a fresh record to the board.
  useEffect(() => {
    const pending: Promise<unknown>[] = [];

    for (const [key, score] of Object.entries(bestScores)) {
      if (!isSendable(key, score)) {
        continue;
      }
      if (submittedRef.current.get(key) === score) {
        continue;
      }
      submittedRef.current.set(key, score);
      pending.push(scoreService.submitScore(key, score));
    }

    if (pending.length === 0) {
      return;
    }

    // Bumped after the write RESOLVES, whichever way it went. A submission that
    // lost to a better stored score still means the board is now current, and a
    // failed one means a refetch is the only thing that can put it right.
    void Promise.allSettled(pending).then(markSynced);
  }, [bestScores, markSynced]);

  return syncedAt;
}

/**
 * Whether a stored entry is one the server will take.
 *
 * The two-player ids can never be in the map -- the store refuses them -- but
 * the map also survives builds, and a key left behind by a game that has since
 * been renamed would otherwise be re-offered on every launch and 400 every
 * time.
 */
function isSendable(key: string, score: number): boolean {
  if (!Number.isFinite(score)) {
    return false;
  }
  const { game } = splitScoreKey(key);
  return tracksScore(game as MinigameId);
}
