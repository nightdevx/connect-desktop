#!/usr/bin/env node
// Self-check for the crop dialog's geometry.
//
// This arithmetic shipped wrong twice, both times only once the picture was
// ZOOMED — at zoom 1 the picture is exactly frame-sized, so a bug in how the
// overhang is measured produces the right answer by accident. Every case below
// therefore checks a zoomed state as well as the resting one.
//
// The invariant that matters: the rectangle handed to the encoder must describe
// exactly the part of the source the person could see inside the frame. Layout
// and arithmetic both come out of computeCropGeometry, so if this passes they
// cannot disagree.
//
//   node scripts/check-image-crop.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const near = (actual, expected, label, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: got ${actual}, want ${expected}`,
  );
};

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-image-crop-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/workspace/components/settings/crop-geometry.ts",
        ),
        formats: ["es"],
        fileName: () => "crop-geometry.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "crop-geometry.mjs");
  const { computeCropGeometry, cropRectFromGeometry } = await import(
    pathToFileURL(bundle).href
  );

  const frame = { width: 440, height: 247.5 }; // 16:9
  const rectFor = (natural, zoom, offset) =>
    cropRectFromGeometry(
      natural,
      frame,
      computeCropGeometry(natural, frame, zoom, offset),
    );

  // --- a picture already the frame's shape ----------------------------------
  // Cover scale makes it fit exactly, so the whole thing is kept and there is
  // nowhere to pan to.
  {
    const natural = { width: 1600, height: 900 };
    const rect = rectFor(natural, 1, { x: 0, y: 0 });
    near(rect.x, 0, "16:9 x");
    near(rect.y, 0, "16:9 y");
    near(rect.width, 1, "16:9 width");
    near(rect.height, 1, "16:9 height");

    const geometry = computeCropGeometry(natural, frame, 1, { x: 0, y: 0 });
    near(geometry.maxOffsetX, 0, "16:9 pan x");
    near(geometry.maxOffsetY, 0, "16:9 pan y");
  }

  // --- a square, centred ----------------------------------------------------
  // Cover means the WIDTH fills the frame, so the crop is the middle band and
  // the full width is kept.
  {
    const rect = rectFor({ width: 1000, height: 1000 }, 1, { x: 0, y: 0 });
    near(rect.x, 0, "square x");
    near(rect.width, 1, "square width");
    near(rect.height, 9 / 16, "square height");
    near(rect.y, (1 - 9 / 16) / 2, "square y");
  }

  // --- zoomed in ------------------------------------------------------------
  // Twice the scale keeps half as much of the source in each axis. This is the
  // case both broken versions got wrong.
  {
    const natural = { width: 1000, height: 1000 };
    const rect = rectFor(natural, 2, { x: 0, y: 0 });
    near(rect.width, 0.5, "zoom 2 width");
    near(rect.height, 9 / 32, "zoom 2 height");
    // Still centred, because nothing was dragged.
    near(rect.x, 0.25, "zoom 2 x");
    near(rect.y, (1 - 9 / 32) / 2, "zoom 2 y");
  }

  // --- zoomed and panned to a corner ---------------------------------------
  // Dragging to the clamp puts the frame flush against the source's edge, so
  // the origin is exactly 0 — not "near 0", which is what an off-by-a-half-frame
  // error looks like.
  {
    const natural = { width: 1000, height: 1000 };
    const geometry = computeCropGeometry(natural, frame, 2, {
      x: 1e6,
      y: 1e6,
    });
    const rect = cropRectFromGeometry(natural, frame, geometry);
    near(rect.x, 0, "panned to left edge");
    near(rect.y, 0, "panned to top edge");

    const opposite = cropRectFromGeometry(
      natural,
      frame,
      computeCropGeometry(natural, frame, 2, { x: -1e6, y: -1e6 }),
    );
    near(opposite.x + opposite.width, 1, "panned to right edge");
    near(opposite.y + opposite.height, 1, "panned to bottom edge");
  }

  // --- the kept region always has the frame's shape -------------------------
  // Whatever the source and wherever it is dragged, the rectangle's aspect in
  // SOURCE pixels has to equal the frame's, or the encoder squashes it.
  for (const natural of [
    { width: 4000, height: 3000 },
    { width: 900, height: 1600 },
    { width: 1000, height: 1000 },
    { width: 3840, height: 1080 },
  ]) {
    for (const zoom of [1, 1.37, 2, 4]) {
      const rect = rectFor(natural, zoom, { x: 37, y: -19 });
      const sourceAspect =
        (rect.width * natural.width) / (rect.height * natural.height);
      near(
        sourceAspect,
        frame.width / frame.height,
        `aspect for ${natural.width}x${natural.height} @ ${zoom}`,
        1e-6,
      );

      // And it must stay inside the source, or drawImage samples nothing.
      assert.ok(rect.x >= 0 && rect.y >= 0, "origin inside the source");
      assert.ok(
        rect.x + rect.width <= 1 + 1e-9 && rect.y + rect.height <= 1 + 1e-9,
        "far corner inside the source",
      );
    }
  }

  // --- a frame that is not the assumed width --------------------------------
  // The whole reason the frame is measured rather than hard-coded: a narrower
  // dialog must still crop the region the person actually saw.
  {
    const natural = { width: 1000, height: 1000 };
    const narrow = { width: 320, height: 180 };
    const rect = cropRectFromGeometry(
      natural,
      narrow,
      computeCropGeometry(natural, narrow, 2, { x: 0, y: 0 }),
    );
    near(rect.width, 0.5, "narrow frame width");
    near(rect.height, (0.5 * 180) / 320, "narrow frame height");
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("image-crop self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
