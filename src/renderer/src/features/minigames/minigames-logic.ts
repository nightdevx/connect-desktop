/**
 * The rules of every single-player game on the page, with no React in sight.
 *
 * Split out from the components for one reason: this is the half that can be
 * wrong without looking wrong. A merge that consumes a tile twice, a flood fill
 * that stops one cell short, a snake that dies moving into the tail square it
 * is about to vacate -- none of those throw, none of those paint a broken
 * layout, they just quietly play a different game than the one on the box.
 * scripts/check-minigames.cjs asserts this file and nothing else.
 *
 * Every function that needs randomness takes it as a parameter. That is what
 * lets the check run the same board twice and get the same board.
 */

/** Injectable Math.random. Returns [0, 1). */
export type Rng = () => number;

// --- 2048 -------------------------------------------------------------------

export const BOARD_SIZE = 4;
export const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
export const WINNING_TILE = 2048;

export type Direction = "left" | "right" | "up" | "down";

export const DIRECTIONS: readonly Direction[] = ["left", "right", "up", "down"];

/**
 * One row, packed towards index 0, merging equal neighbours exactly once.
 *
 * The extra `index += 1` after a merge is the whole rule: without it [2,2,2,2]
 * slides to [8,0,0,0] instead of [4,4,0,0], because the freshly merged 4
 * immediately matches the next pair. Every 2048 clone gets this wrong once.
 */
export function slideRow(row: readonly number[]): { row: number[]; gained: number } {
  const packed = row.filter((value) => value !== 0);
  const out: number[] = [];
  let gained = 0;

  for (let index = 0; index < packed.length; index += 1) {
    if (packed[index] === packed[index + 1]) {
      const merged = packed[index] * 2;
      out.push(merged);
      gained += merged;
      index += 1;
    } else {
      out.push(packed[index]);
    }
  }

  while (out.length < row.length) {
    out.push(0);
  }

  return { row: out, gained };
}

/**
 * The board indices of one line, ordered so that position 0 is the edge the
 * tiles are sliding towards. Four directions collapse into one slideRow.
 */
function lineIndices(line: number, direction: Direction): number[] {
  const steps = Array.from({ length: BOARD_SIZE }, (_, step) => step);

  switch (direction) {
    case "left":
      return steps.map((column) => line * BOARD_SIZE + column);
    case "right":
      return steps.map((column) => line * BOARD_SIZE + (BOARD_SIZE - 1 - column));
    case "up":
      return steps.map((row) => row * BOARD_SIZE + line);
    case "down":
      return steps.map((row) => (BOARD_SIZE - 1 - row) * BOARD_SIZE + line);
  }
}

/**
 * `moved` is not cosmetic: a move that changes nothing must NOT spawn a tile,
 * or holding a direction against a wall fills the board without playing.
 */
export function moveBoard(
  board: readonly number[],
  direction: Direction,
): { board: number[]; gained: number; moved: boolean } {
  const next = board.slice();
  let gained = 0;

  for (let line = 0; line < BOARD_SIZE; line += 1) {
    const indices = lineIndices(line, direction);
    const slid = slideRow(indices.map((boardIndex) => next[boardIndex]));
    gained += slid.gained;
    indices.forEach((boardIndex, position) => {
      next[boardIndex] = slid.row[position];
    });
  }

  return {
    board: next,
    gained,
    moved: next.some((value, index) => value !== board[index]),
  };
}

export function emptyBoard(): number[] {
  return Array.from({ length: BOARD_CELLS }, () => 0);
}

/** A 2 nine times out of ten, a 4 otherwise -- the original distribution. */
export function spawnTile(board: readonly number[], rng: Rng = Math.random): number[] {
  const free: number[] = [];
  board.forEach((value, index) => {
    if (value === 0) {
      free.push(index);
    }
  });

  if (free.length === 0) {
    return board.slice();
  }

  const next = board.slice();
  next[free[Math.floor(rng() * free.length)]] = rng() < 0.9 ? 2 : 4;
  return next;
}

export function createBoard(rng: Rng = Math.random): number[] {
  return spawnTile(spawnTile(emptyBoard(), rng), rng);
}

/**
 * Game over is "no direction changes anything", not "no empty cell". A full
 * board with an adjacent pair is still playable, and calling it dead is the
 * second classic 2048 bug.
 */
export function hasMoves(board: readonly number[]): boolean {
  return DIRECTIONS.some((direction) => moveBoard(board, direction).moved);
}

// --- Minesweeper ------------------------------------------------------------

export interface MineCell {
  mine: boolean;
  /** Mines touching this cell. Always 0 on a mine; nothing reads it there. */
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
}

const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function neighboursOf(index: number, columns: number, rows: number): number[] {
  const x = index % columns;
  const y = Math.floor(index / columns);
  const out: number[] = [];

  for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    // Guarded on x and y, not on the flat index: without the x test, the cell at
    // the right edge would neighbour the one at the left edge of the next row.
    if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) {
      continue;
    }
    out.push(ny * columns + nx);
  }

  return out;
}

/**
 * Built on the FIRST CLICK, not at reset, so that click can be guaranteed safe.
 * Mines avoid the clicked cell and its neighbours, which opens an area instead
 * of a lone number and removes the coin-flip death on move one.
 */
