#!/usr/bin/env node
// Self-check for the stage fit in
// src/renderer/src/features/workspace/components/lobby/lobby-stage-layout.ts.
//
// The fit fills a row exactly, so it is only as good as the size it was fitted
// to. A shrink the resize threshold swallowed left three tiles fitted to a
// 1089px stage that was really 1086px: two no longer fit in a row, they wrapped
// into one column, and the column overflowed under the room header. The
// sequence below is the one the ResizeObserver reported in that room while the
// grid's column transition ran.
//
//   node scripts/check-stage-resize.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-stage-resize-"));

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
          "src/renderer/src/features/workspace/components/lobby/lobby-stage-layout.ts",
        ),
        formats: ["es"],
        fileName: () => "lobby-stage-layout.mjs",
      },
    },
  });

  const { nextStageSize, resolveGridFit } = await import(
    pathToFileURL(path.join(outDir, "lobby-stage-layout.mjs")).href
  );

  const HEIGHT = 846;
  const GAP = 12;

  // --- a transition that ends in small steps lands on the final size --------
  let size = nextStageSize({ width: 0, height: 0 }, { width: 1160, height: HEIGHT }, true);
  for (const width of [1125, 1106, 1097, 1092, 1089, 1087, 1086]) {
    size = nextStageSize(size, { width, height: HEIGHT }, false);
  }
  assert.equal(size.width, 1086, "every shrink is applied, however small");

  // --- the fit for that room keeps two tiles on a row -------------------------
  const fit = resolveGridFit(3, size, true, GAP);
  assert.equal(fit.columns, 2);
  assert.ok(
    fit.columns * fit.tileWidth + (fit.columns - 1) * GAP <= size.width,
    `a row of ${fit.columns} x ${fit.tileWidth}px must fit in ${size.width}px`,
  );
  const rows = Math.ceil(3 / fit.columns);
  assert.ok(
    rows * (fit.tileWidth / (16 / 9)) + (rows - 1) * GAP <= size.height,
    "the rows must fit the height",
  );

  // --- growth still waits for the threshold ------------------------------------
  assert.equal(
    nextStageSize(size, { width: 1090, height: HEIGHT }, false),
    size,
    "a few pixels of growth does not reflow the tiles",
  );
  assert.equal(nextStageSize(size, { width: 1100, height: HEIGHT }, false).width, 1100);

  // --- a shrink in either axis counts ------------------------------------------
  assert.equal(nextStageSize(size, { width: 1088, height: HEIGHT - 2 }, false).height, HEIGHT - 2);

  // --- an identical size is the same object (no re-render) ----------------------
  assert.equal(nextStageSize(size, { width: 1086, height: HEIGHT }, false), size);

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("stage-resize self-check passed (shrinks always land, growth waits, fit holds)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
