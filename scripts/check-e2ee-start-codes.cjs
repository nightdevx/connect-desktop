#!/usr/bin/env node
// Self-check for patches/livekit-client@<version>.patch (livekit/client-sdk-js#2144).
//
// 1:1 calls are end-to-end encrypted. Intel Quick Sync's H.264 encoder writes
// 3-byte Annex B start codes; WebRTC's depacketizer rebuilds them as 4-byte
// ones, so the header the receiver feeds AES-GCM as additional data no longer
// matches what the sender authenticated. Every frame fails to decrypt and the
// call shows no video (livekit/client-sdk-js#2140). Most Connect publishers
// encode on Quick Sync.
//
// The fix lives in livekit-client's main branch but in no release yet, so it is
// applied with `pnpm patch`. A livekit-client upgrade drops the patch silently
// unless the new version already contains the fix. This check fails in that
// case, and it runs the patched function against the upstream test vectors.
//
//   node scripts/check-e2ee-start-codes.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dist = path.join(__dirname, "..", "node_modules", "livekit-client", "dist");
const esm = fs.readFileSync(path.join(dist, "livekit-client.e2ee.worker.mjs"), "utf8");
const cjs = fs.readFileSync(path.join(dist, "livekit-client.e2ee.worker.js"), "utf8");

// The encoder authenticates the normalized header, not a view of the raw frame.
assert.ok(
  esm.includes("frameHeader = normalizeAnnexBStartCodes(frameHeader);"),
  "e2ee worker (esm) does not normalize the header: the livekit-client patch is missing",
);
assert.ok(
  esm.includes("additionalData: frameHeader\n"),
  "e2ee worker (esm) still authenticates the raw header",
);
assert.ok(
  cjs.includes("additionalData:c}") && cjs.includes("__lkNormalizeAnnexBStartCodes(c)"),
  "e2ee worker (cjs) is not patched",
);

// Pull the function out of the bundle and run it.
const start = esm.indexOf("function normalizeAnnexBStartCodes(");
const end = esm.indexOf("class FrameCryptor extends BaseFrameCryptor");
assert.ok(start >= 0 && end > start, "normalizeAnnexBStartCodes not found in the e2ee worker");
const normalize = new Function(`${esm.slice(start, end)}; return normalizeAnnexBStartCodes;`)();

const eq = (input, expected, label) =>
  assert.deepEqual(Array.from(normalize(new Uint8Array(input))), expected, label);

eq(
  [0, 0, 1, 0x67, 0x64, 0, 0, 1, 0x68, 0xee, 0, 0, 1, 0x65, 0x88],
  [0, 0, 0, 1, 0x67, 0x64, 0, 0, 0, 1, 0x68, 0xee, 0, 0, 0, 1, 0x65, 0x88],
  "3-byte start codes become 4-byte",
);
eq(
  [0, 0, 0, 1, 0x67, 0x64, 0, 0, 1, 0x68, 0xee, 0, 0, 0, 1, 0x06, 0x05, 0, 0, 1, 0x65, 0x88],
  [0, 0, 0, 1, 0x67, 0x64, 0, 0, 0, 1, 0x68, 0xee, 0, 0, 0, 1, 0x06, 0x05, 0, 0, 0, 1, 0x65, 0x88],
  "only the short start codes change when mixed with 4-byte ones",
);
const four = new Uint8Array([0, 0, 0, 1, 0x41, 0x9a]);
assert.equal(normalize(four), four, "a header with only 4-byte start codes is returned as is");
eq([0x41, 0x9a, 0x21], [0x41, 0x9a, 0x21], "no start code at all");

console.log("e2ee start-code self-check passed (livekit-client#2144 patch present, 4 vectors)");
