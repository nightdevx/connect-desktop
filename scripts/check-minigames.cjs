#!/usr/bin/env node
// Self-check for src/renderer/src/features/minigames/minigames-logic.ts.
//
// Every rule below is one that breaks the GAME without breaking the PAGE: no
// throw, no blank panel, no console error -- the board simply plays by
// different rules than the ones on the card, and nobody can tell whether they
// lost or the code did. The four that were actually got wrong while writing it
// are the four asserted hardest:
//
//   MERGE ONCE  [2,2,2,2] slides to [4,4], not to [8]. Dropping the extra
//               index bump doubles every row of pairs and turns 2048 into a
//               game you win in about nine moves.
//   NOT DEAD    Game over is "no direction changes anything", not "no empty
//               cell". A full board with an adjacent pair is still playable.
//   FIRST SAFE  Minesweeper builds its field on the first CLICK so that click
//               can be guaranteed safe -- clicked cell and neighbours clear.
//               Built at reset instead, move one is a coin flip.
//   TAIL CHASE  The snake's tail square is vacated on the same tick, so moving
//               into it is legal. Counting it as a collision kills the player
//               at length 4 for a move the game is supposed to allow.
//
// The module is pure -- no React, no DOM, no electron -- so it bundles
// standalone. Output goes under node_modules/.cache for the same reason the
// other checks do: bare specifiers cannot resolve from a system temp directory.
//
//   node scripts/check-minigames.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

/**
 * A seeded LCG, so "random" boards are reproducible here.
 *
 * Numeric Recipes constants. Nothing about the games needs a good generator --
 * this one only has to be deterministic and to spread across [0, 1).
 */
