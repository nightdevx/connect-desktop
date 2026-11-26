#!/usr/bin/env node
// Acceptance check for how media diagnostics leave this machine.
//
// A member sitting silent in a room uploaded 13-16 KB of diagnostics JSON every
// 20 s: more than their silent microphone sends. Measured on 200 real batches,
// gzip makes them 13 times smaller. What must hold:
//
//   GZIP      the main process sends the batch gzip-compressed, marked as such,
//             and what the server unpacks is the batch, byte for byte.
//   SMALLER   a realistic batch is at least five times smaller on the wire.
//   DISABLED  when the server says diagnostics are switched off, the session
//             stops uploading; the next session asks once again.
//
// Needs dist/ (pnpm build:main), like check-media-diagnostics.
//   node scripts/check-diagnostics-upload.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const Module = require("node:module");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// --- main process: what MediaClient.uploadDiagnostics puts on the wire --------
const sent = [];
let answer = () => new Response(JSON.stringify({ stored: true, enabled: true }), {
  status: 200,
  headers: { "content-type": "application/json" },
});
const realLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === "electron") {
    return {
      net: {
        fetch: async (url, init) => {
          sent.push({ url: String(url), init });
          return answer();
        },
      },
    };
  }
  return realLoad.call(this, request, ...rest);
};

const { BaseClient } = require(path.join(projectRoot, "dist", "main", "clients", "base-client.js"));
const { MediaClient } = require(path.join(projectRoot, "dist", "main", "clients", "media-client.js"));

const headerOf = (init, name) => {
  const headers = init.headers ?? {};
  if (typeof headers.get === "function") return headers.get(name);
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
};
const bytesOf = (body) => {
  assert.ok(typeof body !== "string", "the body went out as text: it is not compressed");
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  assert.fail(`unexpected body type ${Object.prototype.toString.call(body)}`);
};

// One stats sample as the collector records it (shape taken from production).
const sample = (seq) => ({
  seq,
  tMs: 9_000_000 + seq * 2000,
  atMs: 1_795_468_000_000 + seq * 2000,
  kind: "sample",
  scope: "stats",
  name: "media-stats",
  data: {
    rttMs: 17 + (seq % 9),
    inbound: [],
    icePaths: { publisher: "udp/prflx", subscriber: "udp/prflx" },
    outbound: [],
    transport: { bitrateBps: 90_000 + seq * 137, packetsPerSecond: 50 + (seq % 3) },
    inboundAudio: ["731f91c2-0e99-4149-9e12-4c0b994d62a3", "da4a9bfd-c657-4027-93e0-477abb69c242", "4621c815-554c-424d-bdb7-e241a9b3efe9"].map(
      (id, i) => ({
        jitterMs: 2 + ((seq + i) % 7),
        trackKey: `${id}:microphone`,
        silentPct: 0,
        bitrateBps: 1200 + seq * 31 + i * 977,
        packetLossPct: i === 2 ? 0.4 : null,
        concealmentPct: (seq * (i + 1)) % 3,
        packetsDiscarded: 0,
        jitterBufferTargetMs: 45 + ((seq * 3 + i) % 20),
      }),
    ),
    outboundAudio: [{ trackKey: "local:microphone", bitrateBps: 60_000 + seq * 911, packetLossPct: 0, retransmittedPct: 0 }],
    availableOutgoingBitrateBps: 5_303_333 - seq * 1009,
  },
});
const batch = {
  schemaVersion: 3,
  sessionId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  lobbyId: "main-lobby",
  seq: 42,
  final: false,
  client: { appVersion: "0.3.8", platform: "win32", note: "ğüşiöç" },
  summary: { samples: 420, durationMs: 840_000 },
  problems: ["packet-loss"],
  entries: Array.from({ length: 10 }, (_, i) => sample(4700 + i)),
};

