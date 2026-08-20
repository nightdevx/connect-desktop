import {
  DIFFICULTY_IDS,
  type DifficultyId,
  type MinigameId,
} from "@/store/minigame-scores";

/**
 * What each difficulty actually changes, for the four solo games.
 *
 * Pure data, so scripts/check-minigames.cjs can assert it — and that matters
 * more here than it looks. Every bound the SERVER uses to reject an impossible
 * score is derived from these same numbers, so a snake board that grows here
 * without the ceiling moving in internal/minigame/score.go turns a legitimate
 * run into a 400.
 *
 * The id union and the key format live in the store, not here: ui-store holds
 * the selection and may not import a feature. This file owns the rules and
 * nothing else.
 *
 * The two-player games are absent, and that is the design rather than an
 * omission — the difficulty of chess is the person across the table.
 */

export type SoloGameId = "2048" | "minesweeper" | "snake" | "memory";

export const SOLO_GAME_IDS: readonly SoloGameId[] = [
  "2048",
  "minesweeper",
  "snake",
  "memory",
];

export function isSoloGameId(game: MinigameId): game is SoloGameId {
  return (SOLO_GAME_IDS as readonly string[]).includes(game);
}

/** The one place the three words are spelled. */
export const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  easy: "Kolay",
  normal: "Normal",
  hard: "Zor",
};

export interface Rules2048 {
  /** Side of the square board. */
  size: number;
}

export interface RulesMines {
  columns: number;
  rows: number;
  mines: number;
}

export interface RulesSnake {
  columns: number;
  rows: number;
  /** Milliseconds between ticks before any food. */
  baseTickMs: number;
  /** How much each food shortens the tick. */
  stepMs: number;
  /** The fastest it ever gets. */
  floorTickMs: number;
}

export interface RulesMemory {
  pairs: number;
  columns: number;
}

/**
 * 2048 by board size, the only knob that changes the game rather than the
 * scenery. 5x5 forgives because a merge is nearly always available; 3x3 is
 * brutal for the same reason in reverse.
 */
export const RULES_2048: Record<DifficultyId, Rules2048> = {
  easy: { size: 5 },
  normal: { size: 4 },
  hard: { size: 3 },
};

/**
 * The three boards minesweeper has had since 1990, at the densities it has
 * always had: 12%, 16%, 21% mined. Expert is WIDE rather than large, which is
 * why nothing downstream may assume a board is square.
 */
export const RULES_MINES: Record<DifficultyId, RulesMines> = {
  easy: { columns: 9, rows: 9, mines: 10 },
  normal: { columns: 16, rows: 16, mines: 40 },
  hard: { columns: 30, rows: 16, mines: 99 },
};

/**
 * Snake moves both knobs, because either alone is the wrong game: a smaller
 * board that is not faster is merely cramped, and a faster snake on a big board
 * is the same game with less thinking time.
 */
export const RULES_SNAKE: Record<DifficultyId, RulesSnake> = {
  easy: { columns: 19, rows: 19, baseTickMs: 210, stepMs: 3, floorTickMs: 110 },
  normal: { columns: 17, rows: 17, baseTickMs: 170, stepMs: 4, floorTickMs: 70 },
  hard: { columns: 13, rows: 13, baseTickMs: 120, stepMs: 5, floorTickMs: 50 },
};

/** Memory scales by how much there is to hold in your head at once. */
export const RULES_MEMORY: Record<DifficultyId, RulesMemory> = {
  easy: { pairs: 6, columns: 4 },
  normal: { pairs: 8, columns: 4 },
  hard: { pairs: 12, columns: 6 },
};

/**
 * A one-line summary of what a difficulty means, for the picker's tooltip and
 * for the page header. Written from the rules rather than typed out twice, so
 * a board that changes size cannot leave a stale description behind it.
 */
export function describeDifficulty(game: SoloGameId, difficulty: DifficultyId): string {
  switch (game) {
    case "2048": {
      const { size } = RULES_2048[difficulty];
      return `${size}x${size} tahta`;
    }
    case "minesweeper": {
      const { columns, rows, mines } = RULES_MINES[difficulty];
      return `${columns}x${rows}, ${mines} mayın`;
    }
    case "snake": {
      const { columns, rows, baseTickMs } = RULES_SNAKE[difficulty];
      return `${columns}x${rows}, ${baseTickMs}ms başlangıç`;
    }
    case "memory": {
      const { pairs } = RULES_MEMORY[difficulty];
      return `${pairs} çift`;
    }
  }
}

/** Every difficulty, with its label and what it does, in picker order. */
export function difficultyOptions(
  game: SoloGameId,
): { id: DifficultyId; label: string; hint: string }[] {
  return DIFFICULTY_IDS.map((id) => ({
    id,
    label: DIFFICULTY_LABELS[id],
    hint: describeDifficulty(game, id),
  }));
}