export function buildMinefield(
  columns: number,
  rows: number,
  mineCount: number,
  safeIndex: number,
  rng: Rng = Math.random,
): MineCell[] {
  const total = columns * rows;

  let forbidden = new Set([safeIndex, ...neighboursOf(safeIndex, columns, rows)]);
  // A board too crowded to keep the whole opening area clear still has to be
  // dealable. Protect the clicked cell alone rather than looping forever.
  if (total - forbidden.size < mineCount) {
    forbidden = new Set([safeIndex]);
  }

  const candidates: number[] = [];
  for (let index = 0; index < total; index += 1) {
    if (!forbidden.has(index)) {
      candidates.push(index);
    }
  }

  const mines = Math.max(0, Math.min(mineCount, candidates.length));

  // A partial Fisher-Yates. Rejection sampling -- pick a cell, retry if it
  // already holds a mine -- degrades badly exactly where this board lives: a
  // fifth of the cells are mines.
  for (let index = 0; index < mines; index += 1) {
    const pick = index + Math.floor(rng() * (candidates.length - index));
    const swap = candidates[index];
    candidates[index] = candidates[pick];
    candidates[pick] = swap;
  }

  const mined = new Set(candidates.slice(0, mines));

  return Array.from({ length: total }, (_, index) => ({
    mine: mined.has(index),
    adjacent: mined.has(index)
      ? 0
      : neighboursOf(index, columns, rows).filter((neighbour) => mined.has(neighbour))
          .length,
    revealed: false,
    flagged: false,
  }));
}

/**
 * Reveal, cascading through empty cells. Iterative on purpose: a recursive
 * flood fill over a large empty region is a stack overflow waiting for a bigger
 * board, and this one is already 16x16.
 */
export function revealCell(
  cells: readonly MineCell[],
  columns: number,
  rows: number,
  index: number,
): MineCell[] {
  const start = cells[index];
  if (!start || start.revealed || start.flagged) {
    return cells.slice();
  }

  const next = cells.map((cell) => ({ ...cell }));
  const stack = [index];

  while (stack.length > 0) {
    const current = stack.pop() as number;
    const cell = next[current];
    // A flag is a claim that a cell is a mine; the cascade has to respect it, or
    // an expanding empty region detonates the board on the user.
    if (cell.revealed || cell.flagged) {
      continue;
    }

    cell.revealed = true;

    if (cell.mine || cell.adjacent !== 0) {
      continue;
    }

    for (const neighbour of neighboursOf(current, columns, rows)) {
      if (!next[neighbour].revealed) {
        stack.push(neighbour);
      }
    }
  }

  return next;
}

/** Won when every safe cell is open. Flags are decoration, never the win test. */
export function isMinefieldWon(cells: readonly MineCell[]): boolean {
  return cells.every((cell) => cell.mine || cell.revealed);
}

// --- Snake ------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface SnakeState {
  /** Head first. */
  body: Point[];
  direction: Point;
  food: Point;
  alive: boolean;
  score: number;
}

export const SNAKE_COLUMNS = 17;
export const SNAKE_ROWS = 17;

function spawnFood(body: readonly Point[], rng: Rng): Point {
  const taken = new Set(body.map((point) => `${point.x},${point.y}`));
  const free: Point[] = [];

  for (let y = 0; y < SNAKE_ROWS; y += 1) {
    for (let x = 0; x < SNAKE_COLUMNS; x += 1) {
      if (!taken.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }

  // Board full: the player has won as hard as this game can be won. Parking the
  // food under the head keeps the shape valid until the next step ends it.
  return free.length === 0 ? body[0] : free[Math.floor(rng() * free.length)];
}

export function createSnake(rng: Rng = Math.random): SnakeState {
  const body: Point[] = [
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
  ];

  return {
    body,
    direction: { x: 1, y: 0 },
    food: spawnFood(body, rng),
    alive: true,
    score: 0,
  };
}

/**
 * Compared against the direction the snake actually MOVED, not against the
 * pending one. Two key presses between two ticks -- right, then up, then left --
 * would otherwise pass both checks individually and reverse the snake into its
 * own neck, which reads as dying for no reason.
 */
export function turnSnake(state: SnakeState, direction: Point): SnakeState {
  const moved =
    state.body.length > 1
      ? {
          x: state.body[0].x - state.body[1].x,
          y: state.body[0].y - state.body[1].y,
        }
      : state.direction;

  if (moved.x + direction.x === 0 && moved.y + direction.y === 0) {
    return state;
  }

  return { ...state, direction };
}

export function stepSnake(state: SnakeState, rng: Rng = Math.random): SnakeState {
  if (!state.alive) {
    return state;
  }

  const head = {
    x: state.body[0].x + state.direction.x,
    y: state.body[0].y + state.direction.y,
  };

  const ate = head.x === state.food.x && head.y === state.food.y;
  // The tail square is vacated on this same tick, so following your own tail is
  // legal -- unless the snake just ate, in which case the tail stays put.
  const occupied = ate ? state.body : state.body.slice(0, -1);

  const hitWall =
    head.x < 0 || head.y < 0 || head.x >= SNAKE_COLUMNS || head.y >= SNAKE_ROWS;
  const hitSelf = occupied.some((point) => point.x === head.x && point.y === head.y);

  if (hitWall || hitSelf) {
    return { ...state, alive: false };
  }

  const body = [head, ...occupied];

  return {
    body,
    direction: state.direction,
    food: ate ? spawnFood(body, rng) : state.food,
    alive: true,
    score: ate ? state.score + 1 : state.score,
  };
}

// --- Memory -----------------------------------------------------------------

/** Fisher-Yates. Used by the memory grid, and by nothing that needs more. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();

  for (let index = out.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(rng() * (index + 1));
    const swap = out[index];
    out[index] = out[pick];
    out[pick] = swap;
  }

  return out;
}
