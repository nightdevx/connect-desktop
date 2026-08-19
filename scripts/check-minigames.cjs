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
    hasMoves,
    buildMinefield,
    revealCell,
    isMinefieldWon,
    createSnake,
    stepSnake,
    turnSnake,
    shuffle,
    SNAKE_COLUMNS,
    SNAKE_ROWS,
  } = await bundle(
    "src/renderer/src/features/minigames/minigames-logic.ts",
    "minigames-logic.mjs",
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
    const start = createSnake(seededRng(3));
    assert.equal(start.body.length, 3);
    assert.equal(start.alive, true);
    // Food never spawns under the snake.
    assert.equal(
      start.body.some((p) => p.x === start.food.x && p.y === start.food.y),
      false,
    );

    // A plain step moves the head and keeps the length.
    const moved = stepSnake(start, seededRng(3));
    assert.equal(moved.body.length, 3);
    assert.equal(moved.body[0].x, start.body[0].x + 1);

    // Reversing into your own neck is refused. The snake is heading right, so
    // "left" must be ignored -- accepting it is instant death by fat finger.
    assert.deepEqual(turnSnake(start, { x: -1, y: 0 }).direction, { x: 1, y: 0 });
    assert.deepEqual(turnSnake(start, { x: 0, y: -1 }).direction, { x: 0, y: -1 });

    // Two turns between two ticks must not COMPOSE into a reversal. Right, then
    // up, then left, all before the tick: the third is checked against the
    // direction the snake has actually MOVED -- still right -- so it is
    // refused. Checked against the pending "up" instead, it would be allowed,
    // and the next tick would drive the head straight into the neck.
    const turnedUp = turnSnake(start, { x: 0, y: -1 });
    assert.deepEqual(
      turnSnake(turnedUp, { x: -1, y: 0 }).direction,
      { x: 0, y: -1 },
      "two turns in one tick composed into a reversal",
    );

    // One turn per tick, not a permanent ban: once the snake has actually moved
    // up, turning left is legal again.
    const afterUp = stepSnake(turnedUp, seededRng(3));
    assert.deepEqual(turnSnake(afterUp, { x: -1, y: 0 }).direction, { x: -1, y: 0 });
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
    assert.equal(stepSnake(state, seededRng(5)).alive, true, "died chasing its own tail");
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
    assert.equal(stepSnake(atEdge, seededRng(5)).alive, false);
    // And a dead snake stays dead rather than walking off the board.
    assert.deepEqual(stepSnake(stepSnake(atEdge, seededRng(5)), seededRng(5)).alive, false);
  }

  // Eating grows the body by one and moves the food somewhere legal.
  {
    const about = createSnake(seededRng(9));
    const head = about.body[0];
    const eating = {
      ...about,
      food: { x: head.x + 1, y: head.y },
    };
    const after = stepSnake(eating, seededRng(9));
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

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("check-minigames: ok");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
