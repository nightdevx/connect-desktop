#!/usr/bin/env node
// Acceptance check for what screen-share previews cost on the wire (plan F4.2).
//
// While someone shares, every viewer's tile fetched the same 480 px JPEG every
// 20 s, changed or not, and kept doing it with the window minimised. The
// server now answers an unchanged frame with a bodiless 304 (ETag). What must
// hold on this side:
//
//   REVALIDATE  the main process sends If-None-Match with the ETag it got,
//               exactly as received (Traefik may hand back a weak W/ tag),
//               and turns a 304 into the frame it already has.
//   MISSES      a 404 still fails and forgets the old frame; previews of
//               different people do not mix; the remembered frames are capped.
//   HIDDEN      a minimised or hidden window does not poll; it fetches once
//               as soon as it is shown again.
//   SHARER      a still screen is not uploaded again and again: an identical
//               frame is skipped, but re-sent within a minute so the server's
//               2-minute expiry never hides a live share.
//   SIZE        the preview is 320 px wide at JPEG quality 0.6.
//
// Needs dist/ (build main first), like check-diagnostics-upload.
//   node scripts/check-stream-preview-traffic.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");
const hookDir = path.join(projectRoot, "src/renderer/src/features/workspace/hooks/media");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- main process --------------------------------------------------------------
const sent = [];
let answers = [];
const realLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === "electron") {
    return {
      net: {
        fetch: async (url, init) => {
          sent.push({ url: String(url), init });
          const next = answers.shift();
          assert.ok(next, `unexpected request to ${url}`);
          return next();
        },
      },
    };
  }
  return realLoad.call(this, request, ...rest);
};
const { BaseClient } = require(path.join(projectRoot, "dist/main/clients/base-client.js"));
const { LobbyClient } = require(path.join(projectRoot, "dist/main/clients/lobby-client.js"));

const headerOf = (init, name) => {
  const headers = init.headers ?? {};
  if (typeof headers.get === "function") return headers.get(name) ?? undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
};
const frame = (image, etag, capturedAt = "2026-11-27T10:00:00Z") => () =>
  new Response(JSON.stringify({ image, capturedAt }), {
    status: 200,
    headers: { "content-type": "application/json", etag, "cache-control": "private, no-cache" },
  });
