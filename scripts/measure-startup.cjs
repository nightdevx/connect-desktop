// Measures how long the built page takes to its first paint, and how much of
// that the main thread spends compiling and running scripts.
//
// Each run is a fresh Electron process with a fresh profile, loading
// dist/renderer/index.html with the real preload in a window that is never
// shown. No IPC handler is registered, so every call the page makes is
// rejected: the first paint is the boot or sign-in screen, which is the point
// (it is what every launch paints first). Five runs, medians printed.
//
//   pnpm build && node scripts/measure-startup.cjs
//
// On demand, like measure-chat-history.cjs: it needs a real Chromium.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const RUNS = 5;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const runInElectron = () => {
  const { app, BrowserWindow, contentTracing } = require("electron");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ct-startup-"));
  app.setPath("userData", profile);

  app.whenReady().then(async () => {
    await contentTracing.startRecording({
      included_categories: ["devtools.timeline", "v8", "disabled-by-default-v8.compile"],
    });
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        preload: path.join(ROOT, "dist", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        // Offscreen: never on screen, but unlike a plain hidden window it
        // paints, so first-contentful-paint fires.
        offscreen: true,
      },
    });
    await win.loadFile(path.join(ROOT, "dist", "renderer", "index.html")).catch(() => {});

    const fcp = await win.webContents.executeJavaScript(`new Promise((resolve) => {
      const read = () => performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
      const poll = () => (read() !== undefined ? resolve(read()) : setTimeout(poll, 20));
      poll();
      setTimeout(() => resolve(null), 10000);
    })`);
    const tracePath = await contentTracing.stopRecording(path.join(profile, "trace.json"));
    const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
    const events = Array.isArray(trace) ? trace : trace.traceEvents;

    // Script work on the page's main thread. Recording stops a poll (20 ms)
    // after the first paint, so this is, near enough, the work before it.
    const main = events.find((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain");
    const onMain = (e) => e.pid === main?.pid && e.tid === main?.tid && e.ph === "X";
    const sum = (names, where = onMain) =>
      events.filter((e) => where(e) && names.includes(e.name)).reduce((total, e) => total + e.dur / 1000, 0);

    process.stdout.write(
      `${JSON.stringify({
        fcp,
        parse: sum(["V8.ParseProgram"]),
        compile: sum(["V8.CompileCode", "V8.CompileLazy"]),
        evaluate: sum(["EvaluateScript", "v8.evaluateModule"]),
        backgroundParse: sum(["v8.parseOnBackground"], (e) => e.pid === main?.pid && e.tid !== main?.tid),
      })}\n`,
    );
    fs.rmSync(profile, { recursive: true, force: true });
    app.exit(0);
  });
};

if (process.versions.electron) {
  runInElectron();
} else {
  const electron = require("electron");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const results = [];
  for (let i = 0; i < RUNS; i += 1) {
    const run = spawnSync(electron, [__filename], { env, encoding: "utf8", timeout: 60_000 });
    const line = run.stdout.split("\n").find((l) => l.startsWith("{"));
    if (!line) {
      console.error(run.stdout, run.stderr);
      process.exit(1);
    }
    results.push(JSON.parse(line));
  }
  const pick = (key) => results.map((r) => r[key]);
  const fmt = (values) => `${median(values).toFixed(0)} ms (${values.map((v) => v.toFixed(0)).join(", ")})`;
  console.log(`first contentful paint: ${fmt(pick("fcp"))}`);
  console.log(`  main thread, module evaluation (parse, compile, run): ${fmt(pick("evaluate"))}`);
  console.log(`    of which parsing: ${fmt(pick("parse"))}`);
  console.log(`    of which bytecode compile: ${fmt(pick("compile"))}`);
  console.log(`  parsing on background threads: ${fmt(pick("backgroundParse"))}`);
}
