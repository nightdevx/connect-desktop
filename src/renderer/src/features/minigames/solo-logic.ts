import { type Rng } from "./minigames-logic";

/**
 * The rules of the nine solo games added after the first four.
 *
 * Same contract as minigames-logic.ts, and split from it only by size: that
 * file is four games and nine hundred lines, and one file of thirteen would be
 * a file nobody opens. Everything here is pure -- no React, no DOM, no
 * electron -- so scripts/check-minigames.cjs bundles it standalone and asserts
 * the rules that break a GAME without breaking the page.
 *
 * Every function that needs randomness takes it as a parameter, for exactly the
 * reason that file gives: a generator that reads Math.random cannot be tested,
 * and a "random" board that cannot be reproduced cannot be debugged either.
 */

// --- sudoku ------------------------------------------------------------------

export const SUDOKU_SIZE = 9;
export const SUDOKU_CELLS = SUDOKU_SIZE * SUDOKU_SIZE;

export interface SudokuPuzzle {
  /** 81 cells, 0 for a blank. What the player is given. */
  puzzle: number[];
  /** The same grid, filled. Used to mark a wrong entry, never to fill one in. */
  solution: number[];
  /** Which cells came with the puzzle and may not be edited. */
  fixed: boolean[];
}

/**
 * A filled grid, then cells removed one at a time.
 *
 * Removing from a SOLVED grid rather than generating a puzzle and solving it is
 * what makes this fast and what guarantees the puzzle has an answer at all. It
 * does NOT guarantee a unique one -- checking that means solving the grid twice
 * on every removal, which is a real solver and about ten times this much code,
 * for a property a casual player never notices because they fill in the answer
 * the puzzle was cut from.
 */
export function createSudoku(clues: number, rng: Rng = Math.random): SudokuPuzzle {
  const solution = solvedSudoku(rng);
  const puzzle = [...solution];

  const order = shuffleIndices(SUDOKU_CELLS, rng);
  let remaining = SUDOKU_CELLS;
  for (const index of order) {
    if (remaining <= clues) {
      break;
    }
    puzzle[index] = 0;
    remaining--;
  }

  return {
    puzzle,
    solution,
    fixed: puzzle.map((value) => value !== 0),
  };
}

/** A complete valid grid, by backtracking over a shuffled candidate order. */
export function solvedSudoku(rng: Rng = Math.random): number[] {
  const grid = new Array<number>(SUDOKU_CELLS).fill(0);

  const fill = (index: number): boolean => {
    if (index >= SUDOKU_CELLS) {
      return true;
    }
    for (const value of shuffleValues(rng)) {
      if (!sudokuAccepts(grid, index, value)) {
        continue;
      }
      grid[index] = value;
      if (fill(index + 1)) {
        return true;
      }
      grid[index] = 0;
    }
    return false;
  };

  fill(0);
  return grid;
}

/** Whether `value` may go in `index` given what is already on the grid. */
export function sudokuAccepts(
  grid: readonly number[],
  index: number,
  value: number,
): boolean {
  const column = index % SUDOKU_SIZE;
  const row = Math.floor(index / SUDOKU_SIZE);
  const boxColumn = Math.floor(column / 3) * 3;
  const boxRow = Math.floor(row / 3) * 3;

  for (let step = 0; step < SUDOKU_SIZE; step++) {
    if (grid[row * SUDOKU_SIZE + step] === value && step !== column) {
      return false;
    }
    if (grid[step * SUDOKU_SIZE + column] === value && step !== row) {
      return false;
    }

    const cellColumn = boxColumn + (step % 3);
    const cellRow = boxRow + Math.floor(step / 3);
    const cell = cellRow * SUDOKU_SIZE + cellColumn;
    if (grid[cell] === value && cell !== index) {
      return false;
    }
  }

  return true;
}

/** Every cell filled and no cell breaking a rule. */
export function isSudokuSolved(grid: readonly number[]): boolean {
  return grid.every(
    (value, index) => value !== 0 && sudokuAccepts(grid, index, value),
  );
}

/**
 * The cells that clash with something else on the grid.
 *
 * A Set rather than a per-cell flag so the board can paint both ends of a
 * conflict: a five that clashes is only wrong relative to the other five, and
 * marking one of them is telling the player half the truth.
 */
