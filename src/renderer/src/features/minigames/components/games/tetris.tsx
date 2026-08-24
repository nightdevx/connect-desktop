import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_TETRIS } from "../../difficulty";
import {
  TETROMINOES,
  clearLines,
  lockPiece,
  pieceCells,
  tetrisCollides,
  tetrisLineScore,
  type FallingPiece,
} from "../../solo-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";

interface TetrisState {
  well: number[];
  falling: FallingPiece;
  next: number;
  score: number;
  lines: number;
  dead: boolean;
}

/**
 * Tetris.
 *
 * The whole game is ONE state object and one reducer-ish step function, for the
 * reason game-2048 gives about its own: the score, the well and the falling
 * piece all change together on a lock, and splitting them into three useStates
 * means three updaters that React 18 invokes twice in development -- so the
 * score doubles and only in dev builds.
 *
 * Gravity is a timer that calls the same "move down" the player calls. There is
 * no separate fall path, so a piece that would land cannot behave differently
 * depending on whether the clock or the keyboard pushed it.
 */
export function Tetris({ difficulty }: MinigameBoardProps) {
  const { columns, rows, baseTickMs, linesPerLevel } = RULES_TETRIS[difficulty];

  const [state, setState] = useState<TetrisState>(() => deal(columns, rows));

  const level = Math.floor(state.lines / linesPerLevel) + 1;
  const isRecord = useRecordRun(scoreKey("tetris", difficulty), state.dead, state.score);

  // Held in a ref as well, so the key handler can be bound once instead of
  // rebinding on every frame of a falling piece.
  const stateRef = useRef(state);
  stateRef.current = state;

  const step = useCallback(
    (move: "left" | "right" | "down" | "rotate" | "drop") => {
      setState((current) => advance(current, move, columns, rows, linesPerLevel));
    },
    [columns, rows, linesPerLevel],
  );

  useEffect(() => {
    if (state.dead) {
      return;
    }
    // Speeds up with the level, with a floor: below about 90ms the piece is
    // faster than a keypress and the game stops being one.
    const delay = Math.max(90, baseTickMs - (level - 1) * 55);
    const timer = setInterval(() => step("down"), delay);
    return () => clearInterval(timer);
  }, [state.dead, level, baseTickMs, step]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        /^(input|textarea|select)$/i.test(target?.tagName ?? "")
      ) {
        return;
      }

      const moves: Record<string, Parameters<typeof step>[0]> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowDown: "down",
        ArrowUp: "rotate",
        a: "left",
        d: "right",
        s: "down",
        w: "rotate",
        " ": "drop",
      };

      const move = moves[event.key];
      if (!move || stateRef.current.dead) {
        return;
      }
      // Otherwise the panel scrolls under the board on every arrow key, and
      // space pages it.
      event.preventDefault();
      step(move);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step]);

  const reset = () => setState(deal(columns, rows));

  // Painted onto a copy rather than into the well, so the falling piece is not
  // part of the board it is falling onto.
  const painted = [...state.well];
  if (!state.dead) {
    for (const { x, y } of pieceCells(state.falling)) {
      if (y >= 0 && y < rows && x >= 0 && x < columns) {
        painted[y * columns + x] = TETROMINOES[state.falling.piece].tone;
      }
    }
  }

  return (
    <GameShell
      columns={columns}
      rows={rows}
      hud={[
        { label: "Puan", value: state.score },
        { label: "Satır", value: state.lines },
        { label: "Seviye", value: level, tone: level > 1 ? "record" : undefined },
      ]}
      actions={
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      }
      status={{
        text: "Ok tuşları taşır, yukarı döndürür, boşluk düşürür.",
        tone: state.dead ? "done" : "idle",
      }}
      aside={
        <div className="ct-tetris-next" aria-label="Sıradaki taş">
          <span className="ct-tetris-next-label">Sıradaki</span>
          <NextPiece piece={state.next} />
        </div>
      }
      overlay={
        state.dead ? (
          <GameOutcome
            tone="lost"
            title="Kuyu doldu"
            detail={`${state.score} puan`}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null
      }
    >
      <div className="ct-board ct-tetris-board" aria-label="Tetris kuyusu">
        {painted.map((tone, index) => (
          <div
            key={index}
            className="ct-tetris-cell"
            data-tone={tone === 0 ? undefined : tone}
          />
        ))}
      </div>
    </GameShell>
  );
}

