// Measures the lobby chat and a direct-message thread with a 5 000-message
// history: DOM size, mount time, the cost of one new message and of a
// keystroke, scroll frame times, and the three scroll behaviours a long thread
// has to keep (lands on the newest message, follows new ones at the bottom,
// keeps the row being read in place when a new message or an older page lands,
// keeps an edit in progress when its row scrolls away). It also times the
// friends page with 500 friends, the longest list that is not a history.
//
// The page is measure-chat-history.page.tsx, built with the renderer's
// stylesheet so rows have their real heights, and loaded in a window that is
// never shown. It renders the plain list when the virtual list does not exist,
// so the same script measures before and after.
//
//   node scripts/measure-chat-history.cjs
//
// On demand, like measure-games-layout.cjs: it needs a real Chromium.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const WORK = path.join(ROOT, "node_modules", ".cache", "ct-chat-history");

const build = async () => {
  const { build: viteBuild } = await import("vite");
  const react = (await import("@vitejs/plugin-react")).default;
  await viteBuild({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    publicDir: false,
    plugins: [react()],
    css: { postcss: ROOT },
    resolve: {
      alias: {
        "@": path.join(ROOT, "src/renderer/src"),
        "@shared": path.join(ROOT, "src/shared"),
      },
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: WORK,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: path.join(__dirname, "measure-chat-history.page.tsx"),
        formats: ["es"],
        fileName: () => "page.js",
        cssFileName: "page",
      },
    },
  });
  fs.writeFileSync(
    path.join(WORK, "index.html"),
    '<!doctype html><html lang="tr"><meta charset="utf-8"><link rel="stylesheet" href="./page.css"><body><script type="module" src="./page.js"></script></body></html>',
  );
};

const runInElectron = () => {
  const { app, BrowserWindow } = require("electron");
  app.setPath("userData", path.join(WORK, "profile"));
  app.commandLine.appendSwitch("js-flags", "--expose-gc");
  app.commandLine.appendSwitch("enable-precise-memory-info");

  app.whenReady().then(async () => {
    let exitCode = 0;
    try {
      // Offscreen: never on screen, but unlike a plain hidden window it is
      // given frames, so rAF and scroll events run at 60 Hz.
      const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: { backgroundThrottling: false, contextIsolation: true, offscreen: true },
      });
      win.webContents.setFrameRate(60);
      win.webContents.on("console-message", (details) => {
        if (details.level === "error") console.error("[page]", details.message);
      });
      await win.loadFile(path.join(WORK, "index.html"));
      // Focus events only fire in a focused page; an edit box takes focus.
      win.webContents.focus();
      const result = await win.webContents.executeJavaScript("window.__run()");
      const text = JSON.stringify(result, null, 2);
      fs.writeFileSync(path.join(WORK, "result.json"), text);
      console.log(text);

      // The behaviours hold before and after; the sizes only after.
      const failures = [];
      for (const [name, scenario] of Object.entries(result)) {
        for (const key of [
          "landedAtBottomPx",
          "followedNewMessagePx",
          "readingShiftedOnAppendPx",
          "anchorShiftedOnPrependPx",
        ]) {
          if (key in scenario && !(scenario[key] <= 2)) failures.push(`${name}.${key} = ${scenario[key]}`);
        }
        if (name === "lobby" && scenario.editSurvivedScrollAway !== true) {
          failures.push("lobby: an edit in progress was lost when its row scrolled away");
        }
        if (name === "dm" && scenario.olderPagesLoaded !== 1) {
          failures.push(`dm.olderPagesLoaded = ${scenario.olderPagesLoaded}, expected 1`);
        }
        if (scenario.virtualized && scenario.renderedRows > 100) {
          failures.push(`${name}.renderedRows = ${scenario.renderedRows}`);
        }
      }
      if (failures.length > 0) {
        console.error(`chat history: ${failures.join("; ")}`);
        exitCode = 1;
      }
    } catch (error) {
      console.error(error);
      exitCode = 1;
    }
    app.exit(exitCode);
  });
};

if (process.versions.electron) {
  runInElectron();
} else {
  build()
    .then(() => {
      const { spawnSync } = require("node:child_process");
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const run = spawnSync(require("electron"), [__filename], { env, stdio: "inherit", timeout: 120_000 });
      process.exit(run.status ?? 1);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
