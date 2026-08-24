#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

async function main() {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-uno-table-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/minigames/uno-3d/layout.ts",
        ),
        formats: ["es"],
        fileName: () => "layout.mjs",
      },
    },
  });

  const bundle = path.join(outDir, "layout.mjs");
  const layout = await import(pathToFileURL(bundle).href);

  const {
    CARD_HEIGHT,
    CARD_STACK_STEP,
    CARD_THICKNESS,
    CARD_WIDTH,
    DISCARD_DEPTH,
    DISCARD_PILE,
    DRAW_PILE,
    DRAW_STACK_MAX,
    FRAME_CENTER,
    FRAME_HALF_DEPTH,
    FRAME_HALF_WIDTH,
    OPPONENT_RADIUS,
    TABLE_RADIUS,
    cardLie,
    discardPlacement,
    drawPlacement,
    handPlacement,
    handReach,
    lowestCorner,
    opponentPlacement,
    opponentReach,
    seatAngle,
    seatPosition,
    seatYaw,
  } = layout;

  const reaches = [1, 2, 5, 8, 12, 20, 30, 50].map((count) => handReach(count));
  for (let index = 1; index < reaches.length; index += 1) {
    assert.ok(
      reaches[index] >= reaches[index - 1] - 1e-9,
      "a bigger hand may not be narrower than a smaller one",
    );
  }
  assert.ok(
    reaches[reaches.length - 1] <= TABLE_RADIUS,
    `a fifty-card hand reaches ${reaches[reaches.length - 1].toFixed(2)}, past the felt at ${TABLE_RADIUS}`,
  );
  assert.equal(handPlacement(0, 1).x, 0, "a single card sits dead centre");

  for (const count of [2, 7, 16]) {
    const first = handPlacement(0, count);
    const last = handPlacement(count - 1, count);
    assert.ok(Math.abs(first.x + last.x) < 1e-9, "the fan is symmetric in x");
    assert.ok(Math.abs(first.roll + last.roll) < 1e-9, "the fan is symmetric in roll");
  }

  for (const [place, counts, what] of [
    [handPlacement, [1, 2, 5, 8, 12, 20, 30, 50], "a hand card"],
    [opponentPlacement, [1, 2, 5, 8, 12], "an opponent's card"],
  ]) {
    for (const count of counts) {
      for (let index = 0; index < count; index += 1) {
        const card = place(index, count);
        const bottom = card.y - lowestCorner(card.tilt, card.roll, card.scale);
        assert.ok(
          bottom > 0,
          `${what} (${index + 1} of ${count}) has a corner ${(-bottom).toFixed(3)} below ` +
            "the felt -- the outer cards of a fan roll far enough to cut through the table",
        );
      }
    }
  }

  const faceNormal = (tilt) => ({ y: -Math.sin(tilt), z: Math.cos(tilt) });
  const clearance = (a, b) => {
    const normal = faceNormal(a.tilt);
    return Math.abs((b.y - a.y) * normal.y + (b.z - a.z) * normal.z);
  };

  assert.ok(
    CARD_STACK_STEP > CARD_THICKNESS,
    "a fan steps further than a card is thick, or neighbours share the same slab of space",
  );

  for (const [place, count, what] of [
    [handPlacement, 20, "the hand"],
    [opponentPlacement, 12, "an opponent's fan"],
  ]) {
    for (let index = 1; index < count; index += 1) {
      const behind = place(index - 1, count);
      const front = place(index, count);
      const thickness = CARD_THICKNESS * front.scale;
      assert.ok(
        clearance(behind, front) >= thickness,
        `two cards in ${what} sit ${clearance(behind, front).toFixed(4)} apart, ` +
          `closer than the ${thickness.toFixed(4)} they are thick -- they intersect on screen`,
      );
    }
  }

  const corner = Math.hypot(CARD_WIDTH, CARD_HEIGHT) / 2;

  const onFelt = (placement, what) => {
    const distance = Math.hypot(placement.x, placement.z) + corner * (placement.scale ?? 1);
    assert.ok(
      distance <= TABLE_RADIUS,
      `${what} reaches ${distance.toFixed(2)} from the middle, past the felt at ${TABLE_RADIUS}`,
    );
  };

  const inFrame = (x, y, z, reach, what) => {
    assert.ok(
      Math.abs(x - FRAME_CENTER.x) + reach <= FRAME_HALF_WIDTH,
      `${what} sits ${(Math.abs(x - FRAME_CENTER.x) + reach).toFixed(2)} across, outside the framed ${FRAME_HALF_WIDTH}`,
    );
    assert.ok(
      Math.abs(z - FRAME_CENTER.z) + reach <= FRAME_HALF_DEPTH,
      `${what} sits ${(Math.abs(z - FRAME_CENTER.z) + reach).toFixed(2)} deep, outside the framed ${FRAME_HALF_DEPTH}`,
    );
  };

  for (let index = 0; index < DRAW_STACK_MAX; index += 1) {
    onFelt(drawPlacement(index), `draw pile card ${index}`);
  }
  for (let depth = 0; depth < DISCARD_DEPTH; depth += 1) {
    for (const lie of [-6, 0, 6]) {
      onFelt(discardPlacement(depth, lie), `discard at depth ${depth}`);
    }
  }

  for (const count of [1, 7, 20, 50]) {
    for (let index = 0; index < count; index += 1) {
      const placement = handPlacement(index, count);
      inFrame(
        placement.x,
        placement.y,
        placement.z,
        corner,
        `hand card ${index + 1} of ${count}`,
      );
    }
  }

  for (const total of [2, 3, 4]) {
    for (let offset = 1; offset < total; offset += 1) {
      const spot = seatPosition(seatAngle(offset, total));
      inFrame(spot.x, 0.06, spot.z, opponentReach(12), `seat ${offset} of ${total}`);
    }
  }

  assert.ok(
    OPPONENT_RADIUS + opponentReach(12) > TABLE_RADIUS - 1.2,
    "the opponents sit out at the rail, not huddled around the piles",
  );

  assert.ok(
    Math.abs(DRAW_PILE.x - DISCARD_PILE.x) > CARD_WIDTH,
    "the deck and the discard pile must not overlap",
  );

  assert.ok(drawPlacement(0).y > 0, "the bottom of the deck rests above the felt");
  for (let index = 1; index < DRAW_STACK_MAX; index += 1) {
    assert.ok(
      drawPlacement(index).y > drawPlacement(index - 1).y,
      "the deck stacks upwards",
    );
  }
  for (let depth = 1; depth < DISCARD_DEPTH; depth += 1) {
    assert.ok(
      discardPlacement(depth, 0).y < discardPlacement(depth - 1, 0).y,
      "a buried discard sits under the one thrown after it",
    );
  }

  const chairs = (total) =>
    Array.from({ length: total - 1 }, (_, index) => seatPosition(seatAngle(index + 1, total)));

  for (const total of [2, 3, 4]) {
    const mine = seatPosition(seatAngle(0, total));
    assert.ok(mine.z > 0 && Math.abs(mine.x) < 1e-9, "the viewer sits at the bottom");
    assert.ok(
      Math.abs(seatYaw(seatAngle(0, total))) < 1e-9,
      "the viewer's fan needs no yaw",
    );

    const seen = [mine];
    for (const spot of chairs(total)) {
      assert.ok(spot.z < 0, "nobody sits in front of the viewer, between them and their own hand");
      for (const other of seen) {
        assert.ok(
          Math.hypot(spot.x - other.x, spot.z - other.z) > CARD_WIDTH,
          `two of ${total} seats land on the same chair`,
        );
      }
      seen.push(spot);
    }
  }

  const lone = chairs(2);
  assert.ok(Math.abs(lone[0].x) < 0.6, "a single opponent sits directly across the table");

  const pair = chairs(3);
  assert.ok(pair[0].x < -1.5, "with two opponents the first sits on the left");
  assert.ok(pair[1].x > 1.5, "with two opponents the second sits on the right");

  const trio = chairs(4);
  assert.ok(trio[0].x < -1.5, "with three opponents the first sits on the left");
  assert.ok(Math.abs(trio[1].x) < 0.6, "with three opponents the second sits across");
  assert.ok(trio[2].x > 1.5, "with three opponents the third sits on the right");

  for (const count of [1, 5, 12]) {
    for (let index = 0; index < count; index += 1) {
      const placement = opponentPlacement(index, count);
      assert.ok(
        Math.hypot(placement.x, placement.z) < 1.4,
        "an opponent's fan stays over its own seat",
      );
      assert.ok(placement.scale < 1, "an opponent's cards are drawn smaller than your own");
    }
  }

  const kinds = ["0", "5", "9", "skip", "reverse", "draw2", "wild", "wild4"];
  for (const color of ["r", "y", "g", "b", "w"]) {
    for (const kind of kinds) {
      const lie = cardLie(color, kind);
      assert.ok(Number.isInteger(lie), "a lie is a whole number of degrees");
      assert.ok(lie >= -6 && lie <= 6, `${color}${kind} lies at ${lie} degrees`);
      assert.equal(lie, cardLie(color, kind), "the same card always lies the same way");
    }
  }

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    resolve: {
      alias: {
        "@shared": path.join(projectRoot, "src/shared"),
        "@": path.join(projectRoot, "src/renderer/src"),
      },
    },
    build: {
      outDir,
      emptyOutDir: false,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/minigames/uno-3d/card-texture.tsx",
        ),
        formats: ["es"],
        fileName: () => "card-texture.mjs",
      },
      rollupOptions: { external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server", "three"] },
    },
  });

  const { unoCardMarkup, UNO_FALLBACK_PALETTE } = await import(
    pathToFileURL(path.join(outDir, "card-texture.mjs")).href
  );

  const sharp = require("sharp");

  const deck = [];
  for (const color of ["r", "y", "g", "b"]) {
    for (const kind of ["0", "1", "5", "9", "skip", "reverse", "draw2"]) {
      deck.push({ color, kind });
    }
  }
  deck.push({ color: "w", kind: "wild" });
  deck.push({ color: "w", kind: "wild4" });

  const bodyOf = {
    r: UNO_FALLBACK_PALETTE.r,
    y: UNO_FALLBACK_PALETTE.y,
    g: UNO_FALLBACK_PALETTE.g,
    b: UNO_FALLBACK_PALETTE.b,
    w: UNO_FALLBACK_PALETTE.w,
  };

  for (const card of deck.concat([{ card: null }]).filter(Boolean)) {
    const facedown = card.kind === undefined;
    const subject = facedown ? { color: "w", kind: "wild" } : card;
    const markup = unoCardMarkup(subject, facedown, UNO_FALLBACK_PALETTE);
    const what = facedown ? "the card back" : `${subject.color}${subject.kind}`;

    assert.ok(markup.startsWith("<svg "), `${what} must be a standalone svg document`);
    assert.ok(markup.endsWith("</svg>"), `${what} must close its svg element`);

    const style = markup.slice(markup.indexOf("<style>"), markup.indexOf("</style>"));
    const body = markup.slice(markup.indexOf("</style>"));

    assert.ok(
      style.includes(`.ct-uno-body{fill:${facedown ? bodyOf.w : bodyOf[subject.color]}}`),
      `${what} must paint its body in the colour it is`,
    );

    if (!facedown) {
      const printed = /^\d$/.test(subject.kind);
      const marks = [...body.matchAll(/class="ct-uno-corner"[^>]*>([^<]+)</g)].map(
        (match) => match[1],
      );
      assert.equal(marks.length, 2, `${what} carries a corner mark at each end`);

      for (const corner of body.matchAll(/<text class="ct-uno-corner"([^>]*)>/g)) {
        const attributes = corner[1];
        assert.ok(
          /text-anchor="start"/.test(attributes),
          `${what} must grow its corner marks INWARD -- a centred "+2" is twice as ` +
            "wide as a digit and prints off the edge of the card",
        );
        const at = Number(/ x="([\d.]+)"/.exec(attributes)?.[1] ?? NaN);
        assert.ok(
          at >= 12 && at <= 88,
          `${what} anchors a corner mark at x=${at}, outside the printed body`,
        );
      }
      if (printed) {
        assert.deepEqual(
          marks,
          [subject.kind, subject.kind],
          `${what} prints its own number in the corners -- a star there means the ` +
            "digit test stopped recognising digits",
        );
        assert.ok(
          new RegExp(`class="ct-uno-numeral"[^>]*>\\s*${subject.kind}\\s*<`).test(body),
          `${what} prints its number across the oval`,
        );
      } else {
        assert.ok(
          !body.includes('class="ct-uno-numeral"'),
          `${what} is an action card and must draw a glyph, not a numeral`,
        );
        assert.ok(
          /class="ct-uno-(glyph|cards|wedges)"/.test(body),
          `${what} must draw its action glyph`,
        );
      }
    }
    for (const match of body.matchAll(/class="([^"]+)"/g)) {
      for (const name of match[1].split(/\s+/).filter(Boolean)) {
        assert.ok(
          style.includes(`.${name}`),
          `${what} draws .${name}, which the texture's own style block never paints ` +
            "-- a class added in card-art.tsx has to be added to faceStyles too",
        );
      }
    }

    await sharp(Buffer.from(markup)).png().toBuffer();
  }

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    resolve: {
      alias: {
        "@shared": path.join(projectRoot, "src/shared"),
        "@": path.join(projectRoot, "src/renderer/src"),
      },
    },
    build: {
      outDir,
      emptyOutDir: false,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/renderer/src/features/minigames/uno-3d/scene.ts"),
        formats: ["es"],
        fileName: () => "scene.mjs",
      },
      rollupOptions: {
        external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server", "three"],
      },
    },
  });

  const { createCardGeometry } = await import(
    pathToFileURL(path.join(outDir, "scene.mjs")).href
  );

  const geometry = createCardGeometry();
  assert.equal(
    geometry.groups.length,
    3,
    "a card is one rim and two faces -- three groups, or a material lands on the wrong side",
  );
  assert.deepEqual(
    geometry.groups.map((group) => group.materialIndex).sort(),
    [0, 1, 2],
    "the rim, the front and the back each take exactly one material slot",
  );

  const cardPosition = geometry.getAttribute("position");
  for (const group of geometry.groups) {
    if (group.materialIndex === 0) {
      continue;
    }
    const wanted = group.materialIndex === 1 ? 1 : -1;
    for (let index = group.start; index < group.start + group.count; index += 1) {
      assert.ok(
        Math.sign(cardPosition.getZ(index)) === wanted,
        "a face group must be one whole side of the card -- the two lids are not " +
          "contiguous in this build of three, so the split has to be found rather than assumed",
      );
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    `uno table self-check passed (fan, felt, seats, piles, lie, geometry, ${deck.length + 1} card faces)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
