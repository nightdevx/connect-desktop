import type { MinigameTable, MultiplayerGameId } from "@shared/minigames";
import type { VersusView, VersusViewProps } from "./versus-view";
import { BackgammonBoard } from "./components/games/backgammon-board";
import { BattleshipAside, BattleshipBoard } from "./components/games/battleship-board";
import { BlokusAside, BlokusBoard } from "./components/games/blokus-board";
import { BoxesBoard } from "./components/games/boxes-board";
import {
  ChessBoardView,
  ChessSheet,
  ChessTicker,
} from "./components/games/chess-board-view";
import { GridBoardView } from "./components/games/grid-board-view";
import { LudoAside, LudoBoard } from "./components/games/ludo-board";
import { PokerAside, PokerBoard } from "./components/games/poker-board";
import { QuizAside, QuizBoard } from "./components/games/quiz-board";
import { ReversiAside, ReversiBoard } from "./components/games/reversi-board";
import { RummyAside, RummyBoard } from "./components/games/rummy-board";
import { Okey101Aside, Okey101Board } from "./components/games/okey101-board";
import { UnoAside, UnoBoard } from "./components/games/uno-board";
import { YahtzeeAside, YahtzeeBoard } from "./components/games/yahtzee-board";

/**
 * Which board draws which game.
 *
 * A Record over the id union, so the compiler names the game that was added to
 * @shared/minigames and forgotten here. An array or a switch would have let an
 * id ship with no board behind it, and the way that shows up is a table you can
 * join and then stare at.
 *
 * Five titles share one entry, and that is the point of the grid engine: XOX,
 * Connect Four, Gomoku and the two larger boards differ by four numbers that
 * arrive inside the board itself.
 */

/** Every grid game, since they differ only in what the server sends. */
const gridView = (): VersusView => ({
  Board: GridBoardView,
  shape: (table) => ({
    columns: table.grid?.columns ?? 7,
    rows: table.grid?.rows ?? 6,
  }),
});

const chessView: VersusView = {
  Board: ({ table, mySeat, isMyTurn, isBusy, onMove }: VersusViewProps) =>
    table.chess ? (
      <ChessBoardView
        board={table.chess}
        mySeat={mySeat}
        isMyTurn={isMyTurn}
        isBusy={isBusy}
        onMove={onMove}
      />
    ) : null,
  Aside: ({ table }: VersusViewProps) =>
    table.chess ? <ChessSheet board={table.chess} /> : null,
  Header: ({ table, mySeat }: VersusViewProps) =>
    table.chess ? <ChessTicker board={table.chess} mySeat={mySeat} /> : null,
  shape: () => ({ columns: 8, rows: 8 }),
};

export const VERSUS_VIEWS: Record<MultiplayerGameId, VersusView> = {
  xox: gridView(),
  connect4: gridView(),
  gomoku: gridView(),
  connect5: gridView(),
  connect4trio: gridView(),

  chess: chessView,

  reversi: {
    Board: ReversiBoard,
    Aside: ReversiAside,
    shape: (table) => square(table.reversi?.size ?? 8),
  },

  boxes: {
    Board: BoxesBoard,
    // The edge grid is twice the box count plus one in each direction, and the
    // shell sizes the stage from that so a dot stays a dot.
    shape: (table) => ({
      columns: (table.boxes?.columns ?? 5) * 2 + 1,
      rows: (table.boxes?.rows ?? 5) * 2 + 1,
    }),
  },

  blokus: {
    Board: BlokusBoard,
    Aside: BlokusAside,
    // Taller than it is wide: the tray and the two control rows live under the
    // board and the stage has to leave room for them.
    shape: (table) => ({
      columns: table.blokus?.size ?? 20,
      rows: (table.blokus?.size ?? 20) + 6,
    }),
  },

  backgammon: {
    Board: BackgammonBoard,
    shape: () => ({ columns: 13, rows: 12 }),
  },

  yahtzee: {
    Board: YahtzeeBoard,
    Aside: YahtzeeAside,
    shape: () => ({ columns: 5, rows: 3 }),
  },

  ludo: {
    Board: LudoBoard,
    Aside: LudoAside,
    shape: () => ({ columns: 15, rows: 17 }),
  },

  quiz: {
    Board: QuizBoard,
    Aside: QuizAside,
    shape: () => ({ columns: 10, rows: 8 }),
  },

  uno: {
    Board: UnoBoard,
    Aside: UnoAside,
    shape: () => ({ columns: 12, rows: 12 }),
  },

  battleship: {
    Board: BattleshipBoard,
    Aside: BattleshipAside,
    // Two ten-wide grids side by side, plus the tray.
    shape: () => ({ columns: 23, rows: 14 }),
  },

  okey: {
    Board: RummyBoard,
    Aside: RummyAside,
    shape: () => ({ columns: 14, rows: 13 }),
  },
  rummy1: {
    Board: Okey101Board,
    Aside: Okey101Aside,
    shape: () => ({ columns: 16, rows: 16 }),
  },

  poker: {
    Board: PokerBoard,
    Aside: PokerAside,
    shape: () => ({ columns: 14, rows: 12 }),
  },
};

function square(size: number): { columns: number; rows: number } {
  return { columns: size, rows: size };
}

export function findVersusView(game: MinigameTable["game"]): VersusView {
  return VERSUS_VIEWS[game];
}
