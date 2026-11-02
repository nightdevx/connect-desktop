#!/usr/bin/env node
// Self-check for the main process's window and file plumbing:
//   - src/main/utils/atomic-write.ts: a write that dies halfway leaves the old
//     file whole (session.json, app-preferences.json).
//   - src/main/window-state.ts: a saved window position is used only while it
//     is on an attached screen; a page that keeps crashing stops reloading; a
//     page counts as frozen only while the user is trying to use it.
//   - src/main/taskbar-pins.ts: a taskbar pin of this exe under the old
//     AppUserModelID is re-stamped, nothing else is touched.
//   - src/main/ipc/handle.ts: an IPC call or a stream-port request from any
//     frame but the app's own page is refused.
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
    const { restoreWindowState, createCrashLoopGuard, createFreezeWatch } = await bundle(
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

    // --- freeze watch ------------------------------------------------------
    {
      // One second per step: the preload beats (unless the scenario stops a
      // beat), main looks, and the events are collected with their second.
      const run = (seconds, { timer = () => true, frame = () => true, input = () => false, canDraw = () => true } = {}) => {
        const watch = createFreezeWatch();
        const events = [];
        watch.check(0, true);
        for (let s = 1; s <= seconds; s += 1) {
          const now = s * 1000;
          if (timer(s)) watch.beat("timer", now - 500);
          if (frame(s)) watch.beat("frame", now - 480);
          if (input(s)) watch.input(now - 200);
          const event = watch.check(now, canDraw(s));
          if (event) events.push({ s, ...event });
        }
        return events;
      };
      const clicksFrom = (first) => (s) => s >= first;

      assert.deepEqual(run(60, { input: () => true }), [], "a healthy page that is being used never freezes");

      assert.deepEqual(
        run(33, { timer: (s) => s < 10, frame: (s) => s < 10, input: clicksFrom(11) }),
        [
          { s: 14, type: "froze", stall: "busy" },
          { s: 29, type: "reload", stall: "busy", ms: 20_500 },
        ],
        "a page that runs nothing while clicked is reported, then reloaded",
      );

      assert.deepEqual(
        run(33, { frame: (s) => s < 10, input: clicksFrom(11) }),
        [
          { s: 14, type: "froze", stall: "drawing" },
          { s: 29, type: "reload", stall: "drawing", ms: 20_480 },
        ],
        "a page that runs timers but draws nothing is the other kind",
      );

      assert.deepEqual(
        run(40, { timer: (s) => s < 10 || s > 17, frame: (s) => s < 10 || s > 17, input: clicksFrom(11) }),
        [
          { s: 14, type: "froze", stall: "busy" },
          { s: 18, type: "recovered", stall: "busy", ms: 9_500 },
        ],
        "a page that comes back by itself is reported with how long it was gone",
      );

      assert.deepEqual(
        run(60, { timer: (s) => s < 10, frame: (s) => s < 10 }),
        [],
        "nobody clicked: a stopped page nobody is using is left to Chromium's own hang check",
      );

      assert.deepEqual(
        run(60, { frame: () => false, input: () => true, canDraw: () => false }),
        [],
        "a hidden or minimised window owes no frames",
      );
      assert.deepEqual(
        run(30, { frame: (s) => s < 3 || s > 20, input: () => true, canDraw: (s) => s < 3 || s > 20 }),
        [],
        "nor right after it is shown again",
      );

      {
        // Main itself was held up for 10 s (or the machine slept): the beats
        // may still be queued behind it, so the look starts over.
        const watch = createFreezeWatch();
        watch.check(0, true);
        watch.input(500);
        assert.equal(watch.check(10_000, true), null, "a late look is no freeze");
        watch.beat("timer", 10_100);
        watch.beat("frame", 10_120);
        assert.equal(watch.check(11_000, true), null, "and the beats behind it count again");
      }

      {
        // The page was reloaded: the next one is judged from its own beats.
        const watch = createFreezeWatch();
        watch.check(0, true);
        for (let s = 1; s <= 25; s += 1) {
          watch.input(s * 1000 - 200);
          watch.check(s * 1000, true);
        }
        watch.reset(25_500);
        watch.beat("timer", 26_500);
        watch.beat("frame", 26_520);
        watch.input(26_800);
        assert.equal(watch.check(27_000, true), null, "a fresh page is not frozen");
      }
    }

    // --- taskbar pins -----------------------------------------------------
    {
      // A pin of this exe under the old ID is re-stamped; a pin of another app,
      // one already right, a non-shortcut and an unreadable link are left alone.
      const appData = fs.mkdtempSync(path.join(outDir, "appdata-"));
      const pins = path.join(appData, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar");
      fs.mkdirSync(pins, { recursive: true });
      for (const name of ["Connect.lnk", "Other.lnk", "Already.lnk", "notes.txt", "Broken.lnk"]) {
        fs.writeFileSync(path.join(pins, name), "");
      }
      const fakeElectron = path.join(outDir, "fake-electron-pins.mjs");
      fs.writeFileSync(
        fakeElectron,
        `const state = (globalThis.__fakePins ??= { links: new Map(), writes: [], appData: "" });
         export const app = { getPath: () => state.appData };
         export const shell = {
           readShortcutLink: (p) => { const link = state.links.get(p.split(/[\\\\/]/).pop()); if (!link) throw new Error("unreadable"); return link; },
           writeShortcutLink: (p, op, options) => { state.writes.push([p.split(/[\\\\/]/).pop(), op, options]); return true; },
         };`,
      );
      const exe = process.execPath;
      globalThis.__fakePins = {
        appData,
        writes: [],
        links: new Map([
          ["Connect.lnk", { target: exe.toUpperCase(), appUserModelId: "electron.app.Connect" }],
          ["Other.lnk", { target: "C:\\Windows\\explorer.exe", appUserModelId: "Microsoft.Windows.Explorer" }],
          ["Already.lnk", { target: exe, appUserModelId: "com.nightdevx.connect-desktop" }],
          ["notes.txt", { target: exe, appUserModelId: "x" }],
        ]),
      };
      const { fixPinnedTaskbarShortcuts } = await bundle(outDir, "src/main/taskbar-pins.ts", "taskbar-pins.mjs", {
        alias: { electron: fakeElectron },
      });
      fixPinnedTaskbarShortcuts("com.nightdevx.connect-desktop");
      assert.deepEqual(globalThis.__fakePins.writes, [
        ["Connect.lnk", "update", { target: exe.toUpperCase(), appUserModelId: "com.nightdevx.connect-desktop" }],
      ]);

      globalThis.__fakePins.appData = path.join(appData, "missing");
      fixPinnedTaskbarShortcuts("com.nightdevx.connect-desktop");
      assert.equal(globalThis.__fakePins.writes.length, 1, "no pins folder is not an error");
    }

    // --- IPC sender check --------------------------------------------------
    {
      // A packaged build: no dev server, so only file:// is the app. The fake
      // is bundled into handle.mjs, so its handlers live on globalThis.
      const fakeElectron = path.join(outDir, "fake-electron.mjs");
      fs.writeFileSync(
        fakeElectron,
        `const handlers = (globalThis.__fakeIpcHandlers ??= new Map());
         export const app = { isPackaged: true };
         export const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };`,
      );
      const { handle, isTrustedSender } = await bundle(outDir, "src/main/ipc/handle.ts", "handle.mjs", {
        alias: { electron: fakeElectron },
      });

      const calls = [];
      handle("desktop:auth-session", (_event, payload) => {
        calls.push(payload);
        return "ok";
      });
      const invoke = globalThis.__fakeIpcHandlers.get("desktop:auth-session");
      const from = (url) => ({ senderFrame: url === null ? null : { url } });

      assert.equal(invoke(from("file:///C:/Program%20Files/Connect/resources/app.asar/dist/renderer/index.html"), 1), "ok");
      assert.deepEqual(calls, [1], "the app's own page gets through, with its arguments");

      const warn = console.warn;
      console.warn = () => {};
      try {
        for (const url of ["https://evil.example/", "http://127.0.0.1:41234/player", "data:text/html,x", "", null]) {
          assert.throws(() => invoke(from(url), 2), /refused/, `a call from ${JSON.stringify(url)} is refused`);
          assert.equal(isTrustedSender(from(url)), false, `${JSON.stringify(url)} gets no stream port either`);
        }
      } finally {
        console.warn = warn;
      }
      assert.deepEqual(calls, [1], "a refused call never reaches the listener");
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