/** The next piece, drawn in its own little box. */
function NextPiece({ piece }: { piece: number }) {
  const shape = TETROMINOES[piece];
  const cells = Array.from({ length: shape.box * shape.box }, (_, index) =>
    shape.cells.includes(index) ? shape.tone : 0,
  );

  return (
    <div
      className="ct-tetris-preview"
      style={{ gridTemplateColumns: `repeat(${shape.box}, 1fr)` }}
      aria-hidden="true"
    >
      {cells.map((tone, index) => (
        <span
          key={index}
          className="ct-tetris-cell"
          data-tone={tone === 0 ? undefined : tone}
        />
      ))}
    </div>
  );
}

function randomPiece(): number {
  return Math.floor(Math.random() * TETROMINOES.length) % TETROMINOES.length;
}

function deal(columns: number, rows: number): TetrisState {
  const piece = randomPiece();
  return {
    well: new Array<number>(columns * rows).fill(0),
    falling: spawn(piece, columns),
    next: randomPiece(),
    score: 0,
    lines: 0,
    dead: false,
  };
}

/** A piece enters centred and partly above the ceiling, which is legal. */
function spawn(piece: number, columns: number): FallingPiece {
  const box = TETROMINOES[piece].box;
  return {
    piece,
    rotation: 0,
    x: Math.floor((columns - box) / 2),
    y: -1,
  };
}

/**
 * One move. Pure, so the timer and the keyboard go through exactly the same
 * code and a landing cannot behave differently depending on which pushed it.
 */
function advance(
  state: TetrisState,
  move: "left" | "right" | "down" | "rotate" | "drop",
  columns: number,
  rows: number,
  linesPerLevel: number,
): TetrisState {
  if (state.dead) {
    return state;
  }

  if (move === "left" || move === "right") {
    const shifted = { ...state.falling, x: state.falling.x + (move === "left" ? -1 : 1) };
    return tetrisCollides(state.well, columns, rows, shifted)
      ? state
      : { ...state, falling: shifted };
  }

  if (move === "rotate") {
    const turned = { ...state.falling, rotation: (state.falling.rotation + 1) % 4 };
    if (!tetrisCollides(state.well, columns, rows, turned)) {
      return { ...state, falling: turned };
    }
    // One kick each way. Without it a piece against a wall simply refuses to
    // turn, which reads as an unresponsive game rather than as a rule.
    for (const kick of [-1, 1, -2, 2]) {
      const kicked = { ...turned, x: turned.x + kick };
      if (!tetrisCollides(state.well, columns, rows, kicked)) {
        return { ...state, falling: kicked };
      }
    }
    return state;
  }

  if (move === "drop") {
    let dropped = state.falling;
    while (!tetrisCollides(state.well, columns, rows, { ...dropped, y: dropped.y + 1 })) {
      dropped = { ...dropped, y: dropped.y + 1 };
    }
    return land({ ...state, falling: dropped }, columns, rows, linesPerLevel);
  }

  const lowered = { ...state.falling, y: state.falling.y + 1 };
  if (!tetrisCollides(state.well, columns, rows, lowered)) {
    return { ...state, falling: lowered };
  }
  return land(state, columns, rows, linesPerLevel);
}

/** Locks the piece, clears whatever it completed, and deals the next one. */
function land(
  state: TetrisState,
  columns: number,
  rows: number,
  linesPerLevel: number,
): TetrisState {
  const locked = lockPiece(state.well, columns, state.falling);
  const { well, cleared } = clearLines(locked, columns, rows);

  const lines = state.lines + cleared;
  // Scored at the level the piece FELL at, not the one the clear promoted the
  // player to -- otherwise a tetris that levels you up pays at the new rate.
  const level = Math.floor(state.lines / linesPerLevel) + 1;
  const falling = spawn(state.next, columns);

  return {
    well,
    falling,
    next: randomPiece(),
    score: state.score + tetrisLineScore(cleared, level),
    lines,
    // Dead when the piece that has just entered has nowhere to be. Checked on
    // the NEW piece rather than on the well's top row: a well with a block in
    // row zero is still playable if the next piece fits beside it.
    dead: tetrisCollides(well, columns, rows, falling),
  };
}
