import { useEffect, useRef, useState } from "react";
import { useUiStore } from "@/store/ui-store";
import type { MinigameId } from "@/store/minigame-scores";

/**
 * Records a finished run once, and says whether it was a personal best.
 *
 * Every solo game had its own copy of this effect, and every copy had the same
 * two problems. It ran again on each render where the score was still on screen
 * — harmless while the action returned nothing, wrong the moment it returns a
 * verdict, because the second call reports "not a record" for the run that just
 * set one. And nothing reset when a new game was dealt, so the fourth argument
 * of the story ("was that a record?") had no answer at all.
 *
 * `isOver` going false is what arms it again, which is exactly what pressing
 * "yeni oyun" does.
 */
export function useRecordRun(game: MinigameId, isOver: boolean, score: number): boolean {
  const recordScore = useUiStore((state) => state.recordMinigameScore);
  const [isRecord, setIsRecord] = useState(false);
  const recorded = useRef(false);

  useEffect(() => {
    if (!isOver) {
      recorded.current = false;
      setIsRecord(false);
      return;
    }

    // The score keeps arriving in the dependency list while the result screen
    // is up; only the first crossing of the finish line is a run.
    if (recorded.current) {
      return;
    }
    recorded.current = true;
    setIsRecord(recordScore(game, score));
  }, [isOver, score, game, recordScore]);

  return isRecord;
}