export function sudokuConflicts(grid: readonly number[]): Set<number> {
  const conflicts = new Set<number>();
  for (let index = 0; index < SUDOKU_CELLS; index++) {
    const value = grid[index];
    if (value !== 0 && !sudokuAccepts(grid, index, value)) {
      conflicts.add(index);
    }
  }
  return conflicts;
}

// --- sliding puzzle ----------------------------------------------------------

export interface SlidePuzzle {
  /** size*size tiles. 0 is the hole; the rest are 1..n-1 in solved order. */
  tiles: number[];
  size: number;
}

/**
 * Scrambled by making legal moves from the solved board, not by shuffling.
 *
 * Half of all permutations of a sliding puzzle are unreachable, so a shuffled
 * array is a coin flip on whether the puzzle can be solved at all -- and the
 * player finds out after twenty minutes.
 */
export function createSlidePuzzle(
  size: number,
  scrambles: number,
  rng: Rng = Math.random,
): SlidePuzzle {
  const tiles = solvedSlideTiles(size);
  let hole = tiles.length - 1;
  let previous = -1;

  for (let step = 0; step < scrambles; step++) {
    const moves = slideNeighbours(hole, size).filter((cell) => cell !== previous);
    if (moves.length === 0) {
      continue;
    }
    const chosen = moves[Math.floor(rng() * moves.length) % moves.length];
    tiles[hole] = tiles[chosen];
    tiles[chosen] = 0;
    previous = hole;
    hole = chosen;
  }

  // A scramble that happens to land back on the solved board is a puzzle with
  // no puzzle in it. One more nudge is cheaper than looping.
  if (isSlideSolved({ tiles, size })) {
    const neighbours = slideNeighbours(hole, size);
    const chosen = neighbours[0];
    tiles[hole] = tiles[chosen];
    tiles[chosen] = 0;
  }

  return { tiles, size };
}

export function solvedSlideTiles(size: number): number[] {
  const tiles = Array.from({ length: size * size }, (_, index) => index + 1);
  tiles[tiles.length - 1] = 0;
  return tiles;
}

/** The cells a tile could slide from, given where the hole is. */
export function slideNeighbours(hole: number, size: number): number[] {
  const column = hole % size;
  const row = Math.floor(hole / size);
  const out: number[] = [];

  if (column > 0) out.push(hole - 1);
  if (column < size - 1) out.push(hole + 1);
  if (row > 0) out.push(hole - size);
  if (row < size - 1) out.push(hole + size);

  return out;
}

/**
 * Slides the tile at `cell`, if it is next to the hole. Returns the same array
 * when it is not, so the caller can tell a move from a miss.
 */
export function slideTile(puzzle: SlidePuzzle, cell: number): SlidePuzzle {
  const hole = puzzle.tiles.indexOf(0);
  if (!slideNeighbours(hole, puzzle.size).includes(cell)) {
    return puzzle;
  }

  const tiles = [...puzzle.tiles];
  tiles[hole] = tiles[cell];
  tiles[cell] = 0;
  return { tiles, size: puzzle.size };
}

export function isSlideSolved(puzzle: SlidePuzzle): boolean {
  const solved = solvedSlideTiles(puzzle.size);
  return puzzle.tiles.every((value, index) => value === solved[index]);
}

// --- lights out --------------------------------------------------------------

/**
 * Generated by pressing a SOLVED board, which is what makes it solvable.
 *
 * A random grid of lights usually has no solution at all -- only a quarter of
 * 5x5 configurations do -- so this is not a shortcut, it is the only cheap way
 * to hand somebody a puzzle that can be finished.
 */
export function createLights(
  size: number,
  presses: number,
  rng: Rng = Math.random,
): boolean[] {
  let board = new Array<boolean>(size * size).fill(false);

  for (let step = 0; step < presses; step++) {
    board = pressLight(board, Math.floor(rng() * size * size) % (size * size), size);
  }

  // Pressing an even number of times can land back on a dark board.
  if (board.every((lit) => !lit)) {
    board = pressLight(board, 0, size);
  }

  return board;
}

/** A press toggles the cell and its four orthogonal neighbours. */
export function pressLight(
  board: readonly boolean[],
  cell: number,
  size: number,
): boolean[] {
  const next = [...board];
  const column = cell % size;
  const row = Math.floor(cell / size);

  const toggle = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      return;
    }
    const index = y * size + x;
    next[index] = !next[index];
  };

  toggle(column, row);
  toggle(column - 1, row);
  toggle(column + 1, row);
  toggle(column, row - 1);
  toggle(column, row + 1);

  return next;
}

