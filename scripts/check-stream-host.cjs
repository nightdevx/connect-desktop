#!/usr/bin/env node
// Self-check for the stream host: the utility process that holds the renderer's
// stream sockets (src/main/ipc/stream-host.ts) and main's handle on it
// (src/main/ipc/stream-host-client.ts).
//
// What it holds, for the host, against a real websocket server on loopback:
//   - a start opens the socket with the token it was given and answers its id;
//   - frames reach the page's port, addressed by the page's IPC channel;
//   - a second attach (a reload) replaces the port and closes the old one;
//   - a 401 comes back as fields that rebuild into a 401;
//   - a page that is gone has its socket closed and its port dropped.
//
// And for the client, against a fake electron module:
//   - a page gets one end of a fresh channel, the host the other;
//   - a start carries the token to the host and settles on its answer, a
//     failure rebuilt as a DesktopApiError with the same status;
//   - the host exiting fails the start in flight with a 503, tells each page
//     that its started streams closed, and a new host is spawned after the
//     backoff and given a port for every page;
//   - a destroyed page is reported to the host; dispose() stops the restarts.
//
// The 500 ms main-process stall and a real kill are measured by
// measure-stream-host.cjs, which needs Electron.
//
//   node scripts/check-stream-host.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { WebSocketServer } = require("ws");

const projectRoot = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const LOBBY_CHANNEL = "desktop:lobbies-stream-event";
const USERS_CHANNEL = "desktop:user-directory-event";

