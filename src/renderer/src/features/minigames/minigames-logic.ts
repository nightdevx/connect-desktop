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

/**
 * The classic board, and the default every function here falls back to.
 *
 * A parameter rather than a constant because difficulty moves it: 5x5 forgives,
 * 3x3 does not. Defaulted so that the call sites which genuinely mean "the
 * normal game" -- and the self-check -- stay readable.
 */
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
function lineIndices(line: number, direction: Direction, size: number): number[] {
  const steps = Array.from({ length: size }, (_, step) => step);

  switch (direction) {
    case "left":
      return steps.map((column) => line * size + column);
    case "right":
      return steps.map((column) => line * size + (size - 1 - column));
    case "up":
      return steps.map((row) => row * size + line);
    case "down":
      return steps.map((row) => (size - 1 - row) * size + line);
  }
}

/**
 * `moved` is not cosmetic: a move that changes nothing must NOT spawn a tile,
 * or holding a direction against a wall fills the board without playing.
 */
export function moveBoard(
  board: readonly number[],
  direction: Direction,
  size: number = BOARD_SIZE,
): { board: number[]; gained: number; moved: boolean } {
  const next = board.slice();
  let gained = 0;

  for (let line = 0; line < size; line += 1) {
    const indices = lineIndices(line, direction, size);
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

export function emptyBoard(size: number = BOARD_SIZE): number[] {
  return Array.from({ length: size * size }, () => 0);
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

export function createBoard(size: number = BOARD_SIZE, rng: Rng = Math.random): number[] {
  return spawnTile(spawnTile(emptyBoard(size), rng), rng);
}

/**
 * Game over is "no direction changes anything", not "no empty cell". A full
 * board with an adjacent pair is still playable, and calling it dead is the
 * second classic 2048 bug.
 */
export function hasMoves(board: readonly number[], size: number = BOARD_SIZE): boolean {
  return DIRECTIONS.some((direction) => moveBoard(board, direction, size).moved);
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
  /**
   * Turns taken but not yet walked, oldest first, at most SNAKE_TURN_QUEUE of
   * them. A tick consumes one.
   */
  pending: Point[];
  food: Point;
  alive: boolean;
  score: number;
}

/**
 * How many turns may be held between two ticks.
 *
 * Two, because two is what a corner is: at 210ms a tick the player is already
 * pressing the second key before the first has been walked, and one slot means
 * the corner is thrown away. Deeper than two and the snake stops answering the
 * keyboard -- it plays out a queue the player has stopped meaning.
 */
export const SNAKE_TURN_QUEUE = 2;

/** The normal board, and the default the functions below fall back to. */
export const SNAKE_COLUMNS = 17;
export const SNAKE_ROWS = 17;

/** How big the field is. Difficulty carries extra keys; nothing here reads them. */
export interface SnakeBoard {
  columns: number;
  rows: number;
}

export const SNAKE_BOARD: SnakeBoard = {
  columns: SNAKE_COLUMNS,
  rows: SNAKE_ROWS,
};

function spawnFood(body: readonly Point[], board: SnakeBoard, rng: Rng): Point {
  const { columns, rows } = board;
  const taken = new Set(body.map((point) => `${point.x},${point.y}`));
  const free: Point[] = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!taken.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }

  // Board full: the player has won as hard as this game can be won. Parking the
  // food under the head keeps the shape valid until the next step ends it.
  return free.length === 0 ? body[0] : free[Math.floor(rng() * free.length)];
}

/**
 * Three segments, centred, facing right.
 *
 * The head is placed from the board rather than at a fixed (8, 8): on the 13x13
 * hard board that constant is the far right wall, so the snake used to start
 * one tick from death.
 */
export function createSnake(
  board: SnakeBoard = SNAKE_BOARD,
  rng: Rng = Math.random,
): SnakeState {
  const x = Math.floor(board.columns / 2);
  const y = Math.floor(board.rows / 2);
  const body: Point[] = [
    { x, y },
    { x: x - 1, y },
    { x: x - 2, y },
  ];

  return {
    body,
    direction: { x: 1, y: 0 },
    pending: [],
    food: spawnFood(body, board, rng),
    alive: true,
    score: 0,
  };
}

/** The direction the body actually moved, which is not always the pending one. */
function snakeHeading(state: SnakeState): Point {
  return state.body.length > 1
    ? {
        x: state.body[0].x - state.body[1].x,
        y: state.body[0].y - state.body[1].y,
      }
    : state.direction;
}

/**
 * Queues a turn rather than overwriting the direction.
 *
 * The board ticks as slowly as 210ms, and a corner is two key presses. Both
 * land inside one tick, and the old rule -- check every press against the
 * direction the body has MOVED -- refused the second one: right, then up, then
 * left saw "left" measured against "right", called it a reversal, and dropped
 * it. Nothing said so, so it read as the game ignoring the keyboard, which is
 * exactly what players reported.
 *
 * Each press is checked against what will be moving when it is its turn -- the
 * last queued direction, or the heading if nothing is queued. That still
 * refuses a real reversal (right then left is a reversal wherever it sits in
 * the queue) while keeping the corner, and the two turns are walked one per
 * tick instead of one of them being lost.
 */
export function turnSnake(state: SnakeState, direction: Point): SnakeState {
  const pending = state.pending ?? [];
  const last = pending.length > 0 ? pending[pending.length - 1] : snakeHeading(state);

  // Already going that way, or already queued to: the press is not a turn.
  if (last.x === direction.x && last.y === direction.y) {
    return state;
  }
  if (last.x + direction.x === 0 && last.y + direction.y === 0) {
    return state;
  }
  if (pending.length >= SNAKE_TURN_QUEUE) {
    return state;
  }

  return { ...state, pending: [...pending, direction] };
}

export function stepSnake(
  state: SnakeState,
  board: SnakeBoard = SNAKE_BOARD,
  rng: Rng = Math.random,
): SnakeState {
  if (!state.alive) {
    return state;
  }

  const pending = state.pending ?? [];
  const direction = pending.length > 0 ? pending[0] : state.direction;
  const queued = pending.slice(1);

  const head = {
    x: state.body[0].x + direction.x,
    y: state.body[0].y + direction.y,
  };

  const ate = head.x === state.food.x && head.y === state.food.y;
  // The tail square is vacated on this same tick, so following your own tail is
  // legal -- unless the snake just ate, in which case the tail stays put.
  const occupied = ate ? state.body : state.body.slice(0, -1);

  const hitWall =
    head.x < 0 || head.y < 0 || head.x >= board.columns || head.y >= board.rows;
  const hitSelf = occupied.some((point) => point.x === head.x && point.y === head.y);

  if (hitWall || hitSelf) {
    return { ...state, alive: false };
  }

  const body = [head, ...occupied];

  return {
    body,
    direction,
    pending: queued,
    food: ate ? spawnFood(body, board, rng) : state.food,
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
