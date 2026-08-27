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

export type SoloGameId =
  | "2048"
  | "minesweeper"
  | "snake"
  | "memory"
  | "sudoku"
  | "puzzle15"
  | "lightsout"
  | "tetris"
  | "simon"
  | "floodit"
  | "nonogram"
  | "typing"
  | "mathsprint"
  | "gunline";

export const SOLO_GAME_IDS: readonly SoloGameId[] = [
  "2048",
  "minesweeper",
  "snake",
  "memory",
  "sudoku",
  "puzzle15",
  "lightsout",
  "tetris",
  "simon",
  "floodit",
  "nonogram",
  "typing",
  "mathsprint",
  "gunline",
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

export interface RulesSudoku {
  /** How many cells are filled in to start with. Fewer is harder. */
  clues: number;
}

export interface RulesPuzzle {
  /** Side of the square board. The blank is one of the tiles. */
  size: number;
  /** How many random legal slides the board is scrambled by. */
  shuffle: number;
}

export interface RulesLights {
  size: number;
  /** How many random presses are applied to a solved board to make the puzzle. */
  presses: number;
}

export interface RulesTetris {
  columns: number;
  rows: number;
  /** Milliseconds per gravity step at level 1. */
  baseTickMs: number;
  /** Lines per level. */
  linesPerLevel: number;
}

export interface RulesSimon {
  /** How many buttons there are to remember between. */
  pads: number;
  /** Milliseconds each pad lights for during playback. */
  flashMs: number;
}

export interface RulesFlood {
  size: number;
  colors: number;
}

export interface RulesNonogram {
  size: number;
  /** Roughly what fraction of the grid is filled. Drives how hard the clues are. */
  density: number;
}

export interface RulesTyping {
  /** How many words the passage is. */
  words: number;
}

export interface RulesGunline {
  startUnits: number;
  enemyHealth: number;
  spawnRate: number;
}

export interface RulesMath {
  /** Seconds on the clock. */
  seconds: number;
  /** The biggest operand that can appear. */
  ceiling: number;
  /** Whether multiplication and division are in the mix. */
  multiply: boolean;
}

/**
 * Sudoku moves ONE number, and it is the only one that matters: how many cells
 * you start with. A larger grid is a different game; fewer clues is the same
 * game, harder.
 */
export const RULES_SUDOKU: Record<DifficultyId, RulesSudoku> = {
  easy: { clues: 45 },
  normal: { clues: 34 },
  hard: { clues: 26 },
};

/**
 * The sliding puzzle scales by board AND by scramble, because a big board
 * shuffled twice is not hard, it is just big.
 */
export const RULES_PUZZLE: Record<DifficultyId, RulesPuzzle> = {
  easy: { size: 3, shuffle: 60 },
  normal: { size: 4, shuffle: 140 },
  hard: { size: 5, shuffle: 260 },
};

/**
 * Lights Out is generated by pressing a solved board, which is what guarantees
 * it is solvable -- a random grid usually is not.
 */
export const RULES_LIGHTS: Record<DifficultyId, RulesLights> = {
  easy: { size: 4, presses: 5 },
  normal: { size: 5, presses: 8 },
  hard: { size: 6, presses: 12 },
};

/**
 * Tetris keeps the standard ten-wide well at every difficulty and moves the
 * clock instead. A narrower well would be a different game, and a wider one
 * would make the piece set wrong.
 */
export const RULES_TETRIS: Record<DifficultyId, RulesTetris> = {
  easy: { columns: 10, rows: 20, baseTickMs: 900, linesPerLevel: 12 },
  normal: { columns: 10, rows: 20, baseTickMs: 650, linesPerLevel: 10 },
  hard: { columns: 10, rows: 20, baseTickMs: 420, linesPerLevel: 8 },
};

/** Simon scales by how many pads there are and how fast they flash. */
export const RULES_SIMON: Record<DifficultyId, RulesSimon> = {
  easy: { pads: 4, flashMs: 620 },
  normal: { pads: 4, flashMs: 420 },
  hard: { pads: 6, flashMs: 300 },
};

/** Flood It gets harder both ways: a bigger board and more colours to cross. */
export const RULES_FLOOD: Record<DifficultyId, RulesFlood> = {
  easy: { size: 12, colors: 4 },
  normal: { size: 14, colors: 6 },
  hard: { size: 18, colors: 6 },
};

/** Nonogram scales by grid; the density stays near half, where clues are richest. */
export const RULES_NONOGRAM: Record<DifficultyId, RulesNonogram> = {
  easy: { size: 5, density: 0.55 },
  normal: { size: 10, density: 0.5 },
  hard: { size: 15, density: 0.48 },
};

/** A longer passage is harder to hold a pace over, which is the whole test. */
export const RULES_TYPING: Record<DifficultyId, RulesTyping> = {
  easy: { words: 20 },
  normal: { words: 35 },
  hard: { words: 60 },
};

/** Mental arithmetic: bigger numbers, and eventually times tables. */
export const RULES_MATH: Record<DifficultyId, RulesMath> = {
  easy: { seconds: 60, ceiling: 10, multiply: false },
  normal: { seconds: 60, ceiling: 25, multiply: true },
  hard: { seconds: 45, ceiling: 50, multiply: true },
};

export const RULES_GUNLINE: Record<DifficultyId, RulesGunline> = {
  easy: { startUnits: 4, enemyHealth: 0.7, spawnRate: 0.75 },
  normal: { startUnits: 3, enemyHealth: 1, spawnRate: 1 },
  hard: { startUnits: 2, enemyHealth: 1.8, spawnRate: 1.35 },
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
    case "sudoku": {
      const { clues } = RULES_SUDOKU[difficulty];
      return `${clues} ipucu`;
    }
    case "puzzle15": {
      const { size, shuffle } = RULES_PUZZLE[difficulty];
      return `${size}x${size}, ${shuffle} karıştırma`;
    }
    case "lightsout": {
      const { size, presses } = RULES_LIGHTS[difficulty];
      return `${size}x${size}, ${presses} basış`;
    }
    case "tetris": {
      const { baseTickMs, linesPerLevel } = RULES_TETRIS[difficulty];
      return `${baseTickMs}ms düşüş, ${linesPerLevel} satırda seviye`;
    }
    case "simon": {
      const { pads, flashMs } = RULES_SIMON[difficulty];
      return `${pads} renk, ${flashMs}ms`;
    }
    case "floodit": {
      const { size, colors } = RULES_FLOOD[difficulty];
      return `${size}x${size}, ${colors} renk`;
    }
    case "nonogram": {
      const { size } = RULES_NONOGRAM[difficulty];
      return `${size}x${size} ızgara`;
    }
    case "typing": {
      const { words } = RULES_TYPING[difficulty];
      return `${words} kelime`;
    }
    case "mathsprint": {
      const { seconds, ceiling } = RULES_MATH[difficulty];
      return `${seconds} saniye, ${ceiling}'e kadar`;
    }
    case "gunline": {
      const { startUnits, enemyHealth } = RULES_GUNLINE[difficulty];
      return `${startUnits} birim, x${enemyHealth.toFixed(1)} düşman canı`;
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
