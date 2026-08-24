import type { ComponentType } from "react";
import type { MinigameTable } from "@shared/minigames";

/**
 * What every multiplayer board is handed.
 *
 * Its own module, with no JSX in it, for the same reason board-props.ts exists:
 * the registry imports every board and every board needs this type, so
 * declaring it in the registry would close a cycle that
 * scripts/check-architecture.cjs refuses.
 *
 * A board renders the board and nothing else -- the seats, the turn indicator,
 * the result line and the buttons all belong to the shell around it, and a
 * board that drew its own would be eighteen slightly different headers.
 */
export interface VersusViewProps {
  table: MinigameTable;
  /** -1 for a spectator. Every branch that separates the two reads this. */
  mySeat: number;
  isMyTurn: boolean;
  /** True while an action is in flight, so a board can refuse a double click. */
  isBusy: boolean;
  /** A grid-style move: the cell that was clicked. */
  onCell: (cell: number) => void;
  /** Everything else: a verb and its colon-separated arguments. */
  onMove: (move: string) => void;
}

/**
 * One entry per game. A registry rather than a switch, so adding a game is one
 * row here and the compiler names the row that was forgotten -- the record is
 * over the id union, so it cannot be partial.
 */
export interface VersusView {
  Board: ComponentType<VersusViewProps>;
  /** The column beside the board: a scoresheet, a hand, a piece tray. */
  Aside?: ComponentType<VersusViewProps>;
  /** Above the HUD: the dice, the pot, the question. */
  Header?: ComponentType<VersusViewProps>;
  /**
   * What the shell sizes the stage from. A function of the table because some
   * boards change shape with the number of players, and one of them (the
   * blokus tray) changes shape with the board it was dealt.
   */
  shape: (table: MinigameTable) => { columns: number; rows: number };
}