const main = async () => {
  const client = new MediaClient(new BaseClient("https://backend.test"));
  const result = await client.uploadDiagnostics("token-123", batch);
  assert.deepEqual(result, { stored: true, enabled: true }, "the server's answer must come back unchanged");
  assert.equal(sent.length, 1, "one batch is one request");
  const { url, init } = sent[0];
  assert.equal(url, "https://backend.test/media-diagnostics");
  assert.equal(init.method, "POST");
  assert.equal(headerOf(init, "Authorization"), "Bearer token-123");
  assert.equal(String(headerOf(init, "Content-Encoding")).toLowerCase(), "gzip", "GZIP: the request must say its body is gzip");
  assert.match(String(headerOf(init, "Content-Type")), /^application\/json/, "the server decodes JSON after unpacking");

  const wire = bytesOf(init.body);
  const plain = Buffer.from(JSON.stringify(batch), "utf8");
  const unpacked = zlib.gunzipSync(wire);
  assert.ok(unpacked.equals(plain), "GZIP: what the server unpacks must be the batch, byte for byte (UTF-8 included)");
  assert.ok(
    wire.length * 5 <= plain.length,
    `SMALLER: ${wire.length} bytes on the wire for ${plain.length} bytes of JSON, less than five times smaller`,
  );

  // An error answer still surfaces as an error, compressed or not.
  answer = () => new Response(JSON.stringify({ code: "VALIDATION_ERROR", error: "invalid diagnostics payload" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(() => client.uploadDiagnostics("token-123", batch), "a refused batch must reject");

  // Other requests are not compressed: only diagnostics are worth it.
  sent.length = 0;
  answer = () => new Response(JSON.stringify({ peerConnected: true }), { status: 200, headers: { "content-type": "application/json" } });
  await client.getCallPeerStatus("token-123", "call_1");
  assert.equal(sent.length, 1);
  for (const other of sent) {
    assert.equal(headerOf(other.init, "Content-Encoding"), undefined, "only the diagnostics upload is compressed");
  }

  // --- renderer: a server with diagnostics switched off -----------------------
  Module._load = realLoad;
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-diagnostics-upload-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    resolve: { alias: { "@shared": path.join(projectRoot, "src/shared") } },
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/renderer/src/services/media-diagnostics.ts"),
        formats: ["es"],
        fileName: () => "media-diagnostics.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const calls = [];
  let reply = { ok: true, data: { stored: false, enabled: false } };
  globalThis.window = {
    setInterval: () => 1,
    clearInterval: () => {},
    desktopApi: {
      uploadMediaDiagnostics: async (b) => {
        calls.push(JSON.parse(JSON.stringify(b)));
        return reply;
      },
    },
  };
  const { mediaDiagnostics: collector } = await import(pathToFileURL(path.join(outDir, "media-diagnostics.mjs")).href);
  const flush = () => collector["flush"]();

  collector.startSession("lobby-off");
  collector.record("session", "one");
  await flush();
  assert.equal(calls.length, 1, "the first batch is how the client learns diagnostics are off");
  for (let i = 0; i < 5; i += 1) {
    collector.record("session", `more-${i}`);
    await flush();
  }
  assert.equal(calls.length, 1, "DISABLED: after the server said enabled:false the session must stop uploading");
  await collector.endSession();
  assert.equal(calls.length, 1, "DISABLED: not even the final batch goes out");
  assert.equal(collector.isActive(), false, "the session still ends normally");

  // The next room asks once again: the setting can be turned back on.
  reply = { ok: true, data: { stored: true, enabled: true } };
  collector.startSession("lobby-on");
  collector.record("session", "two");
  await flush();
  collector.record("session", "three");
  await flush();
  await collector.endSession();
  const next = calls.slice(1);
  assert.equal(next.length, 3, "an enabled server gets every batch again");
  assert.ok(next.every((b) => b.lobbyId === "lobby-on"), "nothing from the switched-off session is sent later");
  assert.deepEqual(
    next.flatMap((b) => b.entries.map((e) => e.name)),
    ["session-started", "two", "three", "session-ended"],
    "the enabled session loses nothing",
  );
  assert.equal(next[2].final, true);

  // A failed upload (no answer) is not "switched off": it is retried as before.
  calls.length = 0;
  reply = { ok: false };
  collector.startSession("lobby-retry");
  collector.record("session", "kept");
  await flush();
  reply = { ok: true, data: { stored: true, enabled: true } };
  await collector.endSession();
  assert.deepEqual(
    calls[calls.length - 1].entries.map((e) => e.name),
    ["session-started", "kept", "session-ended"],
    "a failed upload must still be retried, not treated as switched off",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    `diagnostics-upload check passed (gzip on the wire, ${plain.length} -> ${wire.length} bytes, byte-exact after unpacking; a switched-off server stops the session's uploads; failures still retried)`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
