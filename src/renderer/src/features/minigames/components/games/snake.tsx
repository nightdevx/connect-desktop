import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import {
  createSnake,
  stepSnake,
  turnSnake,
  type Direction,
  type Point,
} from "../../minigames-logic";
import { RULES_SNAKE } from "../../difficulty";
import { useArrowKeys } from "../../use-arrow-keys";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

const VECTORS: Record<Direction, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

export function Snake({ difficulty }: MinigameBoardProps) {
  const rules = RULES_SNAKE[difficulty];
  // The board half of the rules, stable across renders so the tick effect below
  // is not torn down and rebuilt on every one of them.
  const board = useMemo(
    () => ({ columns: rules.columns, rows: rules.rows }),
    [rules.columns, rules.rows],
  );

  const [state, setState] = useState(() => createSnake(board));

  // The clock does not start with the component. Opening the page used to cost
  // a run: the snake was already crossing the board before it had been looked
  // at, and by the time the first arrow key landed it had walked into a wall.
  //
  // Not a "paused" flag -- there is no way back to false. It only answers
  // "has the player asked for this run yet", which is why a fresh board from
  // Yeni oyun keeps it true: clicking that IS asking.
  const [running, setRunning] = useState(false);

  // The whole difficulty curve. Recomputed rather than stored so it cannot get
  // out of step with the score it is derived from.
  const tickMs = Math.max(rules.floorTickMs, rules.baseTickMs - state.score * rules.stepMs);

  const isRecord = useRecordRun(scoreKey("snake", difficulty), !state.alive, state.score);

  useEffect(() => {
    if (!running || !state.alive) {
      return;
    }
    // Re-created every time the speed changes, which is once per food. An
    // interval cannot have its delay changed in place, and the alternative --
    // a chain of setTimeouts -- leaks one pending timer per unmount.
    const timer = setInterval(
      () => setState((current) => stepSnake(current, board)),
      tickMs,
    );
    return () => clearInterval(timer);
  }, [running, state.alive, tickMs, board]);

  const handleDirection = useCallback((direction: Direction) => {
    // A direction key starts the run as well as steering it. A still board that
    // swallows the arrows reads as broken rather than as waiting, and reaching
    // for the keys is what everybody does first anyway.
    setRunning(true);
    setState((current) => turnSnake(current, VECTORS[direction]));
  }, []);

  useArrowKeys(handleDirection);

  // A lookup instead of an `includes` per cell: without it every cell walks the
  // whole snake, which is O(n * body) several times a second.
  const occupied = useMemo(() => {
    const map = new Map<string, "head" | "body">();
    state.body.forEach((point, index) => {
      map.set(`${point.x},${point.y}`, index === 0 ? "head" : "body");
    });
    return map;
  }, [state.body]);

  const reset = () => {
    setState(createSnake(board));
    setRunning(true);
  };

  return (
    <GameShell
      columns={board.columns}
      rows={board.rows}
      hud={[
        { label: "Yem", value: state.score },
        { label: "Uzunluk", value: state.body.length },
        { label: "Hız", value: `${tickMs}ms`, tone: tickMs === rules.floorTickMs ? "alert" : undefined },
      ]}
      actions={
        running ? (
          <Button size="small" onClick={reset}>
            Yeni oyun
          </Button>
        ) : (
          <Button size="small" type="primary" onClick={() => setRunning(true)}>
            Başla
          </Button>
        )
      }
      status={{
        text: running
          ? "Ok tuşları veya WASD ile yönlendir. Duvar ve kendin ölümcül."
          : "Başla'ya bas ya da bir yön tuşuna dokun.",
        tone: !state.alive ? "done" : running ? "idle" : "wait",
      }}
      overlay={
        state.alive ? null : (
          <GameOutcome
            tone="lost"
            title="Öldün"
            detail={`${state.score} yem`}
            isRecord={isRecord}
            onRestart={reset}
          />
        )
      }
    >
      <div
        className="ct-board ct-snake-board"
        aria-label="Yılan tahtası"
        data-state={state.alive ? undefined : "lost"}
      >
        {Array.from({ length: board.columns * board.rows }, (_, index) => {
          const x = index % board.columns;
          const y = Math.floor(index / board.columns);
          const part = occupied.get(`${x},${y}`);
          const isFood = state.food.x === x && state.food.y === y;

          return (
            <div
              key={index}
              className="ct-snake-cell"
              data-part={part}
              data-food={isFood && !part ? "true" : undefined}
            />
          );
        })}
      </div>
    </GameShell>
  );
}
