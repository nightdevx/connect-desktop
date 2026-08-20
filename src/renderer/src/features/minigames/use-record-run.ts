import { useEffect, useRef, useState } from "react";
import { useUiStore } from "@/store/ui-store";

/**
 * Records a finished run once, and says whether it was a personal best.
 *
 * `key` is the composite "game:difficulty" the record is filed under, not the
 * game — a 30x16 minefield and a 9x9 one are different records, and handing
 * this the game alone is how they would end up sharing one.
 *
 * Every solo game had its own copy of this effect, and every copy had the same
 * two problems. It ran again on each render where the score was still on
 * screen — harmless while the action returned nothing, wrong the moment it
 * returns a verdict, because the second call reports "not a record" for the run
 * that just set one. And nothing reset when a new game was dealt, so the
 * question the result card asks ("was that a record?") had no answer at all.
 *
 * `isOver` going false is what arms it again, which is exactly what pressing
 * "yeni oyun" does.
 */
export function useRecordRun(key: string, isOver: boolean, score: number): boolean {
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
    setIsRecord(recordScore(key, score));
  }, [isOver, score, key, recordScore]);

  return isRecord;
}