const seededRng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-minigames-"));

  // Two entries, one build. Both are pure -- no React, no DOM, no electron --
  // which is what lets them bundle standalone at all.
  const bundle = async (entry, fileName) => {
    await build({
      root: projectRoot,
      logLevel: "error",
      // Not vite.config.ts: it carries the Sentry plugin, which would upload a
      // source map for this throwaway bundle on every check run.
      configFile: false,
      build: {
        outDir,
        // false: the second build must not wipe the first one's output.
        emptyOutDir: false,
        ssr: true,
        lib: {
          entry: path.join(projectRoot, entry),
          formats: ["es"],
          fileName: () => fileName,
        },
      },
    });

    return import(pathToFileURL(path.join(outDir, fileName)).href);
  };

  const {
    slideRow,
    moveBoard,
    spawnTile,
    emptyBoard,
    createBoard,
    hasMoves,
    buildMinefield,
    revealCell,
    isMinefieldWon,
    createSnake,
    stepSnake,
    turnSnake,
    SNAKE_TURN_QUEUE,
    shuffle,
    SNAKE_COLUMNS,
    SNAKE_ROWS,
    SNAKE_BOARD,
  } = await bundle(
    "src/renderer/src/features/minigames/minigames-logic.ts",
    "minigames-logic.mjs",
  );

  const {
    RULES_2048,
    RULES_MINES,
    RULES_SNAKE,
    RULES_MEMORY,
    RULES_SUDOKU,
    RULES_PUZZLE,
    RULES_LIGHTS,
    RULES_TETRIS,
    RULES_FLOOD,
    RULES_NONOGRAM,
    SOLO_GAME_IDS,
    describeDifficulty,
    difficultyOptions,
  } = await bundle(
    "src/renderer/src/features/minigames/difficulty.ts",
    "difficulty.mjs",
  );

  const { scoreKey, splitScoreKey, DIFFICULTY_IDS, DEFAULT_DIFFICULTY } = await bundle(
    "src/renderer/src/store/minigame-scores.ts",
    "minigame-scores.mjs",
  );

  const {
    createSudoku,
    isSudokuSolved,
    sudokuAccepts,
    sudokuConflicts,
    createSlidePuzzle,
    isSlideSolved,
    slideTile,
    slideNeighbours,
    createLights,
    pressLight,
    isLightsOut,
    TETROMINOES,
    pieceCells,
    tetrisCollides,
    clearLines,
    tetrisLineScore,
    createFlood,
    floodFill,
    isFlooded,
    floodedCount,
    createNonogram,
    runsOf,
    isNonogramSolved,
    buildPassage,
    wordsPerMinute,
    typingAccuracy,
    buildQuestion,
  } = await bundle(
    "src/renderer/src/features/minigames/solo-logic.ts",
    "solo-logic.mjs",
  );

  // "minigames.mjs" and not "shared-minigames.mjs": this vite writes the output
  // under the ENTRY's basename and ignores the fileName it is handed, which
  // every other call above gets away with only because their names already
  // agree with their entries.
  const { MULTIPLAYER_GAME_IDS, MULTIPLAYER_SEATS } = await bundle(
    "src/shared/minigames.ts",
    "minigames.mjs",
  );

  const {
    parseFenPieces,
    squareName,
    isLightSquare,
    isWhitePiece,
    pieceGlyph,
    parseUci,
    movesByOrigin,
    boardOrder,
    squareIndex,
    moveOffset,
    pairMoves,
    lastMoveSeat,
  } = await bundle(
    "src/renderer/src/features/minigames/chess-position.ts",
    "chess-position.mjs",
  );

  // --- 2048 -----------------------------------------------------------------

  // MERGE ONCE. The whole game hangs off this one line.
  assert.deepEqual(slideRow([2, 2, 2, 2]), { row: [4, 4, 0, 0], gained: 8 });
  assert.deepEqual(slideRow([4, 4, 2, 2]), { row: [8, 4, 0, 0], gained: 12 });
  // A merged tile must not merge again in the same slide.
  assert.deepEqual(slideRow([2, 2, 4, 0]), { row: [4, 4, 0, 0], gained: 4 });
  // Gaps close, nothing merges.
  assert.deepEqual(slideRow([0, 2, 0, 4]), { row: [2, 4, 0, 0], gained: 0 });
  // Already packed and unmergeable: unchanged, no score.
  assert.deepEqual(slideRow([8, 4, 2, 0]), { row: [8, 4, 2, 0], gained: 0 });

  // Direction. Row 0 is [2,2,0,0]; left packs it, right packs the other way.
  const pair = [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(moveBoard(pair, "left").board[0], 4);
  assert.equal(moveBoard(pair, "right").board[3], 4);

  // Columns, not rows. A 2 at each end of column 0 merges upward into index 0.
  const column = emptyBoard();
  column[0] = 2;
  column[12] = 2;
  assert.equal(moveBoard(column, "up").board[0], 4);
  assert.equal(moveBoard(column, "down").board[12], 4);

  // `moved` gates the tile spawn: a slide against a wall must report false, or
  // holding one direction fills the board without ever playing a move.
  // Row 0 is [2,4,8,0]: already packed left and unmergeable, so "left" changes
  // nothing, while "right" slides all three across the gap.
  const packedLeft = [2, 4, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(moveBoard(packedLeft, "left").moved, false);
  assert.equal(moveBoard(packedLeft, "right").moved, true);

  // NOT DEAD. A full board with no equal neighbours is over; the same board
  // with one repeated pair is not.
  const checker = [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ];
  assert.equal(hasMoves(checker), false, "alternating full board is game over");
  const nearlyDead = checker.slice();
  nearlyDead[15] = 4; // now 4 sits beside 4
  assert.equal(hasMoves(nearlyDead), true, "a full board with a pair is playable");

  // Spawns land on empty cells only, and never overwrite.
  const oneGap = Array.from({ length: 16 }, (_, index) => (index === 7 ? 0 : 2));
  const filled = spawnTile(oneGap, seededRng(1));
  assert.ok(filled[7] === 2 || filled[7] === 4);
  assert.equal(filled.filter((value) => value === 0).length, 0);
  // A board with no room comes back unchanged rather than throwing.
  assert.deepEqual(spawnTile(filled, seededRng(2)).length, 16);

  // --- minesweeper ----------------------------------------------------------

  // FIRST SAFE. Over many seeds, the clicked cell and all eight neighbours must
  // be clear every single time -- this is a guarantee, not a tendency.
  for (let seed = 1; seed <= 200; seed += 1) {
    const field = buildMinefield(16, 16, 40, 34, seededRng(seed));
    assert.equal(field.length, 256);
    assert.equal(field.filter((cell) => cell.mine).length, 40);
    for (const index of [34, 17, 18, 19, 33, 35, 49, 50, 51]) {
      assert.equal(field[index].mine, false, `seed ${seed} mined the safe area`);
    }
  }

  // Adjacency counts must not wrap the row. Two mines packed at the left edge
  // of row 1 may never be counted by the cell at the right edge of row 0.
  {
    // 3x3 with a single mine at the centre: every other cell reads 1.
    const tiny = buildMinefield(3, 3, 1, 0, seededRng(7));
    const mineIndex = tiny.findIndex((cell) => cell.mine);
    assert.ok(mineIndex >= 0);
    // The mine is somewhere outside the protected area; every safe cell's count
    // equals however many of its own neighbours are mined, so the total of all
    // counts equals the number of (safe cell, mined neighbour) pairs.
    const expectedTotal = tiny.reduce((sum, cell, index) => {
      if (cell.mine) return sum;
      const x = index % 3;
      const y = Math.floor(index / 3);
      const mx = mineIndex % 3;
      const my = Math.floor(mineIndex / 3);
      const touches = Math.abs(x - mx) <= 1 && Math.abs(y - my) <= 1;
      return sum + (touches ? 1 : 0);
    }, 0);
    const actualTotal = tiny.reduce((sum, cell) => sum + (cell.mine ? 0 : cell.adjacent), 0);
    assert.equal(actualTotal, expectedTotal, "adjacency wrapped a row edge");
  }

  // An empty board opens completely from one click. Zero mines makes this
  // deterministic; with a mine on the board it is not, and deliberately so --
  // see the invariant below.
  {
    const field = buildMinefield(5, 5, 0, 24, seededRng(11));
    const opened = revealCell(field, 5, 5, 24);
    assert.equal(opened.filter((cell) => cell.revealed).length, 25);
    assert.equal(isMinefieldWon(opened), true);
  }

  // With a mine on the board, "how many cells open" is NOT a fixed number: a
  // corner sitting diagonally behind two numbered cells stays shut, which is
  // real minesweeper and not a bug. The invariant that does hold is that the
  // cascade never stops early -- every open EMPTY cell has opened all eight of
  // its neighbours -- and that it never opens a mine.
  {
    const neighbours = (index, columns, rows) => {
      const x = index % columns;
      const y = Math.floor(index / columns);
      const out = [];
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        out.push(ny * columns + nx);
      }
      return out;
    };

    for (let seed = 1; seed <= 50; seed += 1) {
      const field = buildMinefield(9, 9, 5, 40, seededRng(seed));
      const opened = revealCell(field, 9, 9, 40);

      assert.equal(opened[40].revealed, true, "the clicked cell stayed shut");
      assert.equal(
        opened.some((cell) => cell.revealed && cell.mine),
        false,
        `seed ${seed}: the cascade opened a mine`,
      );

      opened.forEach((cell, index) => {
        if (!cell.revealed || cell.adjacent !== 0 || cell.mine) return;
        for (const neighbour of neighbours(index, 9, 9)) {
          assert.equal(
            opened[neighbour].revealed,
            true,
            `seed ${seed}: cascade stopped early at ${neighbour}`,
          );
        }
      });
    }
  }

  // A flag stops the cascade dead. Without this an expanding region detonates
  // the board on the user by revealing the cell they marked as a mine. Run on
  // an empty board so the flagged cell is guaranteed to be inside the region
  // the cascade would otherwise reach.
  {
    const field = buildMinefield(5, 5, 0, 24, seededRng(11));
    const withFlag = field.map((cell, index) =>
      index === 0 ? { ...cell, flagged: true } : cell,
    );
    const opened = revealCell(withFlag, 5, 5, 24);
    assert.equal(opened[0].revealed, false, "cascade ignored a flag");
    // ...and only that cell: a flag must not shut down the rest of the sweep.
    assert.equal(opened.filter((cell) => cell.revealed).length, 24);
  }

  // Won means every SAFE cell is open. Flags are decoration and must never
  // stand in for a reveal.
  {
    const field = buildMinefield(5, 5, 3, 12, seededRng(21));
    const allFlagged = field.map((cell) => ({ ...cell, flagged: true }));
    assert.equal(isMinefieldWon(allFlagged), false, "flags counted as a win");
    const allOpen = field.map((cell) => ({ ...cell, revealed: true }));
    assert.equal(isMinefieldWon(allOpen), true);
  }

  // The input is never mutated: React state is compared by reference, and an
  // in-place reveal repaints nothing.
  {
    const field = buildMinefield(5, 5, 1, 24, seededRng(11));
    revealCell(field, 5, 5, 24);
    assert.equal(
      field.some((cell) => cell.revealed),
      false,
      "revealCell mutated its input",
    );
  }

  // --- snake ----------------------------------------------------------------

  {
    const start = createSnake(SNAKE_BOARD, seededRng(3));
    assert.equal(start.body.length, 3);
    assert.equal(start.alive, true);
    // Food never spawns under the snake.
    assert.equal(
      start.body.some((p) => p.x === start.food.x && p.y === start.food.y),
      false,
    );

    // A plain step moves the head and keeps the length.
    const moved = stepSnake(start, SNAKE_BOARD, seededRng(3));
    assert.equal(moved.body.length, 3);
    assert.equal(moved.body[0].x, start.body[0].x + 1);

    // Reversing into your own neck is refused. The snake is heading right, so
    // "left" must be ignored -- accepting it is instant death by fat finger.
    assert.deepEqual(turnSnake(start, { x: -1, y: 0 }).pending, [], "a reversal was queued");
    // A legal turn is QUEUED, not applied: the snake keeps moving the way it is
    // moving until the tick that walks the turn.
    const turnedUp = turnSnake(start, { x: 0, y: -1 });
    assert.deepEqual(turnedUp.pending, [{ x: 0, y: -1 }]);
    assert.deepEqual(turnedUp.direction, { x: 1, y: 0 }, "a turn moved the snake before its tick");
    assert.deepEqual(stepSnake(turnedUp, SNAKE_BOARD, seededRng(3)).direction, { x: 0, y: -1 });

    // THE CORNER. Right, then up, then left, all inside one tick. Both turns
    // must survive and be walked one per tick -- this is the input players
    // reported as being swallowed, and measuring the second press against the
    // direction the body had MOVED is what swallowed it.
    const corner = turnSnake(turnedUp, { x: -1, y: 0 });
    assert.deepEqual(
      corner.pending,
      [
        { x: 0, y: -1 },
        { x: -1, y: 0 },
      ],
      "the second turn of a corner was dropped",
    );

    const cornerUp = stepSnake(corner, SNAKE_BOARD, seededRng(3));
    assert.deepEqual(cornerUp.direction, { x: 0, y: -1 });
    assert.equal(cornerUp.alive, true);
    const cornerLeft = stepSnake(cornerUp, SNAKE_BOARD, seededRng(3));
    assert.deepEqual(cornerLeft.direction, { x: -1, y: 0 });
    assert.equal(cornerLeft.alive, true, "the queued corner drove the snake into its own neck");
    assert.deepEqual(cornerLeft.pending, []);

    // A queued turn is still checked for a reversal, against the turn ahead of
    // it rather than against the body: up then down is a reversal wherever it
    // sits in the queue.
    assert.deepEqual(
      turnSnake(turnedUp, { x: 0, y: 1 }).pending,
      [{ x: 0, y: -1 }],
      "a reversal against a queued turn was allowed",
    );

    // Pressing the way you are already going is not a turn and must not eat a
    // slot -- a held key would otherwise fill the queue with nothing.
    assert.deepEqual(turnSnake(start, { x: 1, y: 0 }).pending, []);
    assert.deepEqual(turnSnake(turnedUp, { x: 0, y: -1 }).pending, [{ x: 0, y: -1 }]);

    // The queue is bounded. Past the cap the snake would be playing out a queue
    // the player has stopped meaning.
    assert.equal(SNAKE_TURN_QUEUE, 2);
    assert.equal(turnSnake(corner, { x: 0, y: 1 }).pending.length, SNAKE_TURN_QUEUE);
  }

  // TAIL CHASE. A snake curled into a square moving onto the square its tail is
  // leaving must survive.
  {
    const state = {
      body: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
      ],
      direction: { x: -1, y: 0 },
      food: { x: 12, y: 12 },
      alive: true,
      score: 0,
    };
    assert.equal(stepSnake(state, SNAKE_BOARD, seededRng(5)).alive, true, "died chasing its own tail");
  }

  // Walls kill.
  {
    const atEdge = {
      body: [{ x: SNAKE_COLUMNS - 1, y: 0 }],
      direction: { x: 1, y: 0 },
      food: { x: 3, y: 3 },
      alive: true,
      score: 0,
    };
    assert.equal(stepSnake(atEdge, SNAKE_BOARD, seededRng(5)).alive, false);
    // And a dead snake stays dead rather than walking off the board.
    assert.deepEqual(stepSnake(stepSnake(atEdge, SNAKE_BOARD, seededRng(5)), SNAKE_BOARD, seededRng(5)).alive, false);
  }

  // Eating grows the body by one and moves the food somewhere legal.
  {
    const about = createSnake(SNAKE_BOARD, seededRng(9));
    const head = about.body[0];
    const eating = {
      ...about,
      food: { x: head.x + 1, y: head.y },
    };
    const after = stepSnake(eating, SNAKE_BOARD, seededRng(9));
    assert.equal(after.body.length, about.body.length + 1);
    assert.equal(after.score, 1);
    assert.ok(after.food.x >= 0 && after.food.x < SNAKE_COLUMNS);
    assert.ok(after.food.y >= 0 && after.food.y < SNAKE_ROWS);
    assert.equal(
      after.body.some((p) => p.x === after.food.x && p.y === after.food.y),
      false,
      "food respawned inside the snake",
    );
  }

  // --- memory ---------------------------------------------------------------

  // A shuffle that drops or duplicates a card breaks the game silently: the
  // board becomes unwinnable and looks exactly like a hard deal.
  {
    const deck = ["a", "a", "b", "b", "c", "c", "d", "d"];
    const shuffled = shuffle(deck, seededRng(13));
    assert.equal(shuffled.length, deck.length);
    assert.deepEqual([...shuffled].sort(), [...deck].sort());
    assert.deepEqual(deck, ["a", "a", "b", "b", "c", "c", "d", "d"], "shuffle mutated its input");
    // Deterministic for a given seed, which is what makes this check stable.
    assert.deepEqual(shuffle(deck, seededRng(13)), shuffled);
  }

  // --- chess position -------------------------------------------------------

  // No chess RULES are asserted here -- those live on the server, on top of a
  // library with its own suite. What is asserted is the reading of a position
  // for the screen, which fails silently in the nastiest way there is: a board
  // that is upside down is perfectly plausible and completely wrong.

  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  {
    const board = parseFenPieces(START_FEN);
    assert.equal(board.length, 64);

    // RANK ORDER. FEN starts at rank 8, so index 0 is a8 and holds BLACK's rook
    // -- lowercase. Reading the ranks the other way round gives a board that
    // looks like chess and has both armies on the wrong side.
    assert.equal(board[0], "r", "index 0 must be a8, black's queen-side rook");
    assert.equal(board[4], "k", "index 4 must be e8, the black king");
    assert.equal(board[60], "K", "index 60 must be e1, the white king");
    assert.equal(board[63], "R", "index 63 must be h1");

    // The digits are runs of EMPTY squares, not one square each: read as single
    // squares, the whole middle of the board collapses and the white army lands
    // four ranks too high.
    for (let index = 16; index < 48; index += 1) {
      assert.equal(board[index], null, `index ${index} should be empty`);
    }
    assert.equal(board.filter((piece) => piece !== null).length, 32);
  }

  // Square names have to agree with the same indexing, or a click sends a move
  // for a square the player did not touch.
  assert.equal(squareName(0), "a8");
  assert.equal(squareName(7), "h8");
  assert.equal(squareName(56), "a1");
  assert.equal(squareName(63), "h1");

  // a8 is light on a real board, and h1 is light. Getting this inverted gives a
  // board that is subtly, permanently wrong-looking.
  assert.equal(isLightSquare(0), true, "a8 is light");
  assert.equal(isLightSquare(1), false, "b8 is dark");
  assert.equal(isLightSquare(63), true, "h1 is light");

  // Case carries the colour, and it is the ONLY thing that does.
  assert.equal(isWhitePiece("K"), true);
  assert.equal(isWhitePiece("k"), false);
  // Both colours get the same solid glyph; the palette tells them apart. An
  // outline glyph for white is invisible on a dark square.
  assert.equal(pieceGlyph("K"), pieceGlyph("k"));
  assert.equal(pieceGlyph("K"), "♚");
  assert.equal(pieceGlyph("p"), "♟");
  // An unknown letter must not throw inside a render.
  assert.equal(pieceGlyph("x"), "");

  // A malformed FEN must paint a wrong board, never throw and blank the page.
  assert.equal(parseFenPieces("").length, 64);
  assert.equal(parseFenPieces("garbage").length, 64);
  // More squares than a board holds: the overflow is dropped, not written past
  // the end of the array.
  assert.equal(parseFenPieces("8/8/8/8/8/8/8/8/8/8/8/8 w - - 0 1").length, 64);

  // UCI. The promotion suffix is what the picker keys off, so it must survive.
  assert.deepEqual(parseUci("e2e4"), { from: "e2", to: "e4", promotion: null });
  assert.deepEqual(parseUci("a7b8n"), { from: "a7", to: "b8", promotion: "n" });
  assert.equal(parseUci("e2"), null);

  {
    // Four moves to the same square is the ONLY signal a promotion is due --
    // grouping that collapsed them would leave the player unable to pick.
    const grouped = movesByOrigin([
      "e2e4",
      "e2e3",
      "a7a8q",
      "a7a8r",
      "a7a8b",
      "a7a8n",
    ]);
    assert.equal(grouped.get("e2").length, 2);
    assert.equal(grouped.get("a7").length, 4);
    assert.deepEqual(
      grouped.get("a7").map((move) => move.promotion).sort(),
      ["b", "n", "q", "r"],
    );
    // A square with no legal move is absent, which is what makes "has a move"
    // the selectability test in the board component.
    assert.equal(grouped.get("h5"), undefined);
  }

  // Black sees the board from its own side. Flipped, the first square drawn is
  // h1 and the last is a8.
  {
    const white = boardOrder(false);
    const black = boardOrder(true);
    assert.equal(white[0], 0);
    assert.equal(white[63], 63);
    assert.equal(black[0], 63);
    assert.equal(black[63], 0);
    // Same 64 squares, no duplicates: a flip that lost one would silently hide
    // a piece.
    assert.deepEqual([...black].sort((a, b) => a - b), white);
  }

  // --- reading a move back ---------------------------------------------------

  // squareIndex is the inverse of squareName, and the check highlight and the
  // slide both cross that gap: the server names squares, the board is an array.
  // A round trip that does not close paints a red king on the wrong square.
  for (let index = 0; index < 64; index += 1) {
    assert.equal(squareIndex(squareName(index)), index);
  }
  // Garbage names a square that is not on the board rather than square 0, which
  // is what keeps a malformed frame from highlighting a8.
  assert.equal(squareIndex("j9"), -1);
  assert.equal(squareIndex(""), -1);
  assert.equal(squareIndex("e0"), -1);

  {
    // The slide starts a piece displaced by where it CAME FROM and animates the
    // displacement away, so the sign is origin-minus-destination. For white,
    // e2 is two rows BELOW e4 on screen -- rank 8 is row 0 -- so the pawn
    // starts +2 down and travels up.
    const push = { from: "e2", to: "e4", promotion: null };
    assert.deepEqual(moveOffset(push, false), { dx: 0, dy: 2 });
    // Black sees the same move from the other side, so it runs the other way.
    // Getting this wrong animates every one of black moves backwards.
    assert.deepEqual(moveOffset(push, true), { dx: 0, dy: -2 });

    // A knight moves in both axes at once, which is the case a one-dimensional
    // offset would silently get half right.
    assert.deepEqual(
      moveOffset({ from: "g1", to: "f3", promotion: null }, false),
      { dx: 1, dy: 2 },
    );

    // A move whose squares do not parse animates nothing rather than throwing
    // inside a render.
    assert.equal(moveOffset({ from: "zz", to: "e4", promotion: null }, false), null);
  }

  {
    // The scoresheet. Chess counts a full move as both sides having played, so
    // a flat list of plies is not what anybody reads back.
    assert.deepEqual(pairMoves([]), []);
    assert.deepEqual(pairMoves(["e4"]), [{ number: 1, white: "e4", black: null }]);
    assert.deepEqual(pairMoves(["e4", "e5", "Nf3"]), [
      { number: 1, white: "e4", black: "e5" },
      // White has moved and black has not replied: the row exists with a hole
      // in it, which is what the "…" in the list is.
      { number: 2, white: "Nf3", black: null },
    ]);

    // Seat 0 is white and white opens every game, so the parity needs no other
    // input. This is what the "you played" / "they played" line is keyed off,
    // and inverting it tells both players the wrong thing at once.
    assert.equal(lastMoveSeat([]), -1);
    assert.equal(lastMoveSeat(["e4"]), 0);
    assert.equal(lastMoveSeat(["e4", "e5"]), 1);
    assert.equal(lastMoveSeat(["e4", "e5", "Nf3"]), 0);
  }

  // --- difficulty ------------------------------------------------------------

  // The bounds the SERVER uses to reject an impossible score are derived from
  // these numbers by hand, in internal/minigame/score.go. A board that grows
  // here without the ceiling moving there turns a legitimate run into a 400 the
  // player cannot do anything about, so the arithmetic is asserted rather than
  // trusted.
  //
  // Kept as literals rather than read from the Go file: the point is that two
  // independent statements of the same number agree, and parsing one out of the
  // other would just be one statement with extra steps.
  {
    // snake:easy = 358, snake:normal = 286, snake:hard = 166 -- every cell of
    // the board minus the three segments it starts with.
    const SERVER_SNAKE_MAX = { easy: 358, normal: 286, hard: 166 };
    for (const id of DIFFICULTY_IDS) {
      const { columns, rows } = RULES_SNAKE[id];
      assert.equal(
        columns * rows - 3,
        SERVER_SNAKE_MAX[id],
        `snake:${id} can reach ${columns * rows - 3}, but the server caps it at ${SERVER_SNAKE_MAX[id]}`,
      );
    }

    // memory:easy = 6, normal = 8, hard = 12 -- one guess per pair is a perfect
    // game, and fewer is impossible.
    const SERVER_MEMORY_MIN = { easy: 6, normal: 8, hard: 12 };
    for (const id of DIFFICULTY_IDS) {
      assert.equal(
        RULES_MEMORY[id].pairs,
        SERVER_MEMORY_MIN[id],
        `memory:${id} deals ${RULES_MEMORY[id].pairs} pairs, but the server's floor is ${SERVER_MEMORY_MIN[id]}`,
      );
    }
  }

  {
    // Every solo game has every difficulty, and each one is a different board.
    // Three identical entries would be a picker that does nothing.
    for (const game of SOLO_GAME_IDS) {
      const options = difficultyOptions(game);
      assert.equal(options.length, 3, `${game} has ${options.length} difficulties`);
      assert.deepEqual(
        options.map((option) => option.id),
        [...DIFFICULTY_IDS],
        `${game} lists its difficulties out of order`,
      );

      const hints = options.map((option) => option.hint);
      assert.equal(
        new Set(hints).size,
        3,
        `${game} describes two difficulties identically: ${hints.join(" / ")}`,
      );
      for (const hint of hints) {
        assert.ok(hint.length > 0, `${game} has a difficulty with no description`);
      }
    }

    // The hint is generated from the rules, so it cannot go stale -- assert it
    // actually reflects them rather than being a constant.
    assert.equal(describeDifficulty("minesweeper", "hard"), "30x16, 99 mayın");
    assert.equal(describeDifficulty("2048", "easy"), "5x5 tahta");
    assert.equal(describeDifficulty("memory", "normal"), "8 çift");
  }

  {
    // Difficulty has to CHANGE the game, in the direction it claims.
    assert.ok(
      RULES_2048.easy.size > RULES_2048.normal.size,
      "easy 2048 is not a bigger board",
    );
    assert.ok(
      RULES_2048.hard.size < RULES_2048.normal.size,
      "hard 2048 is not a smaller board",
    );

    const density = (id) => {
      const { columns, rows, mines } = RULES_MINES[id];
      return mines / (columns * rows);
    };
    assert.ok(density("easy") < density("normal"), "easy is not the sparser field");
    assert.ok(density("normal") < density("hard"), "hard is not the denser field");

    // A field with no room to open is not a game: buildMinefield protects the
    // clicked cell and its eight neighbours, and needs somewhere to put the
    // mines afterwards.
    for (const id of DIFFICULTY_IDS) {
      const { columns, rows, mines } = RULES_MINES[id];
      assert.ok(
        columns * rows - 9 > mines,
        `minesweeper:${id} has no room for a safe opening`,
      );
    }

    // Snake gets faster AND smaller, and never faster than its own floor.
    assert.ok(
      RULES_SNAKE.easy.baseTickMs > RULES_SNAKE.normal.baseTickMs,
      "easy snake is not slower",
    );
    assert.ok(
      RULES_SNAKE.hard.baseTickMs < RULES_SNAKE.normal.baseTickMs,
      "hard snake is not faster",
    );
    for (const id of DIFFICULTY_IDS) {
      const rules = RULES_SNAKE[id];
      assert.ok(
        rules.floorTickMs < rules.baseTickMs,
        `snake:${id} starts at its own speed limit`,
      );
      // The snake starts three long, centred and facing right. On a board too
      // narrow for that it begins inside a wall.
      assert.ok(Math.floor(rules.columns / 2) - 2 >= 0, `snake:${id} starts in a wall`);
    }

    // Memory has to fill whole rows, or the last row is ragged.
    for (const id of DIFFICULTY_IDS) {
      const { pairs, columns } = RULES_MEMORY[id];
      assert.equal(
        (pairs * 2) % columns,
        0,
        `memory:${id} deals ${pairs * 2} cards into ${columns} columns`,
      );
    }
  }

  {
    // Score keys. The round trip is what carries a record from one build to the
    // next, and the legacy case is what stops the migration losing one.
    for (const game of SOLO_GAME_IDS) {
      for (const id of DIFFICULTY_IDS) {
        const key = scoreKey(game, id);
        assert.equal(key, `${game}:${id}`);
        assert.deepEqual(splitScoreKey(key), { game, difficulty: id });
      }
    }

    // A key written before difficulty existed. Every one of those was played on
    // what is now the default, so that is what it reads as -- dropping it would
    // throw away a record somebody earned.
    assert.deepEqual(splitScoreKey("2048"), {
      game: "2048",
      difficulty: DEFAULT_DIFFICULTY,
    });
    assert.equal(DEFAULT_DIFFICULTY, "normal");
    // And a suffix that is not a difficulty is not one: a game whose id ever
    // contains a colon must not be read as a difficulty nobody has.
    assert.deepEqual(splitScoreKey("2048:brutal"), {
      game: "2048:brutal",
      difficulty: DEFAULT_DIFFICULTY,
    });
  }

  // --- the seat counts, against the server's own catalogue --------------------

  // @shared/minigames states how many chairs each table has, and so does
  // internal/minigame/hub.go. Two statements of the same fact, and this is what
  // keeps them one fact: the browser has to draw "2/4 kişi" and decide whether
  // to offer a Başlat button before it has ever seen a table, so it cannot ask.
  //
  // Parsed out of the Go rather than duplicated here a third time. What is
  // asserted is that the two agree -- including the DEFAULT, which is where
  // this would go wrong: a row that says nothing about seats means two, and a
  // reader that forgets that reads every duel as a four-hander.
  // Both cross-repo blocks below read the Go backend, which is a SIBLING
  // CHECKOUT and not part of this repository. It is there on a developer's
  // machine and absent in this repo's CI, where the workflow clones only this
  // one -- so they are skipped rather than fatal when it is missing, and the
  // skip is announced. A silent skip would read as a passing check.
  const backendRoot = path.join(projectRoot, "..", "backend-go");
  const backendFile = (...parts) => path.join(backendRoot, ...parts);
  const backendPresent = fs.existsSync(
    backendFile("internal", "minigame", "hub.go"),
  );
  if (!backendPresent) {
    console.log(
      "check-minigames: backend-go is not checked out beside this repo — " +
        "the seat-count and score-bound cross-checks were SKIPPED",
    );
  }

  if (backendPresent) {
    const hub = fs.readFileSync(
      backendFile("internal", "minigame", "hub.go"),
      "utf8",
    );

    const catalogue = hub.slice(
      hub.indexOf("var catalog = map[string]gameSpec{"),
      hub.indexOf("\n}", hub.indexOf("var catalog = map[string]gameSpec{")),
    );
    assert.ok(catalogue.length > 0, "could not find the catalogue in hub.go");

    const serverSeats = {};
    // Each row is `"id": {…}`, possibly spread over several lines, so the body
    // is taken up to the matching brace rather than to the end of the line.
    const row = /"([a-z0-9]+)":\s*\{([^}]*)\}/g;
    let match = row.exec(catalogue);
    while (match) {
      const [, id, body] = match;
      const min = /minSeats:\s*(\d+)/.exec(body);
      const max = /maxSeats:\s*(\d+)/.exec(body);
      serverSeats[id] = {
        min: min ? Number(min[1]) : 2,
        max: max ? Number(max[1]) : 2,
      };
      match = row.exec(catalogue);
    }

    assert.deepEqual(
      [...MULTIPLAYER_GAME_IDS].sort(),
      Object.keys(serverSeats).sort(),
      "the desktop's game ids and the server's catalogue are different sets",
    );

    for (const id of MULTIPLAYER_GAME_IDS) {
      assert.deepEqual(
        MULTIPLAYER_SEATS[id],
        serverSeats[id],
        `${id}: the desktop says ${JSON.stringify(MULTIPLAYER_SEATS[id])} seats, the server says ${JSON.stringify(serverSeats[id])}`,
      );
      assert.ok(
        MULTIPLAYER_SEATS[id].min <= MULTIPLAYER_SEATS[id].max,
        `${id}: needs more players to start than it has chairs`,
      );
    }
  }

  // --- the scored games, against the server's own bounds -----------------------

  // Every solo game the desktop offers has to have a bound on the server, at
  // every difficulty. A board that ships without one does not fail anywhere
  // visible: the game plays, the run finishes, and the record submission comes
  // back 400 with "this game keeps no score" -- which the player reads as their
  // best game of the night vanishing.
  if (backendPresent) {
    const score = fs.readFileSync(
      backendFile("internal", "minigame", "score.go"),
      "utf8",
    );

    const start = score.indexOf("var scoreCatalog = map[string]scoreRules{");
    const serverKeys = new Set();
    const key = /"([a-z0-9]+):(easy|normal|hard)"/g;
    let match = key.exec(score.slice(start, score.indexOf("\n}", start)));
    while (match) {
      serverKeys.add(`${match[1]}:${match[2]}`);
      match = key.exec(score.slice(start, score.indexOf("\n}", start)));
    }

    const desktopKeys = new Set();
    for (const game of SOLO_GAME_IDS) {
      for (const id of DIFFICULTY_IDS) {
        desktopKeys.add(scoreKey(game, id));
      }
    }

    assert.deepEqual(
      [...desktopKeys].sort(),
      [...serverKeys].sort(),
      "the solo games the desktop scores and the ones the server accepts are different sets",
    );

    // And the other direction, which is the one that would be silent: a
    // multiplayer id must never acquire a score bound, because a win against
    // another person is not a personal best.
    for (const id of MULTIPLAYER_GAME_IDS) {
      for (const difficulty of DIFFICULTY_IDS) {
        assert.ok(
          !serverKeys.has(`${id}:${difficulty}`),
          `${id} is a table game and must keep no record`,
        );
      }
    }
  }

  // --- sudoku -----------------------------------------------------------------

  {
    // GENERATED FROM A SOLUTION, not solved from a puzzle. That is what makes
    // the grid guaranteed answerable, and it is asserted rather than trusted
    // because an unsolvable sudoku looks exactly like a hard one.
    for (const id of DIFFICULTY_IDS) {
      const rng = seededRng(id.length * 31 + 7);
      const { puzzle, solution, fixed } = createSudoku(RULES_SUDOKU[id].clues, rng);

      assert.equal(puzzle.length, 81, `sudoku:${id} board length`);
      assert.ok(isSudokuSolved(solution), `sudoku:${id} generated an invalid solution`);
      assert.equal(
        puzzle.filter((value) => value !== 0).length,
        RULES_SUDOKU[id].clues,
        `sudoku:${id} did not leave the number of clues it was asked for`,
      );

      // Every given has to be part of the answer, or the puzzle contradicts
      // itself and the player is asked to solve something that is not true.
      puzzle.forEach((value, index) => {
        if (value !== 0) {
          assert.equal(value, solution[index], `sudoku:${id} clue disagrees with its solution`);
          assert.ok(fixed[index], `sudoku:${id} clue is editable`);
        }
      });

      assert.ok(!isSudokuSolved(puzzle), `sudoku:${id} was dealt already solved`);
    }

    // The rule itself: a value already in the row, the column or the box is
    // refused, and the cell being tested does not count against itself.
    // A five in the top-left corner. Every index below is named by its column
    // and row so the three rules are tested one at a time rather than by
    // whichever happens to fire first.
    const grid = new Array(81).fill(0);
    grid[0] = 5;
    assert.equal(sudokuAccepts(grid, 5, 5), false, "column 5, row 0: same row must be refused");
    assert.equal(sudokuAccepts(grid, 27, 5), false, "column 0, row 3: same column must be refused");
    assert.equal(sudokuAccepts(grid, 10, 5), false, "column 1, row 1: same box must be refused");
    assert.equal(
      sudokuAccepts(grid, 40, 5),
      true,
      "column 4, row 4: a different row, column and box is fine",
    );
    assert.equal(sudokuAccepts(grid, 0, 5), true, "a cell must not clash with itself");

    // Both ends of a clash are marked. Marking one of them tells the player
    // half the truth about which number is wrong.
    grid[1] = 5;
    assert.deepEqual([...sudokuConflicts(grid)].sort(), [0, 1]);
  }

  // --- sliding puzzle ---------------------------------------------------------

  {
    // SCRAMBLED BY MOVING, not by shuffling. Half of all permutations of a
    // sliding puzzle cannot be reached from the solved board, so a shuffled
    // array is a coin flip on whether the puzzle can be finished at all -- and
    // the player finds out twenty minutes in.
    for (const id of DIFFICULTY_IDS) {
      const { size, shuffle: scrambles } = RULES_PUZZLE[id];
      const puzzle = createSlidePuzzle(size, scrambles, seededRng(size * 977));

      assert.equal(puzzle.tiles.length, size * size, `puzzle15:${id} board length`);
      assert.deepEqual(
        [...puzzle.tiles].sort((a, b) => a - b),
        Array.from({ length: size * size }, (_, index) => index),
        `puzzle15:${id} is not a permutation of its own tiles`,
      );
      assert.ok(!isSlideSolved(puzzle), `puzzle15:${id} was dealt already solved`);
    }

    // A move next to the hole swaps; a move that is not next to it returns the
    // SAME object, which is what lets the board count moves by identity.
    const three = createSlidePuzzle(3, 40, seededRng(11));
    const hole = three.tiles.indexOf(0);
    const neighbour = slideNeighbours(hole, 3)[0];
    const moved = slideTile(three, neighbour);
    assert.notEqual(moved, three, "a legal slide must produce a new board");
    assert.equal(moved.tiles[hole], three.tiles[neighbour]);
    assert.equal(moved.tiles[neighbour], 0);

    const far = three.tiles.findIndex(
      (_, index) => index !== hole && !slideNeighbours(hole, 3).includes(index),
    );
    assert.equal(
      slideTile(three, far),
      three,
      "a slide that is not next to the hole must return the same object",
    );

    // Neighbours never wrap: the hole in the left column has no neighbour to
    // its left, whatever the flat index arithmetic says.
    assert.deepEqual(slideNeighbours(3, 3).sort((a, b) => a - b), [0, 4, 6]);
  }

  // --- lights out -------------------------------------------------------------

  {
    // BUILT BY PRESSING a solved board, which is the only cheap way to hand
    // somebody a puzzle that can be finished: only about a quarter of 5x5 light
    // configurations have any solution at all.
    for (const id of DIFFICULTY_IDS) {
      const { size, presses } = RULES_LIGHTS[id];
      const board = createLights(size, presses, seededRng(size * 313));

      assert.equal(board.length, size * size, `lightsout:${id} board length`);
      assert.ok(!isLightsOut(board), `lightsout:${id} was dealt already solved`);
    }

    // A press flips the cell and its four orthogonal neighbours -- and nothing
    // diagonal, and nothing across an edge.
    const dark = new Array(9).fill(false);
    const centre = pressLight(dark, 4, 3);
    assert.deepEqual(centre, [false, true, false, true, true, true, false, true, false]);

    const corner = pressLight(dark, 0, 3);
    assert.deepEqual(corner, [true, true, false, true, false, false, false, false, false]);

    // Pressing the same cell twice is a no-op, which is the property the
    // generator relies on.
    assert.deepEqual(pressLight(centre, 4, 3), dark);
  }

  // --- tetris -----------------------------------------------------------------

  {
    assert.equal(TETROMINOES.length, 7, "there are seven tetrominoes");
    for (const piece of TETROMINOES) {
      assert.equal(piece.cells.length, 4, "a tetromino is four squares");
    }

    const { columns, rows } = RULES_TETRIS.normal;

    // ROTATION STAYS INSIDE THE BOX. The O piece is symmetric, so all four
    // turns are the same four squares -- if the box arithmetic is wrong, this
    // is where it shows up as a piece that walks sideways as it spins.
    const square = TETROMINOES.findIndex((piece) => piece.box === 2);
    const at = (rotation) =>
      pieceCells({ piece: square, rotation, x: 3, y: 3 })
        .map(({ x, y }) => `${x},${y}`)
        .sort()
        .join(" ");
    assert.equal(at(0), at(1), "the O piece must not move when it turns");
    assert.equal(at(0), at(2));
    assert.equal(at(0), at(3));

    // Collision: the walls and the floor, and NOT the ceiling. A piece spawns
    // partly above the well and is only in trouble once it cannot fall.
    const empty = new Array(columns * rows).fill(0);
    assert.equal(tetrisCollides(empty, columns, rows, { piece: 0, rotation: 0, x: 0, y: -1 }), false);
    assert.equal(tetrisCollides(empty, columns, rows, { piece: 0, rotation: 0, x: -1, y: 0 }), true);
    assert.equal(tetrisCollides(empty, columns, rows, { piece: 0, rotation: 0, x: 0, y: rows }), true);

    // A full row clears and everything above it falls by one; a row with a gap
    // in it does not.
    const well = new Array(columns * rows).fill(0);
    for (let column = 0; column < columns; column += 1) {
      well[(rows - 1) * columns + column] = 1;
    }
    well[(rows - 2) * columns] = 2;
    const cleared = clearLines(well, columns, rows);
    assert.equal(cleared.cleared, 1, "the full row clears");
    assert.equal(cleared.well[(rows - 1) * columns], 2, "what was above it fell by one");
    assert.equal(cleared.well.filter((cell) => cell !== 0).length, 1);

    // Four at once is worth far more than four singles, which is the whole
    // reason anybody stacks nine deep and waits for an I.
    assert.ok(tetrisLineScore(4, 1) > tetrisLineScore(1, 1) * 4);
    assert.equal(tetrisLineScore(0, 5), 0);
    assert.equal(tetrisLineScore(2, 3), tetrisLineScore(2, 1) * 3);
  }

  // --- flood it ---------------------------------------------------------------

  {
    for (const id of DIFFICULTY_IDS) {
      const { size, colors } = RULES_FLOOD[id];
      const board = createFlood(size, colors, seededRng(size * 71));
      assert.equal(board.length, size * size, `floodit:${id} board length`);
      assert.ok(
        board.every((cell) => cell >= 0 && cell < colors),
        `floodit:${id} produced a colour outside its palette`,
      );
    }

    // The flood takes the region CONNECTED to the corner, and nothing else --
    // an island of the same colour elsewhere on the board is not yours yet.
    //   0 0 1
    //   1 1 1
    //   0 1 1
    const board = [0, 0, 1, 1, 1, 1, 0, 1, 1];
    assert.equal(floodedCount(board, 3), 2, "the corner region is the two 0s in the top row");

    // The 0 at index 6 is the SAME COLOUR as the corner and is not connected to
    // it, so it must survive the flood. A fill that recoloured every matching
    // cell rather than every reachable one is the classic version of this bug,
    // and it makes the game trivially winnable.
    const filled = floodFill(board, 3, 1);
    assert.deepEqual(filled, [1, 1, 1, 1, 1, 1, 0, 1, 1]);
    assert.ok(!isFlooded(filled), "one stranded cell is not a finished board");
    assert.equal(floodedCount(filled, 3), 8);

    // One more move takes it: the region is now everything except that cell,
    // and painting it back reaches the cell too.
    const done = floodFill(filled, 3, 0);
    assert.deepEqual(done, new Array(9).fill(0));
    assert.ok(isFlooded(done));

    // Painting the colour you already are changes nothing, and must not be
    // charged as a move -- so it has to be recognisable as a no-op.
    assert.deepEqual(floodFill(board, 3, 0), board);
  }

  // --- nonogram ---------------------------------------------------------------

  {
    // The clues describe the picture. If runsOf and the generator ever disagree,
    // the puzzle is unsolvable and looks merely hard.
    assert.deepEqual(runsOf([true, true, false, true]), [2, 1]);
    assert.deepEqual(runsOf([false, false]), [0], "an empty line is [0], not []");
    assert.deepEqual(runsOf([true, true, true]), [3]);
    assert.deepEqual(runsOf([false, true, false, true, false]), [1, 1]);

    for (const id of DIFFICULTY_IDS) {
      const { size, density } = RULES_NONOGRAM[id];
      const puzzle = createNonogram(size, density, seededRng(size * 149));

      assert.equal(puzzle.rowClues.length, size, `nonogram:${id} row clue count`);
      assert.equal(puzzle.columnClues.length, size, `nonogram:${id} column clue count`);

      // Every clue read back off the solution has to match the clue that was
      // published with it.
      for (let row = 0; row < size; row += 1) {
        assert.deepEqual(
          runsOf(puzzle.solution.slice(row * size, row * size + size)),
          puzzle.rowClues[row],
          `nonogram:${id} row ${row} clue does not describe its own solution`,
        );
      }

      // The solution solves it, and the empty grid does not.
      const marks = puzzle.solution.map((filled) => (filled ? 1 : 0));
      assert.ok(isNonogramSolved(marks, puzzle), `nonogram:${id} rejects its own solution`);
      assert.ok(!isNonogramSolved(new Array(size * size).fill(0), puzzle));

      // CROSSES ARE NOTES. Marking a blank cell with a cross is how people
      // think, and grading it would be marking them wrong for how they thought.
      const withCrosses = marks.map((mark) => (mark === 1 ? 1 : 2));
      assert.ok(
        isNonogramSolved(withCrosses, puzzle),
        `nonogram:${id} counted the player's own crosses against them`,
      );
    }
  }

  // --- typing and arithmetic ---------------------------------------------------

  {
    const passage = buildPassage(30, seededRng(5));
    assert.equal(passage.length, 30);
    assert.ok(passage.every((word) => typeof word === "string" && word.length > 0));

    // Five characters is a word, which is what every typing test has counted
    // since the typewriter. Counting actual words would reward a passage of
    // short ones and punish a passage of long ones.
    assert.equal(wordsPerMinute(250, 60_000), 50);
    assert.equal(wordsPerMinute(0, 60_000), 0);
    assert.equal(wordsPerMinute(100, 0), 0, "a zero clock must not divide by zero");

    assert.equal(typingAccuracy("", "abc"), 100, "nothing typed is nothing wrong");
    assert.equal(typingAccuracy("abc", "abc"), 100);
    assert.equal(typingAccuracy("abd", "abc"), 67);

    // Subtraction never goes negative and division always divides exactly: a
    // sprint is a test of speed, and a remainder is a test of patience.
    const rng = seededRng(3);
    for (let index = 0; index < 400; index += 1) {
      const question = buildQuestion(25, true, rng);
      assert.ok(Number.isInteger(question.answer), `${question.text} has a fractional answer`);
      assert.ok(question.answer >= 0, `${question.text} has a negative answer`);
      assert.match(question.text, /^\d+ [-+x:] \d+$/, `${question.text} is malformed`);
    }
  }

  // --- the parameterised boards ------------------------------------------------

  {
    // 2048 at every size. The merge rule is the same; the geometry is not, and
    // lineIndices is where a hardcoded 4 would survive unnoticed on a 4x4 board
    // and scramble a 5x5 one.
    for (const id of DIFFICULTY_IDS) {
      const { size } = RULES_2048[id];
      const board = emptyBoard(size);
      assert.equal(board.length, size * size, `2048:${id} board length`);

      // A full row of 2s packs to the left edge and merges in pairs.
      const row = board.slice();
      for (let column = 0; column < size; column += 1) {
        row[column] = 2;
      }
      const left = moveBoard(row, "left", size);
      assert.equal(left.board[0], 4, `2048:${id} did not merge to the left edge`);
      assert.equal(left.gained, Math.floor(size / 2) * 4, `2048:${id} score`);

      // The same row to the RIGHT lands on the far edge. Reading the direction
      // off a hardcoded width puts it in the middle of a 5x5 board.
      const right = moveBoard(row, "right", size);
      assert.equal(
        right.board[size - 1],
        4,
        `2048:${id} did not merge against the right wall`,
      );

      // Vertical, which is the axis that breaks first when the stride is wrong.
      const column = board.slice();
      for (let y = 0; y < size; y += 1) {
        column[y * size] = 2;
      }
      const up = moveBoard(column, "up", size);
      assert.equal(up.board[0], 4, `2048:${id} did not merge upward`);
      const down = moveBoard(column, "down", size);
      assert.equal(
        down.board[(size - 1) * size],
        4,
        `2048:${id} did not merge downward`,
      );

      // A fresh board has exactly two tiles wherever it is sized.
      const dealt = createBoard(size, seededRng(7));
      assert.equal(dealt.filter((value) => value !== 0).length, 2);
      assert.equal(hasMoves(dealt, size), true);
    }
  }

  {
    // Snake on every board. The head is placed from the board rather than at a
    // fixed (8, 8) -- on the 13x13 hard board that constant is the wall.
    for (const id of DIFFICULTY_IDS) {
      const board = { columns: RULES_SNAKE[id].columns, rows: RULES_SNAKE[id].rows };
      const snake = createSnake(board, seededRng(11));

      assert.equal(snake.body.length, 3, `snake:${id} body`);
      for (const point of snake.body) {
        assert.ok(
          point.x >= 0 && point.x < board.columns && point.y >= 0 && point.y < board.rows,
          `snake:${id} starts outside its own board at ${point.x},${point.y}`,
        );
      }
      assert.ok(
        snake.food.x >= 0 && snake.food.x < board.columns,
        `snake:${id} food outside the board`,
      );

      // It survives its first tick, which the fixed start position did not on
      // the small board.
      assert.equal(stepSnake(snake, board, seededRng(11)).alive, true, `snake:${id}`);

      // And the wall is the board's own wall, not 17.
      const atEdge = {
        ...snake,
        body: [{ x: board.columns - 1, y: 0 }, { x: board.columns - 2, y: 0 }],
        direction: { x: 1, y: 0 },
      };
      assert.equal(
        stepSnake(atEdge, board, seededRng(11)).alive,
        false,
        `snake:${id} walked through its right wall`,
      );
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });

  checkPageLayout();

  console.log("check-minigames: ok");
};

