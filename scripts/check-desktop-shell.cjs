#!/usr/bin/env node
// Self-check for the main process's window and file plumbing:
//   - src/main/utils/atomic-write.ts: a write that dies halfway leaves the old
//     file whole (session.json, app-preferences.json).
//   - src/main/window-state.ts: a saved window position is used only while it
//     is on an attached screen; a page that keeps crashing stops reloading.
//
// Each module is bundled on its own with Vite, as check-access-token.cjs does,
// and output goes under node_modules/.cache so bare specifiers resolve.
//
//   node scripts/check-desktop-shell.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const bundle = async (outDir, entry, fileName, { alias = {}, external = [] } = {}) => {
  const { build } = await import("vite");
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    publicDir: false,
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir: false,
      ssr: true,
      rollupOptions: { external },
      lib: { entry: path.join(projectRoot, entry), formats: ["es"], fileName: () => fileName },
    },
  });
  return import(pathToFileURL(path.join(outDir, fileName)).href);
};

const main = async () => {
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-desktop-shell-"));

  try {
    // --- atomic write ------------------------------------------------------
    {
      const { writeFileAtomic } = await bundle(outDir, "src/main/utils/atomic-write.ts", "atomic-write.mjs", {
        external: ["node:fs"],
      });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-atomic-"));
      const target = path.join(dir, "session.json");
      const leftovers = () => fs.readdirSync(dir).filter((name) => name !== "session.json");

      writeFileAtomic(target, '{"v":1}');
      assert.equal(fs.readFileSync(target, "utf8"), '{"v":1}');
      writeFileAtomic(target, '{"v":2}');
      assert.equal(fs.readFileSync(target, "utf8"), '{"v":2}', "a second write replaces the first");
      assert.deepEqual(leftovers(), [], "no temp file is left after a good write");

      // The write dies after half the bytes reached the disk: what a power cut or
      // a full disk does to writeFileSync on the real path.
      const realWrite = fs.writeFileSync;
      fs.writeFileSync = (file, data, options) => {
        realWrite(file, String(data).slice(0, 4), options);
        throw new Error("ENOSPC: no space left on device");
      };
      try {
        assert.throws(() => writeFileAtomic(target, '{"v":3,"long":"payload"}'), /ENOSPC/);
      } finally {
        fs.writeFileSync = realWrite;
      }
      assert.equal(fs.readFileSync(target, "utf8"), '{"v":2}', "an interrupted write leaves the old file whole");
      assert.deepEqual(leftovers(), [], "an interrupted write cleans its temp file up");

      fs.rmSync(dir, { recursive: true, force: true });
    }

    // --- window placement --------------------------------------------------
    const { restoreWindowState, createCrashLoopGuard } = await bundle(
      outDir,
      "src/main/window-state.ts",
      "window-state.mjs",
    );
    {
      const min = { width: 720, height: 480 };
      const primary = { x: 0, y: 0, width: 1920, height: 1040 };
      const secondary = { x: 1920, y: 0, width: 2560, height: 1400 };
      const saved = (bounds, isMaximized = false) => ({ bounds, isMaximized });

      assert.deepEqual(
        restoreWindowState(saved({ x: 100, y: 80, width: 1280, height: 800 }), [primary], min),
        saved({ x: 100, y: 80, width: 1280, height: 800 }),
        "a window on an attached screen reopens where it was",
      );
      assert.deepEqual(
        restoreWindowState(saved({ x: 2200, y: 100, width: 1600, height: 900 }, true), [primary, secondary], min),
        saved({ x: 2200, y: 100, width: 1600, height: 900 }, true),
        "a maximized window on the second screen stays there, maximized",
      );
      assert.equal(
        restoreWindowState(saved({ x: 2200, y: 100, width: 1600, height: 900 }, true), [primary], min),
        null,
        "a window saved on a screen that has been unplugged falls back to the default",
      );
      assert.equal(
        restoreWindowState(saved({ x: 1840, y: 100, width: 1280, height: 800 }), [primary], min),
        null,
        "80 px of title bar on screen is too little to grab",
      );
      assert.equal(
        restoreWindowState(saved({ x: 200, y: -40, width: 1280, height: 800 }), [primary], min),
        null,
        "a title bar pushed above the top of the screen cannot be grabbed",
      );
      assert.deepEqual(
        restoreWindowState(saved({ x: 0, y: 0, width: 2560, height: 1440 }), [primary], min),
        saved({ x: 0, y: 0, width: 1920, height: 1040 }),
        "a window larger than the screen it lands on is shrunk to fit",
      );
      assert.deepEqual(
        restoreWindowState(saved({ x: 10, y: 10, width: 300, height: 200 }), [primary], min),
        saved({ x: 10, y: 10, width: 720, height: 480 }),
        "never below the minimum size",
      );
      for (const garbage of [
        null,
        "1280x800",
        {},
        { bounds: null },
        saved({ x: "0", y: 0, width: 800, height: 600 }),
        saved({ x: 0, y: 0, width: Number.NaN, height: 600 }),
        saved({ x: 0, y: 0, width: -800, height: 600 }),
      ]) {
        assert.equal(restoreWindowState(garbage, [primary], min), null, `garbage ${JSON.stringify(garbage)}`);
      }
      assert.equal(
        restoreWindowState({ bounds: { x: 0, y: 0, width: 800, height: 600 }, isMaximized: "yes" }, [primary], min)
          .isMaximized,
        false,
        "only a real true maximizes",
      );
      assert.equal(restoreWindowState(saved({ x: 0, y: 0, width: 800, height: 600 }), [], min), null, "no screens, no restore");
    }

    // --- crash loop guard --------------------------------------------------
    {
      const allowReload = createCrashLoopGuard(3, 60_000);
      assert.equal(allowReload(0), true, "the first crash reloads");
      assert.equal(allowReload(10_000), true, "the second crash reloads");
      assert.equal(allowReload(20_000), false, "the third crash within a minute stops the loop");
      assert.equal(allowReload(25_000), false, "and it stays stopped while the crashes keep coming");

      const spaced = createCrashLoopGuard(3, 60_000);
      assert.equal(spaced(0), true);
      assert.equal(spaced(50_000), true);
      assert.equal(spaced(120_000), true, "crashes older than the window no longer count");
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log("desktop-shell self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
