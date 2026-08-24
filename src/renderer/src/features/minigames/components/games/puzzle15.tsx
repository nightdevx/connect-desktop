import { useCallback, useMemo, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_PUZZLE } from "../../difficulty";
import {
  createSlidePuzzle,
  isSlideSolved,
  slideNeighbours,
  slideTile,
} from "../../solo-logic";
import { useArrowKeys } from "../../use-arrow-keys";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";
import type { Direction } from "../../minigames-logic";

/**
 * The sliding tile puzzle. Score is moves, so a move that changes nothing must
 * not be counted -- which is why slideTile returns the same object when the
 * tile is not next to the hole and this compares by identity.
 *
 * The arrow keys move the tile INTO the hole rather than moving the hole, which
 * is the way round everybody expects: pressing left slides the tile on the
 * right of the gap leftwards.
 */
export function Puzzle15({ difficulty }: MinigameBoardProps) {
  const { size, shuffle } = RULES_PUZZLE[difficulty];

  const [puzzle, setPuzzle] = useState(() => createSlidePuzzle(size, shuffle));
  const [moves, setMoves] = useState(0);

  const hasWon = useMemo(() => isSlideSolved(puzzle), [puzzle]);
  const isRecord = useRecordRun(scoreKey("puzzle15", difficulty), hasWon, moves);

  const hole = puzzle.tiles.indexOf(0);
  const movable = useMemo(() => slideNeighbours(hole, size), [hole, size]);

  /**
   * Both counters are written from OUTSIDE the state updater, deliberately.
   *
   * The obvious shape -- bump the move count inside setPuzzle, where the old
   * board is in scope -- is the bug game-2048 documents: React 18 invokes an
   * updater twice in development, so every slide would be counted twice and the
   * score would drift in dev builds only.
   */
  const push = useCallback(
    (cell: number) => {
      const next = slideTile(puzzle, cell);
      // Identity, not a deep compare: slideTile returns the SAME object for a
      // refused move, which is what makes "did anything happen" free.
      if (next === puzzle) {
        return;
      }
      setPuzzle(next);
      setMoves((value) => value + 1);
    },
    [puzzle],
  );

  const handleDirection = useCallback(
    (direction: Direction) => {
      const gap = puzzle.tiles.indexOf(0);
      const column = gap % puzzle.size;
      const row = Math.floor(gap / puzzle.size);

      // Pressing left means "slide something in from the right", so the cell
      // that moves is on the far side of the hole from the key.
      const from: Record<Direction, number | null> = {
        left: column < puzzle.size - 1 ? gap + 1 : null,
        right: column > 0 ? gap - 1 : null,
        up: row < puzzle.size - 1 ? gap + puzzle.size : null,
        down: row > 0 ? gap - puzzle.size : null,
      };

      const cell = from[direction];
      if (cell === null) {
        return;
      }
      push(cell);
    },
    [puzzle, push],
  );

  useArrowKeys(handleDirection);

  const reset = () => {
    setPuzzle(createSlidePuzzle(size, shuffle));
    setMoves(0);
  };

  return (
    <GameShell
      columns={size}
      rows={size}
      hud={[
        { label: "Hamle", value: moves },
        { label: "Tahta", value: `${size}x${size}` },
      ]}
      actions={
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      }
      status={{
        text: "Boşluğun yanındaki taşa tıkla — ya da ok tuşlarını kullan.",
        tone: hasWon ? "done" : "idle",
      }}
      overlay={
        hasWon ? (
          <GameOutcome
            tone="won"
            title="Sıraya dizildi"
            detail={`${moves} hamle`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null
      }
    >
      <div
        className="ct-board ct-puzzle-board"
        aria-label="Sayı kaydırma tahtası"
        data-state={hasWon ? "won" : undefined}
      >
        {puzzle.tiles.map((value, index) => (
          <button
            key={index}
            type="button"
            className="ct-puzzle-tile"
            data-empty={value === 0 ? "true" : undefined}
            data-movable={movable.includes(index) ? "true" : undefined}
            // A tile already where it belongs wears the accent, which turns the
            // endgame into something you can see rather than count.
            data-home={value !== 0 && value === index + 1 ? "true" : undefined}
            disabled={value === 0 || !movable.includes(index)}
            onClick={() => push(index)}
            aria-label={value === 0 ? "Boşluk" : String(value)}
          >
            {value === 0 ? "" : value}
          </button>
        ))}
      </div>
    </GameShell>
  );
}
