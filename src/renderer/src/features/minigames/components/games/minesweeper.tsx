import { useEffect, useState } from "react";
import { Button } from "antd";
import {
  buildMinefield,
  isMinefieldWon,
  revealCell,
  type MineCell,
} from "../../minigames-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";

const COLUMNS = 16;
const ROWS = 16;
const MINES = 40;

type Status = "idle" | "playing" | "lost" | "won";

interface FieldState {
  cells: MineCell[];
  status: Status;
}

const IDLE_STATE: FieldState = { cells: [], status: "idle" };

export function Minesweeper() {
  const [state, setState] = useState<FieldState>(IDLE_STATE);
  const [seconds, setSeconds] = useState(0);
  // The cell that ended it, so the mines can appear outward from there rather
  // than all at once. null until one does.
  const [lostAt, setLostAt] = useState<number | null>(null);

  const isRunning = state.status === "playing";
  const isOver = state.status === "won" || state.status === "lost";
  // A loss is not a run: the record is a time, and a field you blew up has no
  // time on it. Only a clean field is submitted.
  const isRecord = useRecordRun("minesweeper", state.status === "won", seconds);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    // A plain 1s counter rather than a wall-clock delta. Chromium does not
    // throttle this window (backgroundThrottling is off for the lobby timers),
    // and a minesweeper clock that is a second out is not a bug anyone has.
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const reset = () => {
    setState(IDLE_STATE);
    setSeconds(0);
    setLostAt(null);
  };

  // Chebyshev, not Euclidean: the board is a grid of squares that touch at the
  // corners, so a diagonal neighbour is one step away and the ring of mines
  // that lands together is the ring that looks like one.
  const mineDistance = (index: number): number => {
    if (lostAt === null) {
      return 0;
    }
    return Math.max(
      Math.abs((index % COLUMNS) - (lostAt % COLUMNS)),
      Math.abs(Math.floor(index / COLUMNS) - Math.floor(lostAt / COLUMNS)),
    );
  };

  const handleReveal = (index: number) => {
    if (state.status === "lost" || state.status === "won") {
      return;
    }

    // The field is built HERE, on the first click, not at reset -- that is what
    // lets the first click be guaranteed safe. Before it, there is no board.
    if (state.status === "idle") {
      const fresh = buildMinefield(COLUMNS, ROWS, MINES, index, Math.random);
      const opened = revealCell(fresh, COLUMNS, ROWS, index);
      setSeconds(0);
      setState({
        cells: opened,
        status: isMinefieldWon(opened) ? "won" : "playing",
      });
      return;
    }

    const cell = state.cells[index];
    if (cell.revealed || cell.flagged) {
      return;
    }

    if (cell.mine) {
      setLostAt(index);
      // Every mine is shown on a loss. Hiding the rest turns "where did I go
      // wrong" into a guess, which is the only thing this game is not about.
      setState({
        cells: state.cells.map((entry) =>
          entry.mine ? { ...entry, revealed: true } : entry,
        ),
        status: "lost",
      });
      return;
    }

    const opened = revealCell(state.cells, COLUMNS, ROWS, index);
    setState({ cells: opened, status: isMinefieldWon(opened) ? "won" : "playing" });
  };

  const handleFlag = (index: number) => {
    if (state.status !== "playing") {
      return;
    }
    const cell = state.cells[index];
    if (cell.revealed) {
      return;
    }
    setState({
      cells: state.cells.map((entry, position) =>
        position === index ? { ...entry, flagged: !entry.flagged } : entry,
      ),
      status: state.status,
    });
  };

  const flagged = state.cells.filter((cell) => cell.flagged).length;
  // Clamped at zero: over-flagging is allowed and a negative counter reads as a
  // bug rather than as "you have placed more flags than there are mines".
  const remaining = Math.max(0, MINES - flagged);

  const cells: MineCell[] =
    state.status === "idle"
      ? Array.from({ length: COLUMNS * ROWS }, () => ({
          mine: false,
          adjacent: 0,
          revealed: false,
          flagged: false,
        }))
      : state.cells;

  return (
    <div className="ct-minigame">
      <div className="ct-minigame-bar">
        <span className="ct-minigame-metric">
          <span className="ct-minigame-metric-label">Mayın</span>
          <strong>{remaining}</strong>
        </span>
        <span className="ct-minigame-metric">
          <span className="ct-minigame-metric-label">Süre</span>
          <strong>{seconds}s</strong>
        </span>
        <Button size="small" onClick={reset}>
          Yeni oyun
        </Button>
      </div>

      <div className="ct-minigame-stage">
        <div
          className="ct-minigame-board ct-mines-board"
          aria-label="Mayın tarlası"
          data-state={state.status === "lost" ? "lost" : state.status === "won" ? "won" : undefined}
          // Suppressed once for the whole grid instead of on 256 buttons: the OS
          // menu would otherwise cover the board on every flag.
          onContextMenu={(event) => event.preventDefault()}
        >
          {cells.map((cell, index) => (
            <button
              // The revealed flag is part of the key so opening a cell remounts
              // it: a reused DOM node does not restart its animation, and the
              // cascade below is the one moment this game has.
              key={`${index}-${cell.revealed}`}
              type="button"
              className="ct-mines-cell"
              data-revealed={cell.revealed ? "true" : undefined}
              data-mine={cell.revealed && cell.mine ? "true" : undefined}
              data-flag={cell.flagged && !cell.revealed ? "true" : undefined}
              data-adjacent={cell.revealed && !cell.mine ? cell.adjacent : undefined}
              // Every mine appears a beat after the one before it, walking
              // outward from the click. Set inline because it is per cell and
              // there are 256 of them; capped so a corner mine does not arrive
              // three seconds late.
              style={
                cell.revealed && cell.mine
                  ? { animationDelay: `${Math.min(mineDistance(index), 12) * 45}ms` }
                  : undefined
              }
              aria-label={`${(index % COLUMNS) + 1}, ${Math.floor(index / COLUMNS) + 1}`}
              onClick={() => handleReveal(index)}
              onContextMenu={() => handleFlag(index)}
            >
              {cell.flagged && !cell.revealed
                ? "⚑"
                : cell.revealed && cell.mine
                  ? "✳"
                  : cell.revealed && cell.adjacent > 0
                    ? cell.adjacent
                    : ""}
            </button>
          ))}
        </div>

        {isOver ? (
          <GameOutcome
            tone={state.status === "won" ? "won" : "lost"}
            title={state.status === "won" ? "Tarla temiz" : "Mayına bastın"}
            detail={state.status === "won" ? `${seconds} saniye` : undefined}
            isRecord={isRecord}
            onRestart={reset}
          />
        ) : null}
      </div>

      <p className="ct-minigame-hint">
        Sol tık aç, sağ tık bayrak. İlk tıklaman her zaman güvenli.
      </p>
    </div>
  );
}
