#!/usr/bin/env node
// Self-check for the multiplexed stream socket (src/main/ipc/stream-hub.ts),
// against a real websocket server on loopback.
//
// What it holds:
//   - the three streams' starts share ONE socket, also when they race;
//   - frames reach the renderer channel of the stream they belong to, and only
//     a stream that was started gets them (stream-frames.ts covers every type
//     the stream event unions declare);
//   - a start on a live socket does not redial, a stop of one stream keeps it,
//     the last stop closes it;
//   - the server closing it is reported as "closed" to every started stream;
//   - probe() keeps a socket that answers and terminates one that does not;
//   - a backend without /ws (404, and /healthz answers) hands the streams to
//     the per-stream sockets; a 404 with the backend down (the proxy during a
//     deploy) does not, and the next start tries /ws again;
//   - a 401 comes back as a 401 for withAccessToken's refresh.
//
//   node scripts/check-stream-hub.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { WebSocketServer } = require("ws");

const projectRoot = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fakeSender = (id) => {
  const sent = [];
  return {
    id,
    sent,
    send: (channel, payload) => sent.push({ channel, payload }),
    isDestroyed: () => false,
    once: () => {},
    framesOn: (channel) => sent.filter((entry) => entry.channel === channel).map((entry) => entry.payload),
  };
};

