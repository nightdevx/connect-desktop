// Measures what a blocked main process costs the stream sockets, and that the
// stream host comes back when it is killed.
//
// A loopback websocket server in its own Node process sends a lobby frame every
// 20 ms, stamped with the time it was sent. A hidden window with the real
// preload counts when each one reaches the page. Then the main process is held
// in a 500 ms busy loop, and the delay of the frames sent during it is the
// number this prints.
//
// With the sockets in main (the old StreamHub), every frame sent in that window
// waits for the loop to end. With them in the utility process
// (src/main/stream-host-process.ts), frames go to the page over a MessagePort
// that main does not relay, so they keep arriving.
//
// After that it kills the utility process: the page must hear the stream close,
// the host must be restarted on its own, and a new start must deliver frames.
//
//   pnpm build:main
//   env -u ELECTRON_RUN_AS_NODE npx electron scripts/measure-stream-host.cjs
//
// On demand, like measure-games-layout.cjs: it needs a real Electron and a
// compiled main, which is not what a commit hook should wait on. The window is
// never shown.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, ipcMain } = require("electron");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist", "main");
const WORK = path.join(ROOT, "node_modules", ".cache", "ct-stream-host");
fs.mkdirSync(WORK, { recursive: true });

app.setPath("userData", path.join(WORK, "profile"));
app.commandLine.appendSwitch("disable-gpu");

const FRAME_INTERVAL_MS = 20;
const BLOCK_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SERVER_SOURCE = `
const http = require("node:http");
const { WebSocketServer } = require(${JSON.stringify(path.join(ROOT, "node_modules", "ws"))});
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true }));
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws)));
let seq = 0;
setInterval(() => {
  const frame = JSON.stringify({ type: "lobby-message", seq: seq++, sentAt: Date.now() });
  for (const ws of wss.clients) ws.send(frame);
}, ${FRAME_INTERVAL_MS});
server.listen(0, "127.0.0.1", () => console.log("PORT " + server.address().port));
`;

const startFrameServer = () =>
  new Promise((resolve, reject) => {
    const file = path.join(WORK, "frame-server.cjs");
    fs.writeFileSync(file, SERVER_SOURCE);
    const child = spawn("node", [file], { stdio: ["ignore", "pipe", "inherit"] });
    child.on("error", reject);
    child.stdout.on("data", (chunk) => {
      const match = /PORT (\d+)/.exec(String(chunk));
      if (match) resolve({ child, url: `http://127.0.0.1:${match[1]}` });
    });
  });

const PAGE = `<!doctype html><meta charset="utf-8"><script>
  window.__frames = [];
  window.__status = [];
  window.desktopApi.onLobbyStreamEvent((event) => {
    if (event.type === "lobby-message") window.__frames.push([Date.now(), event.sentAt]);
    else if (event.type === "stream-status") window.__status.push(event.status);
  });
</script>`;

const busyWait = (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Holding the main thread on purpose.
  }
};

const summarise = (frames, from, to) => {
  const inWindow = frames.filter(([, sentAt]) => sentAt >= from && sentAt < to);
  const delays = inWindow.map(([arrived, sentAt]) => arrived - sentAt).sort((a, b) => a - b);
  const arrivals = inWindow.map(([arrived]) => arrived);
  let maxGap = 0;
  for (let i = 1; i < arrivals.length; i += 1) maxGap = Math.max(maxGap, arrivals[i] - arrivals[i - 1]);
  return {
    frames: inWindow.length,
    medianDelayMs: delays[Math.floor(delays.length / 2)] ?? null,
    maxDelayMs: delays[delays.length - 1] ?? null,
    maxGapMs: maxGap,
  };
};

const main = async () => {
  const server = await startFrameServer();
  const result = { mode: null };
  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(ROOT, "dist", "preload", "index.js"),
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });

    const clientFile = path.join(DIST, "ipc", "stream-host-client.js");
    let client = null;
    let start;
    if (fs.existsSync(clientFile)) {
      result.mode = "utility process";
      const { StreamHostClient } = require(clientFile);
      client = new StreamHostClient(path.join(DIST, "stream-host-process.js"), server.url);
      ipcMain.on("desktop:stream-port-request", (event) => client.attach(event.sender));
      start = () => client.start("lobby", win.webContents, "harness-token");
    } else {
      result.mode = "main process";
      const { StreamHub } = require(path.join(DIST, "ipc", "stream-hub.js"));
      const hub = new StreamHub(server.url, {
        start: async () => undefined,
        stop: () => undefined,
        probe: () => undefined,
        stopAll: () => undefined,
        backendAnswers: async () => true,
      });
      start = () => hub.start("lobby", win.webContents, "harness-token");
    }

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`);
    await start();
    await sleep(1_000);

    const blockedFrom = Date.now();
    busyWait(BLOCK_MS);
    const blockedTo = Date.now();
    await sleep(1_000);

    const frames = await win.webContents.executeJavaScript("window.__frames");
    result.beforeBlock = summarise(frames, blockedFrom - 500, blockedFrom);
    result.duringBlock = summarise(frames, blockedFrom, blockedTo);

    if (client) {
      const firstPid = client.child?.pid;
      process.kill(firstPid);
      const killedAt = Date.now();
      let restartedPid = null;
      let restartedAfterMs = null;
      while (Date.now() - killedAt < 5_000) {
        await sleep(50);
        const pid = client.child?.pid;
        if (pid && pid !== firstPid) {
          restartedPid = pid;
          restartedAfterMs = Date.now() - killedAt;
          break;
        }
      }
      const status = await win.webContents.executeJavaScript("window.__status");
      // What the renderer's reconnect does on "closed".
      await start();
      const resumedFrom = Date.now();
      await sleep(500);
      const after = await win.webContents.executeJavaScript("window.__frames");
      result.kill = {
        firstPid,
        restartedPid,
        restartedAfterMs,
        pageHeard: status,
        framesAfterRestart: after.filter(([arrived]) => arrived >= resumedFrom).length,
      };
      client.dispose();
    }
  } finally {
    server.child.kill();
  }
  return result;
};

app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    const result = await main();
    const text = JSON.stringify(result, null, 2);
    fs.writeFileSync(path.join(WORK, "result.json"), text);
    console.log(text);
    // Held only for the utility process: in main, the delay is the point.
    if (result.mode === "utility process") {
      const failures = [];
      if (!(result.duringBlock.frames > 5)) failures.push("too few frames during the block");
      if (!(result.duringBlock.maxDelayMs < 100)) failures.push(`frames waited ${result.duringBlock.maxDelayMs} ms for main`);
      if (!result.kill.restartedPid) failures.push("the killed host was not restarted");
      if (!result.kill.pageHeard.includes("closed")) failures.push("the page was not told its stream closed");
      if (!(result.kill.framesAfterRestart > 0)) failures.push("no frames after the restart");
      if (failures.length > 0) {
        console.error(`stream host: ${failures.join("; ")}`);
        exitCode = 1;
      }
    }
  } catch (error) {
    console.error(error);
    exitCode = 1;
  }
  app.exit(exitCode);
});
