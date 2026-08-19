import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "antd";
import {
  createSnake,
  SNAKE_COLUMNS,
  SNAKE_ROWS,
  stepSnake,
  turnSnake,
  type Direction,
  type Point,
} from "../../minigames-logic";
import { useArrowKeys } from "../../use-arrow-keys";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";

const VECTORS: Record<Direction, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const BASE_TICK_MS = 170;
const FASTEST_TICK_MS = 70;

export function Snake() {
  const [state, setState] = useState(() => createSnake());

  // The whole difficulty curve. Recomputed rather than stored so it cannot get
  // out of step with the score it is derived from.
  const tickMs = Math.max(FASTEST_TICK_MS, BASE_TICK_MS - state.score * 4);

  const isRecord = useRecordRun("snake", !state.alive, state.score);

  useEffect(() => {
    if (!state.alive) {
      return;
    }
    // Re-created every time the speed changes, which is once per food. An
    // interval cannot have its delay changed in place, and the alternative --
    // a chain of setTimeouts -- leaks one pending timer per unmount.
    const timer = setInterval(() => setState((current) => stepSnake(current)), tickMs);
    return () => clearInterval(timer);
  }, [state.alive, tickMs]);

  const handleDirection = useCallback((direction: Direction) => {
    setState((current) => turnSnake(current, VECTORS[direction]));
  }, []);

  useArrowKeys(handleDirection);

  // A lookup instead of an `includes` per cell: without it every one of the 289
  // cells walks the whole snake, which is O(n * body) eight times a second.
  const occupied = useMemo(() => {
    const map = new Map<string, "head" | "body">();
    state.body.forEach((point, index) => {
      map.set(`${point.x},${point.y}`, index === 0 ? "head" : "body");
    });
    return map;
  }, [state.body]);

  const cells = Array.from({ length: SNAKE_COLUMNS * SNAKE_ROWS }, (_, index) => {
    const x = index % SNAKE_COLUMNS;
    const y = Math.floor(index / SNAKE_COLUMNS);
    const part = occupied.get(`${x},${y}`);
    const isFood = state.food.x === x && state.food.y === y;
    return { index, part, isFood };
  });

  const reset = () => setState(createSnake());

  return (
    <div className="ct-minigame">
      <div className="ct-minigame-bar">
        <span className="ct-minigame-metric">
          <span className="ct-minigame-metric-label">Yem</span>
          <strong>{state.score}</strong>
        </span>
        <span className="ct-minigame-metric">
          <span className="ct-minigame-metric-label">Uzunluk</span>
          <strong>{state.body.length}</strong>
        </span>
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      </div>

      <div className="ct-minigame-stage">
        <div
          className="ct-minigame-board ct-snake-board"
          aria-label="Yılan tahtası"
          data-state={state.alive ? undefined : "lost"}
          style={{ gridTemplateColumns: `repeat(${SNAKE_COLUMNS}, 1fr)` }}
        >
          {cells.map((cell) => (
            <div
              key={cell.index}
              className="ct-snake-cell"
              data-part={cell.part}
              data-food={cell.isFood && !cell.part ? "true" : undefined}
            />
          ))}
        </div>

        {state.alive ? null : (
          <GameOutcome
            tone="lost"
            title="Öldün"
            detail={`${state.score} yem`}
            isRecord={isRecord}
            onRestart={reset}
          />
        )}
      </div>

      <p className="ct-minigame-hint">
        Ok tuşları veya WASD ile yönlendir. Duvar ve kendin ölümcül.
      </p>
    </div>
  );
}