// A loopback server for /ws. mode: "ok" | "404" | "401" | "drop" (the
// connection dies before the upgrade); pong: answer pings.
const startServer = async ({ mode = "ok", pong = true } = {}) => {
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true, autoPong: pong });
  const connections = [];
  server.on("upgrade", (request, socket, head) => {
    if (mode === "drop") {
      socket.destroy();
      return;
    }
    if (mode === "404" || mode === "401") {
      socket.write(`HTTP/1.1 ${mode === "404" ? "404 Not Found" : "401 Unauthorized"}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      connections.push(ws);
      wss.emit("connection", ws, request);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    connections,
    close: async () => {
      for (const ws of connections) ws.terminate();
      await new Promise((resolve) => server.close(resolve));
    },
  };
};

const fakeLegacy = ({ backendUp = true } = {}) => {
  const calls = [];
  return {
    calls,
    backendAnswers: async () => {
      calls.push("healthz");
      return backendUp;
    },
    start: async (kind, sender) => {
      calls.push(`start:${kind}:${sender.id}`);
    },
    stop: (kind, senderId) => calls.push(`stop:${kind}:${senderId}`),
    probe: () => calls.push("probe"),
    stopAll: () => calls.push("stopAll"),
  };
};

const main = async () => {
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-stream-hub-"));

  for (const [entry, fileName] of [
    ["src/main/ipc/stream-hub.ts", "stream-hub.mjs"],
    ["src/main/ipc/stream-frames.ts", "stream-frames.mjs"],
  ]) {
    await build({
      root: projectRoot,
      logLevel: "error",
      configFile: false,
      publicDir: false,
      build: {
        outDir,
        emptyOutDir: false,
        ssr: true,
        rollupOptions: { external: ["electron", "ws"] },
        lib: { entry: path.join(projectRoot, entry), formats: ["es"], fileName: () => fileName },
      },
    });
  }

  const { StreamHub, STREAM_EVENT_CHANNELS, PROBE_TIMEOUT_MS } = await import(
    pathToFileURL(path.join(outDir, "stream-hub.mjs")).href
  );
  const { streamOfFrame } = await import(pathToFileURL(path.join(outDir, "stream-frames.mjs")).href);

  // --- classification against the declared stream event types ---------------
  const types = fs.readFileSync(path.join(projectRoot, "src/shared/desktop-api-types.ts"), "utf8");
  const unionTypes = (name) => {
    const start = types.indexOf(`export type ${name} =`);
    assert.ok(start >= 0, `${name} not found`);
    const end = types.indexOf("\nexport ", start + 10);
    const body = types.slice(start, end);
    return [...body.matchAll(/type:\s*((?:"[a-z-]+"\s*\|?\s*)+)/g)]
      .flatMap((match) => [...match[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]))
      .filter((type) => type !== "stream-status" && type !== "system-error");
  };
  const expected = [
    ["LobbyStreamEvent", "lobby"],
    ["UserDirectoryStreamEvent", "users"],
    ["DirectMessagesStreamEvent", "dm"],
  ];
  for (const [union, kind] of expected) {
    const declared = unionTypes(union);
    assert.ok(declared.length > 0, `${union}: no types parsed`);
    for (const type of declared) {
      assert.equal(streamOfFrame(type), kind, `${union} frame "${type}" is routed to ${streamOfFrame(type)}`);
    }
  }
  // Frames the renderer handles but the unions declare loosely, and the ones
  // the backend emits for calls and friends.
  for (const type of ["lobby-emote", "music-state", "watch-state", "minigame-table"]) {
    assert.equal(streamOfFrame(type), "lobby", type);
  }
  for (const type of ["incoming-call", "call-accepted", "call-rejected", "call-cancelled", "friend-request", "friend-accepted", "friend-removed"]) {
    assert.equal(streamOfFrame(type), "users", type);
  }
  assert.equal(streamOfFrame("stream-status"), null, "the server's stream-status is not forwarded; the hub reports its own");

  // --- one socket, routing, stops ------------------------------------------
  {
    const server = await startServer();
    const hub = new StreamHub(server.url, fakeLegacy());
    const sender = fakeSender(1);

    await Promise.all([
      hub.start("lobby", sender, "token"),
      hub.start("users", sender, "token"),
    ]);
    assert.equal(server.connections.length, 1, "two racing starts opened two sockets");

    server.connections[0].send(JSON.stringify({ type: "lobbies-snapshot", lobbies: [] }));
    server.connections[0].send(JSON.stringify({ type: "user-presence-updated" }));
    server.connections[0].send(JSON.stringify({ type: "direct-chat-message", peerUserId: "u2" }));
    await sleep(100);
    assert.deepEqual(
      sender.framesOn(STREAM_EVENT_CHANNELS.lobby).map((frame) => frame.type),
      ["stream-status", "lobbies-snapshot"],
    );
    assert.deepEqual(
      sender.framesOn(STREAM_EVENT_CHANNELS.users).map((frame) => frame.type),
      ["stream-status", "user-presence-updated"],
    );
    assert.equal(sender.framesOn(STREAM_EVENT_CHANNELS.dm).length, 0, "a stream nobody started got frames");

    await hub.start("dm", sender, "token");
    await hub.start("lobby", sender, "token");
    assert.equal(server.connections.length, 1, "a start on a live socket redialled");
    assert.equal(sender.framesOn(STREAM_EVENT_CHANNELS.dm)[0].type, "stream-status", "joining a live socket is a connect");

    hub.stop("users", 1);
    hub.stop("dm", 1);
    await sleep(100);
    assert.equal(server.connections[0].readyState, 1, "stopping some streams closed the socket");
    hub.stop("lobby", 1);
    await sleep(150);
    assert.notEqual(server.connections[0].readyState, 1, "the last stop left the socket open");
    const closedReports = sender.sent.filter((entry) => entry.payload.status === "closed");
    assert.equal(closedReports.length, 0, "a stop announced itself as a dropped connection");
    await server.close();
  }

  // --- the server closing --------------------------------------------------
  {
    const server = await startServer();
    const hub = new StreamHub(server.url, fakeLegacy());
    const sender = fakeSender(2);
    await hub.start("lobby", sender, "token");
    await hub.start("dm", sender, "token");
    server.connections[0].close(1001, "going away");
    await sleep(150);
    for (const kind of ["lobby", "dm"]) {
      const last = sender.framesOn(STREAM_EVENT_CHANNELS[kind]).at(-1);
      assert.equal(last.status, "closed", `${kind} was not told the socket closed`);
    }
    assert.equal(sender.framesOn(STREAM_EVENT_CHANNELS.users).length, 0);
    // The renderer's reconnect: a start after the close dials again.
    await hub.start("lobby", sender, "token");
    assert.equal(server.connections.length, 2, "a start after a close did not redial");
    await server.close();
  }

  // --- a dial that fails ----------------------------------------------------
  // Rejects (the renderer's reconnect runs off that) and says nothing else: a
  // "closed" for a socket that never opened made the renderer schedule a
  // second reconnect for every failed one.
  {
    const dead = await startServer({ mode: "drop" });
    const hub = new StreamHub(dead.url, fakeLegacy());
    const sender = fakeSender(8);
    await assert.rejects(Promise.all([hub.start("lobby", sender, "token"), hub.start("users", sender, "token")]));
    await sleep(100);
    assert.deepEqual(
      sender.sent.filter((entry) => entry.payload.status === "closed").map((entry) => entry.channel),
      [],
      "a dial that never opened announced a closure",
    );
    await dead.close();
  }

  // --- probe ---------------------------------------------------------------
  {
    const answering = await startServer({ pong: true });
    const hub = new StreamHub(answering.url, fakeLegacy());
    const sender = fakeSender(3);
    await hub.start("lobby", sender, "token");
    hub.probe();
    await sleep(PROBE_TIMEOUT_MS + 300);
    assert.equal(answering.connections[0].readyState, 1, "probe killed a socket that answered");
    assert.ok(!sender.sent.some((entry) => entry.payload.status === "closed"), "probe reported a healthy socket closed");
    hub.stopAll();
    await answering.close();

    const silent = await startServer({ pong: false });
    const hub2 = new StreamHub(silent.url, fakeLegacy());
    const sender2 = fakeSender(4);
    await hub2.start("lobby", sender2, "token");
    hub2.probe();
    await sleep(PROBE_TIMEOUT_MS + 500);
    const last = sender2.framesOn(STREAM_EVENT_CHANNELS.lobby).at(-1);
    assert.equal(last.status, "closed", "probe kept a socket that never answered");
    await silent.close();
  }

  // --- old backend, expired token -----------------------------------------
  {
    const old = await startServer({ mode: "404" });
    const legacy = fakeLegacy();
    const hub = new StreamHub(old.url, legacy);
    const sender = fakeSender(5);
    await Promise.all([hub.start("lobby", sender, "token"), hub.start("dm", sender, "token")]);
    await hub.start("users", sender, "token");
    hub.probe();
    hub.stop("lobby", 5);
    assert.equal(hub.isLegacy(), true, "a 404 did not switch to the per-stream sockets");
    assert.deepEqual(
      legacy.calls,
      ["healthz", "start:lobby:5", "start:dm:5", "start:users:5", "probe", "stop:lobby:5"],
      "two starts racing into a 404 asked /healthz more than once, or did not both land on the per-stream sockets",
    );
    await old.close();

    // The proxy answering 404 while the backend is down is not an old backend.
    const proxy = await startServer({ mode: "404" });
    const down = fakeLegacy({ backendUp: false });
    const hub3 = new StreamHub(proxy.url, down);
    await assert.rejects(hub3.start("lobby", fakeSender(7), "token"), (error) => error.statusCode === 404);
    assert.equal(hub3.isLegacy(), false, "a proxy's 404 during an outage pinned the window to the per-stream sockets");
    assert.deepEqual(down.calls, ["healthz"]);
    await proxy.close();

    const expired = await startServer({ mode: "401" });
    const hub2 = new StreamHub(expired.url, fakeLegacy());
    await assert.rejects(
      hub2.start("lobby", fakeSender(6), "stale"),
      (error) => error.statusCode === 401,
      "a 401 did not reach withAccessToken as a 401",
    );
    assert.equal(hub2.isLegacy(), false, "a 401 switched to the per-stream sockets");
    await expired.close();
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "stream-hub self-check passed (one socket for three streams, routing, stops, server close, probe, 404 fallback, 401)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