export function isLightsOut(board: readonly boolean[]): boolean {
  return board.every((lit) => !lit);
}

// --- tetris ------------------------------------------------------------------

/**
 * The seven pieces, each as the cells it fills inside its own bounding box.
 *
 * A 4x4 box for the I and a 3x3 for the rest, which is what makes rotation a
 * transpose of the box rather than a table of four states per piece: the box is
 * square, so rotating it is arithmetic, and a piece added later needs no new
 * rotation data.
 */
export interface Tetromino {
  /** Side of the bounding box. */
  box: number;
  /** Cells filled inside the box, as box-relative indices. */
  cells: number[];
  /** Which colour ramp the renderer paints it with. */
  tone: number;
}

export const TETROMINOES: readonly Tetromino[] = [
  { box: 4, cells: [4, 5, 6, 7], tone: 1 }, // I
  { box: 3, cells: [0, 3, 4, 5], tone: 2 }, // J
  { box: 3, cells: [2, 3, 4, 5], tone: 3 }, // L
  { box: 2, cells: [0, 1, 2, 3], tone: 4 }, // O
  { box: 3, cells: [1, 2, 3, 4], tone: 5 }, // S
  { box: 3, cells: [1, 3, 4, 5], tone: 6 }, // T
  { box: 3, cells: [0, 1, 4, 5], tone: 7 }, // Z
];

export interface FallingPiece {
  piece: number;
  /** Quarter turns clockwise, 0..3. */
  rotation: number;
  /** Where the top-left of the bounding box sits on the well. */
  x: number;
  y: number;
}

/** The well cells a piece occupies, as {x, y} pairs. */
export function pieceCells(falling: FallingPiece): { x: number; y: number }[] {
  const shape = TETROMINOES[falling.piece];
  const box = shape.box;

  return shape.cells.map((cell) => {
    let x = cell % box;
    let y = Math.floor(cell / box);

    // Rotating inside the square box: (x, y) -> (box-1-y, x), applied as many
    // times as the piece has been turned. Written as a loop rather than four
    // formulas so there is one rule and not four chances to mistype one.
    for (let turn = 0; turn < falling.rotation % 4; turn++) {
      const rotatedX = box - 1 - y;
      const rotatedY = x;
      x = rotatedX;
      y = rotatedY;
    }

    return { x: falling.x + x, y: falling.y + y };
  });
}

/** Whether a piece in this position overlaps the walls, the floor or a block. */
export function tetrisCollides(
  well: readonly number[],
  columns: number,
  rows: number,
  falling: FallingPiece,
): boolean {
  return pieceCells(falling).some(({ x, y }) => {
    if (x < 0 || x >= columns || y >= rows) {
      return true;
    }
    // Above the ceiling is legal: a piece spawns partly off the top of the well
    // and is only in trouble once it cannot fall.
    if (y < 0) {
      return false;
    }
    return well[y * columns + x] !== 0;
  });
}

/** Writes a piece into the well. */
export function lockPiece(
  well: readonly number[],
  columns: number,
  falling: FallingPiece,
): number[] {
  const next = [...well];
  for (const { x, y } of pieceCells(falling)) {
    if (y >= 0) {
      next[y * columns + x] = TETROMINOES[falling.piece].tone;
    }
  }
  return next;
}

/** Removes full rows and reports how many. */
export function clearLines(
  well: readonly number[],
  columns: number,
  rows: number,
): { well: number[]; cleared: number } {
  const kept: number[][] = [];

  for (let row = 0; row < rows; row++) {
    const line = well.slice(row * columns, row * columns + columns);
    if (line.some((cell) => cell === 0)) {
      kept.push([...line]);
    }
  }

  const cleared = rows - kept.length;
  const blanks = Array.from({ length: cleared }, () =>
    new Array<number>(columns).fill(0),
  );

  return { well: [...blanks, ...kept].flat(), cleared };
}

/**
 * The standard line-clear payout, scaled by level.
 *
 * Four at once is worth more than four singles by a wide margin, which is the
 * whole reason anybody stacks nine deep and waits for an I.
 */
