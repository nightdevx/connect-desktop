import { useCallback, useState } from "react";
import { Button } from "antd";
import {
  createBoard,
  hasMoves,
  moveBoard,
  spawnTile,
  WINNING_TILE,
  type Direction,
} from "../../minigames-logic";
import { useArrowKeys } from "../../use-arrow-keys";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";

interface BoardState {
  board: number[];
  score: number;
}

/**
 * Board and score are ONE state object, not two.
 *
 * Split, the move handler had to call setScore from inside the setBoard
 * updater -- which React 18 invokes twice in development, so every merge was
 * counted twice and the score drifted only in dev builds.
 */
export function Game2048() {
  const [state, setState] = useState<BoardState>(() => ({
    board: createBoard(),
    score: 0,
  }));

  const isDead = !hasMoves(state.board);
  // Derived, never stored: a flag would have to be reset by whoever resets the
  // board, and forgetting that is how "Kazandın" survives into the next game.
  const hasWon = state.board.some((value) => value >= WINNING_TILE);

  const isRecord = useRecordRun("2048", isDead, state.score);

  const handleDirection = useCallback((direction: Direction) => {
    setState((current) => {
      const result = moveBoard(current.board, direction);
      // A move that changes nothing must not spawn a tile, or holding a
      // direction against a wall fills the board without playing.
      if (!result.moved) {
        return current;
      }
      return {
        board: spawnTile(result.board),
        score: current.score + result.gained,
      };
    });
  }, []);

  useArrowKeys(handleDirection);

  const reset = () => setState({ board: createBoard(), score: 0 });

  return (
    <div className="ct-minigame">
      <div className="ct-minigame-bar">
        <span className="ct-minigame-metric">
          <span className="ct-minigame-metric-label">Puan</span>
          <strong>{state.score}</strong>
        </span>
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      </div>

      <div className="ct-minigame-stage">
        <div
          className="ct-minigame-board ct-2048-board"
          aria-label="2048 tahtası"
          data-state={isDead ? "lost" : hasWon ? "won" : undefined}
        >
          {state.board.map((value, index) => (
            <div
              // The VALUE is part of the key, not just the position. The board
              // is sixteen slots rewritten in place, so keying on position
              // alone reuses the DOM node — and a reused node does not restart
              // its animation, which is the whole of the pop below. Sixteen
              // remounts on a move is nothing.
              key={`${index}-${value}`}
              className="ct-2048-cell"
              // Styled by attribute rather than by a class per value: the palette
              // is a stylesheet decision, and 11 className branches in here would
              // move it into the component.
              //
              // undefined, NOT "": React renders an empty string as a present
              // attribute, and `[data-value]` matches on presence — so every
              // empty cell was painted as a filled tile.
              data-value={value === 0 ? undefined : Math.min(value, WINNING_TILE)}
            >
              {value === 0 ? "" : value}
            </div>
          ))}
        </div>

        {isDead ? (
          <GameOutcome
            tone="lost"
            title="Hamle kalmadı"
            detail={`${state.score} puan`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null}
      </div>

      <p className="ct-minigame-hint">
        {hasWon ? "2048! İstersen devam et." : "Ok tuşları veya WASD ile kaydır."}
      </p>
    </div>
  );
}
