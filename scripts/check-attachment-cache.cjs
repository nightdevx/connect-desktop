#!/usr/bin/env node
// Acceptance check for the chat attachment cache (plan F4.3).
//
// Every image in a chat was downloaded in full (up to 5 MB) each time its
// message scrolled into view, every launch, every room switch: the server
// marks attachments immutable, but main fetched with no-store and kept
// nothing. 20 photos are ~40 MB per opening. What must hold:
//
//   ONCE      an attachment is downloaded once; later views read it from disk,
//             also after a restart (a new client over the same folder).
//   FAILURES  an error is not cached; the next view tries the network again.
//   CAP       the folder stays under its byte limit; the least recently VIEWED
//             files go first, so what is on screen survives.
//   SAFE      an attachment id cannot write outside the cache folder.
//   PRIVATE   signing out empties the cache (a shared PC must not keep one
//             account's DM photos for the next).
//
// Needs dist/ (build main first).
//   node scripts/check-attachment-cache.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const projectRoot = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requests = [];
let failNext = false;
const bytesFor = (id) => Buffer.alloc(300_000, id.length % 251); // 300 KB "photo"
const realLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === "electron") {
    return {
      app: { getPath: () => os.tmpdir(), isPackaged: false, on() {}, getVersion: () => "0.0.0" },
      net: {
        fetch: async (url) => {
          requests.push(String(url));
          if (failNext) {
            failNext = false;
            return new Response(JSON.stringify({ code: "NOT_FOUND", error: "gone" }), { status: 404, headers: { "content-type": "application/json" } });
          }
          const id = decodeURIComponent(String(url).split("/chat/attachments/")[1] ?? "");
          return new Response(bytesFor(id), { status: 200, headers: { "content-type": "image/png" } });
        },
      },
    };
  }
  return realLoad.call(this, request, ...rest);
};

const cacheModulePath = path.join(projectRoot, "dist/main/attachment-cache.js");
assert.ok(fs.existsSync(cacheModulePath), "dist/main/attachment-cache.js is missing (src/main/attachment-cache.ts, then build main)");
const { createAttachmentCache } = require(cacheModulePath);
const { BaseClient } = require(path.join(projectRoot, "dist/main/clients/base-client.js"));
const { ChatClient } = require(path.join(projectRoot, "dist/main/clients/chat-client.js"));
assert.equal(typeof createAttachmentCache, "function", "createAttachmentCache is not exported");

const folderBytes = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).reduce((sum, name) => sum + fs.statSync(path.join(dir, name)).size, 0) : 0;

const main = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ct-attach-"));
  const dir = path.join(root, "attachment-cache");
  const newClient = (maxBytes = 300 * 1024 * 1024) =>
    new ChatClient(new BaseClient("https://backend.test"), createAttachmentCache({ dir, maxBytes }));

  // --- ONCE ---------------------------------------------------------------------
  let client = newClient();
  const first = await client.fetchAttachment("tok", "att-1");
  assert.equal(requests.length, 1);
  assert.equal(first.mimeType, "image/png");
  assert.equal(first.size, 300_000);
  assert.ok(first.dataUrl.startsWith("data:image/png;base64,"));
  const second = await client.fetchAttachment("tok", "att-1");
  assert.equal(requests.length, 1, "ONCE: the second view of the same attachment went to the network");
  assert.deepEqual(second, first, "ONCE: the cached answer must be identical (data URL, type, size)");

  client = newClient(); // a restart: new objects, same folder
  await client.fetchAttachment("tok", "att-1");
  assert.equal(requests.length, 1, "ONCE: after a restart the attachment must come from disk");
  await client.fetchAttachment("tok", "att-2");
  assert.equal(requests.length, 2, "another attachment is its own download");

  // --- FAILURES -----------------------------------------------------------------
  failNext = true;
  await assert.rejects(() => client.fetchAttachment("tok", "att-3"), "a 404 must still fail");
  await client.fetchAttachment("tok", "att-3");
  assert.equal(requests.length, 4, "FAILURES: a failed download must not be cached");

  // --- SAFE -----------------------------------------------------------------------
  const outside = path.join(root, "escaped");
  await client.fetchAttachment("tok", `../escaped`).catch(() => undefined);
  await client.fetchAttachment("tok", `..\\..\\escaped`).catch(() => undefined);
  assert.ok(!fs.existsSync(outside), "SAFE: an attachment id wrote outside the cache folder");
  for (const name of fs.readdirSync(root)) {
    assert.ok(name === "attachment-cache", `SAFE: something was written beside the cache folder: ${name}`);
  }

  // --- CAP ------------------------------------------------------------------------
  const capped = path.join(root, "capped");
  const small = new ChatClient(new BaseClient("https://backend.test"), createAttachmentCache({ dir: capped, maxBytes: 1_000_000 }));
  await small.fetchAttachment("tok", "keep-me");
  for (let i = 0; i < 6; i += 1) {
    await sleep(20); // distinct access times on coarse file systems
    await small.fetchAttachment("tok", `photo-${i}`);
    await sleep(20);
    await small.fetchAttachment("tok", "keep-me"); // still on screen
  }
  assert.ok(folderBytes(capped) <= 1_000_000, `CAP: ${folderBytes(capped)} bytes on disk for a 1 MB limit`);
  const before = requests.length;
  await small.fetchAttachment("tok", "keep-me");
  assert.equal(requests.length, before, "CAP: the most recently viewed attachment was evicted");
  await small.fetchAttachment("tok", "photo-0");
  assert.equal(requests.length, before + 1, "CAP: the least recently viewed attachment should have been evicted");

  // --- PRIVATE --------------------------------------------------------------------
  const cache = createAttachmentCache({ dir, maxBytes: 300 * 1024 * 1024 });
  assert.equal(typeof cache.clear, "function", "the cache needs clear()");
  await cache.clear();
  assert.equal(folderBytes(dir), 0, "PRIVATE: clear() must leave no attachment on disk");
  const auth = fs.readFileSync(path.join(projectRoot, "src/main/ipc/handlers/auth-handlers.ts"), "utf8");
  const logout = auth.slice(auth.indexOf('"desktop:auth-logout"'), auth.indexOf("handle(", auth.indexOf('"desktop:auth-logout"') + 10));
  assert.match(logout, /attachment\w*\.clear\(|clearAttachmentCache\(/i, "PRIVATE: signing out must clear the attachment cache");

  // --- wiring -----------------------------------------------------------------------
  const backend = fs.readFileSync(path.join(projectRoot, "src/main/backend-client.ts"), "utf8");
  assert.match(backend, /new ChatClient\(\s*this\.base\s*,/, "the app's ChatClient must be built with a cache");
  const wiring = backend + fs.readFileSync(path.join(projectRoot, "src/main/attachment-cache.ts"), "utf8");
  assert.match(wiring, /attachment-cache/, "the cache folder is userData/attachment-cache");
  assert.match(wiring, /300\s*\*\s*1024\s*\*\s*1024|314_572_800/, "the app's limit is 300 MB");

  fs.rmSync(root, { recursive: true, force: true });
  console.log("attachment-cache check passed (downloaded once, kept across restarts, failures not cached, capped by last view, ids cannot escape, cleared on sign-out)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