export function tetrisLineScore(cleared: number, level: number): number {
  const table = [0, 40, 100, 300, 1200];
  return (table[Math.min(cleared, 4)] ?? 0) * level;
}

// --- flood it ----------------------------------------------------------------

export function createFlood(
  size: number,
  colors: number,
  rng: Rng = Math.random,
): number[] {
  return Array.from({ length: size * size }, () =>
    Math.floor(rng() * colors) % colors,
  );
}

/**
 * Repaints the region connected to the top-left corner.
 *
 * An explicit stack rather than recursion: an 18x18 board is 324 cells and a
 * single-colour board would recurse that deep, which is fine in Node and is not
 * a promise worth making about every browser.
 */
export function floodFill(
  board: readonly number[],
  size: number,
  color: number,
): number[] {
  const from = board[0];
  if (from === color) {
    return [...board];
  }

  const next = [...board];
  const stack = [0];

  while (stack.length > 0) {
    const cell = stack.pop() as number;
    if (next[cell] !== from) {
      continue;
    }
    next[cell] = color;

    const column = cell % size;
    const row = Math.floor(cell / size);
    if (column > 0) stack.push(cell - 1);
    if (column < size - 1) stack.push(cell + 1);
    if (row > 0) stack.push(cell - size);
    if (row < size - 1) stack.push(cell + size);
  }

  return next;
}

export function isFlooded(board: readonly number[]): boolean {
  return board.every((cell) => cell === board[0]);
}

/**
 * How many cells the corner region currently holds. Shown as a progress figure,
 * because "how much of the board is mine" is the only feedback the game gives.
 */
export function floodedCount(board: readonly number[], size: number): number {
  const from = board[0];
  const seen = new Set<number>();
  const stack = [0];

  while (stack.length > 0) {
    const cell = stack.pop() as number;
    if (seen.has(cell) || board[cell] !== from) {
      continue;
    }
    seen.add(cell);

    const column = cell % size;
    const row = Math.floor(cell / size);
    if (column > 0) stack.push(cell - 1);
    if (column < size - 1) stack.push(cell + 1);
    if (row > 0) stack.push(cell - size);
    if (row < size - 1) stack.push(cell + size);
  }

  return seen.size;
}

// --- nonogram ----------------------------------------------------------------

export interface Nonogram {
  size: number;
  /** The picture. size*size, true for a filled cell. */
  solution: boolean[];
  /** Run lengths per row and per column, in order. An empty line is [0]. */
  rowClues: number[][];
  columnClues: number[][];
}

export function createNonogram(
  size: number,
  density: number,
  rng: Rng = Math.random,
): Nonogram {
  const solution = Array.from({ length: size * size }, () => rng() < density);

  // A completely empty line is legal but reads as a bug, and an empty PICTURE
  // is solved before it starts.
  if (solution.every((cell) => !cell)) {
    solution[0] = true;
  }

  const rowClues: number[][] = [];
  const columnClues: number[][] = [];

  for (let row = 0; row < size; row++) {
    rowClues.push(runsOf(solution.slice(row * size, row * size + size)));
  }
  for (let column = 0; column < size; column++) {
    const line: boolean[] = [];
    for (let row = 0; row < size; row++) {
      line.push(solution[row * size + column]);
    }
    columnClues.push(runsOf(line));
  }

  return { size, solution, rowClues, columnClues };
}

