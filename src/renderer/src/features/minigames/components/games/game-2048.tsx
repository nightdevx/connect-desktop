import { useCallback, useMemo, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import {
  createBoard,
  hasMoves,
  moveBoard,
  spawnTile,
  WINNING_TILE,
  type Direction,
} from "../../minigames-logic";
import { RULES_2048 } from "../../difficulty";
import { useArrowKeys } from "../../use-arrow-keys";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

interface BoardState {
  board: number[];
  score: number;
  /** Where the last spawn landed, so only that tile pops. */
  spawned: number | null;
}

/**
 * Board and score are ONE state object, not two.
 *
 * Split, the move handler had to call setScore from inside the setBoard
 * updater -- which React 18 invokes twice in development, so every merge was
 * counted twice and the score drifted only in dev builds.
 */
export function Game2048({ difficulty }: MinigameBoardProps) {
  const { size } = RULES_2048[difficulty];

  const [state, setState] = useState<BoardState>(() => ({
    board: createBoard(size),
    score: 0,
    spawned: null,
  }));

  const isDead = !hasMoves(state.board, size);
  // Derived, never stored: a flag would have to be reset by whoever resets the
  // board, and forgetting that is how "Kazandın" survives into the next game.
  const best = useMemo(() => Math.max(...state.board), [state.board]);
  const hasWon = best >= WINNING_TILE;

  const isRecord = useRecordRun(scoreKey("2048", difficulty), isDead, state.score);

  const handleDirection = useCallback(
    (direction: Direction) => {
      setState((current) => {
        const result = moveBoard(current.board, direction, size);
        // A move that changes nothing must not spawn a tile, or holding a
        // direction against a wall fills the board without playing.
        if (!result.moved) {
          return current;
        }

        const spawnedBoard = spawnTile(result.board);
        // The one cell that differs is the one that appeared. Found here rather
        // than returned by spawnTile so the pure function keeps its shape.
        const spawned = spawnedBoard.findIndex(
          (value, index) => value !== result.board[index],
        );

        return {
          board: spawnedBoard,
          score: current.score + result.gained,
          spawned: spawned < 0 ? null : spawned,
        };
      });
    },
    [size],
  );

  useArrowKeys(handleDirection);

  const reset = () =>
    setState({ board: createBoard(size), score: 0, spawned: null });

  return (
    <GameShell
      columns={size}
      rows={size}
      hud={[
        { label: "Puan", value: state.score },
        { label: "En büyük", value: best, tone: hasWon ? "record" : undefined },
      ]}
      actions={
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      }
      status={{
        text: hasWon
          ? "2048'e ulaştın. İstersen devam et."
          : "Ok tuşları veya WASD ile kaydır.",
        tone: hasWon ? "done" : "idle",
      }}
      overlay={
        isDead ? (
          <GameOutcome
            tone="lost"
            title="Hamle kalmadı"
            detail={`${state.score} puan`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null
      }
    >
      <div className="ct-board ct-2048-board" aria-label="2048 tahtası">
        {state.board.map((value, index) => (
          <div
            // The VALUE is part of the key, not just the position. The board is
            // a fixed set of slots rewritten in place, so keying on position
            // alone reuses the DOM node -- and a reused node does not restart
            // its animation, which is the whole of the pop.
            key={`${index}-${value}`}
            className="ct-2048-cell"
            // A step on the ramp rather than the raw number: the palette is a
            // stylesheet decision, and eleven className branches in here would
            // move it into the component.
            //
            // undefined, NOT "": React renders an empty string as a PRESENT
            // attribute, and `[data-tier]` matches on presence -- so every
            // empty cell was painted as a filled tile.
            data-tier={value === 0 ? undefined : tierOf(value)}
            data-spawn={state.spawned === index ? "true" : undefined}
            data-digits={value === 0 ? undefined : String(value).length}
          >
            {value === 0 ? "" : value}
          </div>
        ))}
      </div>
    </GameShell>
  );
}

/**
 * Which step of the ramp a tile sits on.
 *
 * Five buckets rather than one per value: the ramp climbs in luminance and the
 * eye cannot tell 512 from 1024 by shade anyway. What it CAN tell is "this is
 * the hot end", which is what tier 5 is for.
 */
function tierOf(value: number): number {
  if (value <= 4) return 1;
  if (value <= 16) return 2;
  if (value <= 64) return 3;
  if (value <= 256) return 4;
  return 5;
}