const notModified = (etag) => () => new Response(null, { status: 304, headers: { etag } });
const missing = () => () =>
  new Response(JSON.stringify({ code: "STREAM_PREVIEW_NOT_FOUND", error: "no preview" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });

const mainChecks = async () => {
  const client = new LobbyClient(new BaseClient("https://backend.test"));
  const get = (userId = "u1", lobbyId = "room") => client.getStreamPreview("tok", lobbyId, userId);

  answers = [frame("data:image/jpeg;base64,AAA", '"e1"')];
  assert.deepEqual(await get(), { image: "data:image/jpeg;base64,AAA", capturedAt: "2026-11-27T10:00:00Z" });
  assert.equal(headerOf(sent[0].init, "If-None-Match"), undefined, "the first fetch has nothing to revalidate");

  answers = [notModified('"e1"')];
  const again = await get();
  assert.equal(headerOf(sent[1].init, "If-None-Match"), '"e1"', "REVALIDATE: the second fetch must send the ETag it got");
  assert.deepEqual(again, { image: "data:image/jpeg;base64,AAA", capturedAt: "2026-11-27T10:00:00Z" },
    "REVALIDATE: a 304 must come back as the frame already held, not as an error");

  answers = [frame("data:image/jpeg;base64,BBB", 'W/"e2"', "2026-11-27T10:00:20Z")];
  assert.equal((await get()).image, "data:image/jpeg;base64,BBB", "a changed frame replaces the old one");
  answers = [notModified('W/"e2"')];
  assert.equal((await get()).image, "data:image/jpeg;base64,BBB");
  assert.equal(headerOf(sent[3].init, "If-None-Match"), 'W/"e2"', "REVALIDATE: a weak ETag is sent back exactly as received");

  // Another person's preview is its own entry.
  answers = [frame("data:image/jpeg;base64,CCC", '"x1"')];
  await get("u2");
  assert.equal(headerOf(sent[4].init, "If-None-Match"), undefined, "MISSES: previews of different people must not share a validator");
  answers = [frame("data:image/jpeg;base64,DDD", '"y1"')];
  await get("u1", "other-room");
  assert.equal(headerOf(sent[5].init, "If-None-Match"), undefined, "MISSES: the same person in another room is another preview");

  // A 404 fails as before and forgets the frame.
  answers = [missing()];
  await assert.rejects(() => get(), "MISSES: a 404 must still fail");
  answers = [frame("data:image/jpeg;base64,EEE", '"e3"')];
  await get();
  assert.equal(headerOf(sent[7].init, "If-None-Match"), undefined, "MISSES: after a 404 the old ETag must not be sent again");

  // The remembered frames are capped: 60 other previews push the first one out.
  for (let i = 0; i < 60; i += 1) {
    answers = [frame(`data:image/jpeg;base64,F${i}`, `"f${i}"`)];
    await get(`viewer-${i}`);
  }
  sent.length = 0;
  answers = [frame("data:image/jpeg;base64,EEE", '"e3"')];
  await get();
  assert.equal(headerOf(sent[0].init, "If-None-Match"), undefined, "MISSES: the cache must be capped (at most 50 frames kept)");

  // Other requests are untouched.
  sent.length = 0;
  answers = [() => new Response(JSON.stringify({ accepted: true }), { status: 200, headers: { "content-type": "application/json" } })];
  await client.putStreamPreview("tok", "room", "data:image/jpeg;base64,ZZZ");
  assert.equal(headerOf(sent[0].init, "If-None-Match"), undefined);
};

// --- renderer: polling and the sharer's skip rule ------------------------------
const rendererChecks = async () => {
  const entry = path.join(hookDir, "stream-preview-poll.ts");
  assert.ok(fs.existsSync(entry), "stream-preview-poll.ts (the pure polling rules) is missing");
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-preview-poll-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: { entry, formats: ["es"], fileName: () => "stream-preview-poll.mjs" },
    },
  });
  const built = fs.readdirSync(outDir).find((f) => f.endsWith(".mjs"));
  const { startPreviewPoll, shouldPostPreview } = await import(pathToFileURL(path.join(outDir, built)).href);
  assert.equal(typeof startPreviewPoll, "function", "startPreviewPoll is not exported");
  assert.equal(typeof shouldPostPreview, "function", "shouldPostPreview is not exported");

  // startPreviewPoll({ load, isHidden, onVisibilityChange, intervalMs }) => stop
  let hidden = false;
  let notify = null;
  let loads = 0;
  const stop = startPreviewPoll({
    load: () => { loads += 1; },
    isHidden: () => hidden,
    onVisibilityChange: (cb) => { notify = cb; return () => { notify = null; }; },
    intervalMs: 40,
  });
  assert.equal(loads, 1, "the first frame is fetched at once");
  await sleep(130);
  assert.ok(loads >= 3 && loads <= 5, `visible: ~3 polls in 130 ms at 40 ms, got ${loads - 1}`);
  hidden = true;
  notify?.();
  const whileHidden = loads;
  await sleep(200);
  assert.equal(loads, whileHidden, `HIDDEN: ${loads - whileHidden} fetches while the window was hidden`);
  hidden = false;
  assert.ok(notify, "the poll must listen for visibility changes");
  notify();
  assert.equal(loads, whileHidden + 1, "HIDDEN: shown again, it fetches at once");
  await sleep(90);
  assert.ok(loads >= whileHidden + 2, "and polls again after that");
  stop();
  const afterStop = loads;
  await sleep(120);
  assert.equal(loads, afterStop, "stop() ends the polling");
  assert.equal(notify, null, "stop() removes the visibility listener");

  // Hidden from the start: nothing until shown.
  hidden = true;
  loads = 0;
  const stop2 = startPreviewPoll({
    load: () => { loads += 1; },
    isHidden: () => hidden,
    onVisibilityChange: (cb) => { notify = cb; return () => { notify = null; }; },
    intervalMs: 40,
  });
  await sleep(100);
  assert.equal(loads, 0, "HIDDEN: a window hidden from the start does not fetch");
  hidden = false;
  notify();
  assert.equal(loads, 1);
  stop2();

  // shouldPostPreview(image, last: { image, atMs } | null, nowMs)
  assert.equal(shouldPostPreview("A", null, 0), true, "the first frame is always sent");
  assert.equal(shouldPostPreview("B", { image: "A", atMs: 0 }, 20_000), true, "a changed frame is sent");
  assert.equal(shouldPostPreview("A", { image: "A", atMs: 0 }, 20_000), false, "SHARER: an identical frame 20 s later is skipped");
  assert.equal(shouldPostPreview("A", { image: "A", atMs: 0 }, 40_000), false, "SHARER: and 40 s later");
  assert.equal(shouldPostPreview("A", { image: "A", atMs: 0 }, 60_000), true, "SHARER: re-sent within a minute so the 2-minute expiry never hides it");
  fs.rmSync(outDir, { recursive: true, force: true });

  // SIZE, and the hook really uses the rules above.
  const hook = fs.readFileSync(path.join(hookDir, "use-stream-preview.ts"), "utf8");
  assert.match(hook, /PREVIEW_WIDTH\s*=\s*320\b/, "SIZE: preview width must be 320 px");
  assert.match(hook, /PREVIEW_QUALITY\s*=\s*0\.6\b/, "SIZE: JPEG quality must be 0.6");
  assert.match(hook, /startPreviewPoll\(/, "the viewer hook must poll through startPreviewPoll");
  assert.match(hook, /shouldPostPreview\(/, "the sharer must decide through shouldPostPreview");
  assert.match(hook, /visibilitychange/, "the hook must feed document visibility to the poll");
};

const main = async () => {
  await mainChecks();
  Module._load = realLoad;
  await rendererChecks();
  console.log("stream-preview traffic check passed (ETag revalidation with 304 reuse, misses and cap, no polling while hidden, still frames not re-sent within a minute, 320 px at 0.6)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