/**
 * Three CSS declarations that are load-bearing and do not look it.
 *
 * Layout usually fails loudly enough to see, but these three fail in ways that
 * read as deliberate: a board drawn at a third of its size looks like a small
 * board, and a control at the wrong end of a header looks like a choice. All
 * three were wrong on this page at once, so each is pinned with its reason
 * rather than with its value.
 */
const checkPageLayout = () => {
  const css = fs.readFileSync(
    path.join(projectRoot, "src/renderer/src/styles/modules/features/minigames.css"),
    "utf8",
  );

  // The declarations of one rule, found by scanning from the selector to the
  // next brace. No regex: the selectors here contain dots and the bodies
  // contain braces-free @apply lines, so a scan is both shorter and exact.
  const ruleOf = (selector) => {
    const start = css.indexOf("\n" + selector + " {");
    assert.notEqual(start, -1, selector + " is gone from minigames.css");
    const open = css.indexOf("{", start);
    const close = css.indexOf("}", open);
    return css.slice(open + 1, close);
  };

  // A grid track sizes an `auto` column by ASKING the item how wide it wants
  // to be, and a percentage has no answer at that point -- it resolves to
  // zero. So `width: min(100%, X)` measures as 0, the track falls back to the
  // HUD's min-content, and a 680px board is drawn 248px wide. The percentage
  // belongs in max-width and the real number in width.
  const stage = ruleOf(".ct-arcade-stage");
  assert.match(
    stage,
    /width:\s*calc\(/,
    ".ct-arcade-stage needs a definite width, or the auto grid track measures it as zero and the board collapses",
  );
  assert.ok(
    !/width:\s*min\(\s*100%/.test(stage),
    ".ct-arcade-stage must not put a percentage inside width's min(): it measures as 0 during intrinsic sizing",
  );

  // 1fr on the game column hands it every pixel the leaderboard does not
  // want, which puts the empty space BETWEEN the board and the table that
  // ranks it rather than around the pair.
  assert.ok(
    !/grid-template-columns:[^;]*1fr/.test(ruleOf(".ct-minigames-panel")),
    ".ct-minigames-panel must not size the game column at 1fr: it reopens the gutter between the board and the leaderboard",
  );

  // The header's right-hand cluster is pushed by the text block, which is
  // always rendered. Hanging it on the record badge instead means no push at
  // all until somebody sets a record -- which is exactly when a new player is
  // looking at the page.
  assert.match(
    ruleOf(".ct-minigames-header-text"),
    /flex-1/,
    ".ct-minigames-header-text must grow, or the difficulty picker sits against the title whenever there is no record yet",
  );
  assert.ok(
    !/ml-auto/.test(ruleOf(".ct-minigames-best")),
    ".ct-minigames-best is conditional, so it cannot be what pushes the header's right-hand cluster",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