/** The run lengths in one line. [0] rather than [] for a blank line. */
export function runsOf(line: readonly boolean[]): number[] {
  const runs: number[] = [];
  let run = 0;

  for (const filled of line) {
    if (filled) {
      run++;
      continue;
    }
    if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  if (run > 0) {
    runs.push(run);
  }

  return runs.length > 0 ? runs : [0];
}

/**
 * Solved when the FILLED cells match, regardless of where the crosses are.
 *
 * Crosses are the player's own notes -- a way of remembering "not this one" --
 * and grading them would be marking somebody wrong for how they thought.
 */
export function isNonogramSolved(
  marks: readonly number[],
  puzzle: Nonogram,
): boolean {
  return puzzle.solution.every((filled, index) => filled === (marks[index] === 1));
}

// --- typing ------------------------------------------------------------------

/**
 * The word pool. Everyday Turkish, short enough that the test measures typing
 * rather than reading, and with the dotted and undotted i in it on purpose --
 * a Turkish typing test that never asks for ı is not one.
 */
export const TYPING_WORDS: readonly string[] = [
  "elma", "kitap", "deniz", "yıldız", "kalem", "pencere", "bahçe", "sokak",
  "kahve", "sabah", "akşam", "orman", "bulut", "yağmur", "rüzgar", "köprü",
  "şehir", "masa", "sandalye", "telefon", "bilgisayar", "anahtar", "çiçek",
  "güneş", "gece", "yol", "araba", "tren", "uçak", "gemi", "dağ", "nehir",
  "göl", "kuş", "kedi", "köpek", "balık", "ağaç", "yaprak", "taş", "kum",
  "ateş", "toprak", "hava", "su", "ekmek", "peynir", "zeytin", "çay", "şeker",
  "tuz", "biber", "domates", "salatalık", "portakal", "üzüm", "karpuz", "incir",
  "defter", "silgi", "çanta", "ayakkabı", "gömlek", "ceket", "şapka", "eldiven",
  "saat", "ayna", "perde", "halı", "lamba", "kapı", "duvar", "çatı", "merdiven",
  "bahar", "yaz", "sonbahar", "kış", "pazartesi", "cuma", "hafta", "ay", "yıl",
];

/** A passage of `count` words, chosen at random with repeats allowed. */
export function buildPassage(count: number, rng: Rng = Math.random): string[] {
  return Array.from({ length: count }, () => {
    const index = Math.floor(rng() * TYPING_WORDS.length) % TYPING_WORDS.length;
    return TYPING_WORDS[index];
  });
}

/**
 * Words per minute, on the standard five-characters-is-a-word definition.
 *
 * Counting actual words would reward a passage of short ones and punish a
 * passage of long ones, so every typing test ever built counts characters and
 * divides by five.
 */
export function wordsPerMinute(characters: number, elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return 0;
  }
  return Math.round(characters / 5 / (elapsedMs / 60_000));
}

/** How many of the typed characters are the ones that were asked for. */
export function typingAccuracy(typed: string, target: string): number {
  if (typed.length === 0) {
    return 100;
  }
  let correct = 0;
  for (let index = 0; index < typed.length; index++) {
    if (typed[index] === target[index]) {
      correct++;
    }
  }
  return Math.round((correct / typed.length) * 100);
}

// --- mental arithmetic -------------------------------------------------------

export interface MathQuestion {
  text: string;
  answer: number;
}

/**
 * One sum. Subtraction never goes negative and division always divides exactly,
 * because a mental-arithmetic sprint is a test of speed and a remainder is a
 * test of patience.
 */
export function buildQuestion(
  ceiling: number,
  multiply: boolean,
  rng: Rng = Math.random,
): MathQuestion {
  const pick = (limit: number) => 1 + (Math.floor(rng() * limit) % limit);
  const operations = multiply ? 4 : 2;

  switch (Math.floor(rng() * operations) % operations) {
    case 0: {
      const left = pick(ceiling);
      const right = pick(ceiling);
      return { text: `${left} + ${right}`, answer: left + right };
    }
    case 1: {
      const left = pick(ceiling);
      const right = pick(ceiling);
      // Ordered so the answer is never negative.
      const big = Math.max(left, right);
      const small = Math.min(left, right);
      return { text: `${big} - ${small}`, answer: big - small };
    }
    case 2: {
      // Kept inside the times tables whatever the ceiling is: 47x39 is not
      // mental arithmetic, it is long multiplication with a stopwatch.
      const left = pick(Math.min(ceiling, 12));
      const right = pick(Math.min(ceiling, 12));
      return { text: `${left} x ${right}`, answer: left * right };
    }
    default: {
      const right = pick(Math.min(ceiling, 12));
      const answer = pick(Math.min(ceiling, 12));
      return { text: `${right * answer} : ${right}`, answer };
    }
  }
}

// --- shared ------------------------------------------------------------------

/** 0..count-1, shuffled. Fisher-Yates, so every order is equally likely. */
export function shuffleIndices(count: number, rng: Rng = Math.random): number[] {
  const out = Array.from({ length: count }, (_, index) => index);
  for (let index = out.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1)) % (index + 1);
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

function shuffleValues(rng: Rng): number[] {
  const values = Array.from({ length: SUDOKU_SIZE }, (_, index) => index + 1);
  for (let index = values.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1)) % (index + 1);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}
