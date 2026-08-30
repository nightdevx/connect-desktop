#!/usr/bin/env node
// Self-check: somebody has to speak first, and it cannot be the frame.
//
// Both shared-video players live in an iframe on the loopback host and talk to
// the renderer over postMessage. A frame cannot post anything until it knows
// the renderer's origin, and it learns that ONLY by receiving a message. So a
// frame that announces itself at load writes into nowhere, and a renderer that
// waits for that announcement before it says anything waits forever. The panel
// sits on "yükleniyor" and nothing anywhere reports an error.
//
// That is exactly how the direct player shipped. The YouTube page survived by
// luck: its ready fires from onReady, which lands after the API loads, by which
// time a hello had arrived. Timing, not design -- so both are pinned here.
//
// The second trap is the target origin. A packaged renderer is loaded with
// loadFile, so its origin reaches the frame as the string "null", which
// postMessage cannot parse as a target. Development runs over http and never
// sees it; the installed build would have.
//
//   node scripts/check-watch-handshake.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const hostSource = fs.readFileSync(path.join(ROOT, "src/main/watch-player-host.ts"), "utf8");
const playerSource = fs.readFileSync(
  path.join(ROOT, "src/renderer/src/features/watch/watch-player.tsx"),
  "utf8",
);

function section(name, startMarker) {
  const start = hostSource.indexOf(startMarker);
  assert.notEqual(start, -1, `${name}: ${startMarker} not found`);
  const end = hostSource.indexOf("</html>`", start);
  assert.notEqual(end, -1, `${name}: end of document not found`);
  return hostSource.slice(start, end);
}

const pages = {
  youtube: section("youtube", "const PLAYER_HTML"),
  direct: section("direct", "const DIRECT_HTML"),
};

for (const [name, page] of Object.entries(pages)) {
  assert.ok(
    /function announce\(\)/.test(page),
    `${name}: no announce() -- ready has to be posted once the parent is known, not at load`,
  );

  const readyPosts = page.match(/post\(\{\s*type:\s*"ready"/g) ?? [];
  assert.equal(
    readyPosts.length,
    1,
    `${name}: ready is posted ${readyPosts.length} times; it belongs in announce() and nowhere else`,
  );

  const announceBody = page.slice(page.indexOf("function announce()"));
  assert.ok(
    announceBody.indexOf('post({ type: "ready"') < announceBody.indexOf("\n  }\n"),
    `${name}: the ready post is outside announce()`,
  );

  assert.ok(
    /parentTarget\s*=\s*event\.origin === "null" \? "\*" : event\.origin/.test(page),
    `${name}: a file:// parent arrives as origin "null" and postMessage cannot target it`,
  );
  assert.ok(
    /parent\.postMessage\(message, parentTarget\)/.test(page),
    `${name}: replies must go to parentTarget, not to the raw origin`,
  );
  assert.ok(
    /announce\(\);/.test(page.slice(page.indexOf('addEventListener("message"'))),
    `${name}: the message handler must announce once it has learned the origin`,
  );
}

assert.ok(
  /type:\s*"hello"/.test(playerSource),
  "the renderer never says hello, so no frame can ever learn its origin",
);
assert.ok(
  /setInterval\(hello/.test(playerSource),
  "hello is sent once; a frame still loading misses it and the handshake never completes",
);
assert.ok(
  /setFrameReady\(false\)/.test(playerSource),
  "switching between a YouTube video and a direct page loads a new frame, which has to shake hands again",
);

console.log(
  `watch-handshake self-check passed (${Object.keys(pages).length} pages announce on contact, renderer speaks first, file:// origin handled)`,
);