// mode: "ok" | "401". Records the query of every upgrade.
const startServer = async ({ mode = "ok" } = {}) => {
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  const connections = [];
  const queries = [];
  server.on("upgrade", (request, socket, head) => {
    queries.push(new URL(request.url, "http://local").searchParams);
    if (mode === "401") {
      socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => connections.push(ws));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    connections,
    queries,
    close: async () => {
      for (const ws of connections) ws.terminate();
      await new Promise((resolve) => server.close(resolve));
    },
  };
};

const fakePort = () => {
  const port = { messages: [], closed: false };
  port.postMessage = (message) => port.messages.push(message);
  port.close = () => {
    port.closed = true;
  };
  return port;
};

// Stands in for electron in the client's build. State lives on globalThis so
// the check reads the same forks the bundled client made.
const FAKE_ELECTRON = `
import { EventEmitter } from "node:events";
const state = (globalThis.__fakeElectron ??= { forks: [], channels: 0 });
class FakeChild extends EventEmitter {
  constructor(modulePath, args) {
    super();
    this.modulePath = modulePath;
    this.args = args;
    this.sent = [];
    this.killed = false;
  }
  postMessage(message, transfer) {
    this.sent.push({ message, transfer });
  }
  kill() {
    this.killed = true;
    this.emit("exit", 0);
    return true;
  }
}
export const utilityProcess = {
  fork: (modulePath, args) => {
    const child = new FakeChild(modulePath, args);
    state.forks.push(child);
    return child;
  },
};
export class MessageChannelMain {
  constructor() {
    state.channels += 1;
    this.port1 = { side: "host", channel: state.channels };
    this.port2 = { side: "page", channel: state.channels };
  }
}
export const net = {};
export const app = { userAgentFallback: "Mozilla/5.0 connect-desktop/0.3.0 Electron/45" };
`;

const fakePage = (id) => {
  const page = { id, ports: [], sent: [], destroyed: false, onDestroyed: null };
  page.isDestroyed = () => page.destroyed;
  page.once = (_event, listener) => {
    page.onDestroyed = listener;
  };
  page.postMessage = (channel, _message, transfer) => page.ports.push({ channel, port: transfer[0] });
  page.send = (channel, payload) => page.sent.push({ channel, payload });
  return page;
};

const main = async () => {
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-stream-host-"));
  const fakeElectron = path.join(outDir, "fake-electron.mjs");
  fs.writeFileSync(fakeElectron, FAKE_ELECTRON);

  // The host only needs electron for a type; the client gets the fake bundled in.
  for (const [entry, fileName, alias, external] of [
    ["src/main/ipc/stream-host.ts", "stream-host.mjs", {}, ["electron", "ws"]],
    ["src/main/ipc/stream-host-client.ts", "stream-host-client.mjs", { electron: fakeElectron }, ["ws", "node:events"]],
  ]) {
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
  }

  const { createStreamHost } = await import(pathToFileURL(path.join(outDir, "stream-host.mjs")).href);
  const { StreamHostClient, restartDelayMs, STREAM_PORT_CHANNEL } = await import(
    pathToFileURL(path.join(outDir, "stream-host-client.mjs")).href
  );

  // --- the host ------------------------------------------------------------
  {
    const server = await startServer();
    const replies = [];
    const handle = createStreamHost(server.url, (reply) => replies.push(reply), async () => true);

    const first = fakePort();
    handle({ type: "attach", senderId: 1 }, [first]);
    handle({ type: "start", id: 11, kind: "lobby", senderId: 1, accessToken: "tok-1" }, []);
    await sleep(200);
    assert.deepEqual(replies, [{ type: "started", id: 11 }], "a start was not answered, or answered with an error");
    assert.equal(server.queries[0].get("access_token"), "tok-1", "the socket did not carry the token main sent");

    server.connections[0].send(JSON.stringify({ type: "lobbies-snapshot", lobbies: [] }));
    await sleep(100);
    assert.deepEqual(
      first.messages.map((message) => [message.channel, message.payload.type]),
      [
        [LOBBY_CHANNEL, "stream-status"],
        [LOBBY_CHANNEL, "lobbies-snapshot"],
      ],
      "frames did not reach the page's port on the page's channel",
    );

    // A reload: the new page's port takes over.
    const second = fakePort();
    handle({ type: "attach", senderId: 1 }, [second]);
    assert.equal(first.closed, true, "the unloaded page's port was left open");
    handle({ type: "start", id: 12, kind: "users", senderId: 1, accessToken: "tok-1" }, []);
    server.connections[0].send(JSON.stringify({ type: "user-presence-updated" }));
    await sleep(150);
    assert.equal(first.messages.length, 2, "the old port still got frames");
    assert.equal(server.connections.length, 1, "a start on the live socket redialled");
    assert.deepEqual(
      second.messages.map((message) => [message.channel, message.payload.type]),
      [
        [USERS_CHANNEL, "stream-status"],
        [USERS_CHANNEL, "user-presence-updated"],
      ],
      "after the reload, the started stream's events did not reach the new port",
    );

    handle({ type: "sender-gone", senderId: 1 }, []);
    await sleep(150);
    assert.equal(second.closed, true, "a gone page's port was kept");
    assert.notEqual(server.connections[0].readyState, 1, "a gone page's socket was left open");
    await server.close();

    const expired = await startServer({ mode: "401" });
    const replies401 = [];
    const handle401 = createStreamHost(expired.url, (reply) => replies401.push(reply), async () => true);
    handle401({ type: "attach", senderId: 2 }, [fakePort()]);
    handle401({ type: "start", id: 21, kind: "dm", senderId: 2, accessToken: "stale" }, []);
    await sleep(200);
    assert.equal(replies401.length, 1);
    assert.equal(replies401[0].id, 21);
    assert.equal(replies401[0].error?.statusCode, 401, "a 401 did not come back as a 401");
    assert.equal(replies401[0].error?.code, "UNAUTHORIZED");
    await expired.close();
  }

  // --- the client ----------------------------------------------------------
  {
    assert.equal(restartDelayMs(0), 500);
    assert.equal(restartDelayMs(1), 1_000);
    assert.equal(restartDelayMs(20), 30_000, "the restart backoff is not capped");

    const forks = globalThis.__fakeElectron.forks;
    const client = new StreamHostClient("/dist/main/stream-host-process.js", "https://backend.example");
    const page = fakePage(7);

    client.attach(page);
    assert.equal(forks.length, 0, "a page loading started the host before any stream was asked for");

    const lobby = client.start("lobby", page, "tok-7");
    assert.equal(forks.length, 1, "the first start did not start the host");
    const host = forks[0];
    assert.deepEqual(
      host.args,
      ["https://backend.example", "Mozilla/5.0 connect-desktop/0.3.0 Electron/45"],
      "the host was not told the backend and the User-Agent its sockets send",
    );
    assert.deepEqual(
      host.sent.map((entry) => entry.message.type),
      ["attach", "start"],
      "the page's port did not reach the host before its start",
    );
    const attach = host.sent[0];
    assert.equal(attach.message.senderId, 7);
    assert.equal(attach.transfer[0].side, "host");
    assert.equal(page.ports.length, 1);
    assert.equal(page.ports[0].channel, STREAM_PORT_CHANNEL);
    assert.equal(page.ports[0].port.channel, attach.transfer[0].channel, "page and host got ends of different channels");

    const startLobby = host.sent[1];
    assert.equal(startLobby.message.accessToken, "tok-7", "the start did not carry the token");
    host.emit("message", { type: "started", id: startLobby.message.id });
    await lobby;

    const users = client.start("users", page, "tok-7");
    const startUsers = host.sent.filter((entry) => entry.message.type === "start")[1];
    host.emit("message", {
      type: "started",
      id: startUsers.message.id,
      error: { code: "UNAUTHORIZED", statusCode: 401, message: "expired" },
    });
    await assert.rejects(
      users,
      (error) => error.name === "DesktopApiError" && error.statusCode === 401 && error.code === "UNAUTHORIZED",
      "a failed start was not rebuilt as the same DesktopApiError",
    );

    client.stop("dm", 7);
    assert.ok(host.sent.some((entry) => entry.message.type === "stop" && entry.message.kind === "dm"));

    // The host dies with a start in flight.
    const dm = client.start("dm", page, "tok-7");
    host.emit("exit", 1);
    await assert.rejects(dm, (error) => error.statusCode === 503, "a start in flight survived the host");
    const closed = page.sent.filter((entry) => entry.payload.status === "closed").map((entry) => entry.channel);
    assert.ok(closed.includes(LOBBY_CHANNEL), "the page was not told its lobby stream closed");
    assert.ok(!closed.includes(USERS_CHANNEL), "a stream that never started was reported closed");

    await sleep(restartDelayMs(1) + 200);
    assert.equal(forks.length, 2, "the host was not restarted after the backoff");
    assert.ok(
      forks[1].sent.some((entry) => entry.message.type === "attach" && entry.message.senderId === 7),
      "the restarted host was not given the page's port",
    );
    assert.equal(page.ports.length, 2, "the page was not given a port to the new host");

    page.destroyed = true;
    page.onDestroyed();
    assert.ok(
      forks[1].sent.some((entry) => entry.message.type === "sender-gone" && entry.message.senderId === 7),
      "a destroyed page was not reported to the host",
    );

    client.dispose();
    assert.equal(forks[1].killed, true, "dispose left the host running");
    await sleep(restartDelayMs(2) + 200);
    assert.equal(forks.length, 2, "a disposed client restarted the host");
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "stream-host self-check passed (token to socket, frames to the page port, reload, 401, gone page, client restart and backoff)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
