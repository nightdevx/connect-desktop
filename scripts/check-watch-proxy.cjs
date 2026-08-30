#!/usr/bin/env node
// Self-check: the loopback stream proxy's URL contract.
//
// Shared video from a direct page plays through a proxy on this app's own
// loopback server, because the CDN behind such a page usually refuses a request
// that arrives without the Referer and cookies the page itself sent. Three
// things have to agree for that to work, and none of them is visible when it
// stops agreeing — the video simply never starts:
//
//   * streamProxyPath must encode scheme, host, path and query into ONE path,
//   * serveStream must decode that path back to exactly the original URL,
//   * the manifest rewriters must produce paths of that same shape, for the
//     child playlists and every segment underneath them.
//
// The round trip below is the part worth pinning: a proxy that maps a URL onto
// a path it cannot map back is a 404 per segment, which looks like a dead
// stream rather than like a bug in a path split.
//
//   node scripts/check-watch-proxy.cjs

const assert = require("node:assert/strict");

const {
  STREAM_PREFIX,
  isPrivateAddress,
  rewriteDashManifest,
  rewriteHlsManifest,
  streamKind,
  streamProxyPath,
} = require("../dist/main/watch-stream-url");

const SID = "s1d2s3d4s5d6";

// How serveStream in watch-player-host.ts reads the path back. Kept here in the
// same shape so a change to one that is not made to the other fails loudly.
function decodeProxyPath(proxyPath) {
  const queryAt = proxyPath.indexOf("?");
  const rawPath = queryAt === -1 ? proxyPath : proxyPath.slice(0, queryAt);
  const rawQuery = queryAt === -1 ? "" : proxyPath.slice(queryAt + 1);
  const parts = rawPath.split("/");
  return {
    sid: parts[2],
    target: `${parts[3]}://${parts.slice(4).join("/")}${rawQuery ? `?${rawQuery}` : ""}`,
  };
}

const roundTrip = [
  "https://cdn.example.com/hls/master.m3u8",
  "https://cdn.example.com/hls/master.m3u8?token=abc&expires=123",
  "http://cdn.example.com:8080/a/b/c/seg-00001.ts",
  "https://cdn.example.com/a%20b/c.m3u8",
  "https://cdn.example.com/",
];

for (const original of roundTrip) {
  const proxied = streamProxyPath(original, SID);
  assert.ok(
    proxied.startsWith(`${STREAM_PREFIX}${SID}/`),
    `${original} did not land under the proxy prefix: ${proxied}`,
  );
  const decoded = decodeProxyPath(proxied);
  assert.equal(decoded.sid, SID, `session id lost for ${original}`);
  assert.equal(decoded.target, original, `round trip changed ${original}`);
}

// A scheme the proxy cannot fetch is left exactly as it was rather than being
// mangled into a path that resolves to nothing.
for (const untouched of ["blob:abc", "data:text/plain,x", "not a url"]) {
  assert.equal(streamProxyPath(untouched, SID), untouched, `${untouched} was rewritten`);
}

const master = rewriteHlsManifest(
  [
    "#EXTM3U",
    '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x0',
    "#EXT-X-STREAM-INF:BANDWIDTH=800000",
    "720/index.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=2400000",
    "https://other.cdn.example/1080/index.m3u8",
    "../shared/audio.m3u8",
    "",
  ].join("\n"),
  "https://cdn.example.com/hls/master.m3u8",
  SID,
);

assert.match(
  master,
  new RegExp(`URI="${STREAM_PREFIX}${SID}/https/cdn\\.example\\.com/hls/key\\.bin"`),
  "an encryption key URI has to be proxied too, or playback fails at the first segment",
);
assert.match(
  master,
  new RegExp(`^${STREAM_PREFIX}${SID}/https/cdn\\.example\\.com/hls/720/index\\.m3u8$`, "m"),
  "a relative variant playlist was not proxied",
);
assert.match(
  master,
  new RegExp(`^${STREAM_PREFIX}${SID}/https/other\\.cdn\\.example/1080/index\\.m3u8$`, "m"),
  "a cross-host variant playlist was not proxied",
);
assert.match(
  master,
  new RegExp(`^${STREAM_PREFIX}${SID}/https/cdn\\.example\\.com/shared/audio\\.m3u8$`, "m"),
  "a ../ relative path was not resolved before proxying",
);
assert.match(master, /^#EXT-X-STREAM-INF:BANDWIDTH=800000$/m, "a tag line was altered");
assert.match(master, /^#EXTM3U$/m, "the playlist header was altered");

// DASH is the opposite rule, and deliberately: the player expands $Number$
// itself, so absolutising a template would bake the literal text into a path it
// can no longer substitute into.
const dash = rewriteDashManifest(
  '<BaseURL>https://cdn.example.com/d/</BaseURL>' +
    '<SegmentTemplate media="seg-$Number$.m4s" initialization="init.mp4"/>',
  SID,
);
assert.match(
  dash,
  new RegExp(`<BaseURL>${STREAM_PREFIX}${SID}/https/cdn\\.example\\.com/d/</BaseURL>`),
  "an absolute DASH BaseURL was not proxied",
);
assert.match(dash, /media="seg-\$Number\$\.m4s"/, "a DASH segment template was rewritten");

const kinds = {
  "https://x.example/a/master.m3u8": "hls",
  "https://x.example/a/master.m3u8?t=1": "hls",
  "https://x.example/a/manifest.mpd": "dash",
  "https://x.example/a/film.mp4": "mp4",
  "https://x.example/a/film.webm": "webm",
  "https://x.example/a/page.html": "",
};
for (const [url, expected] of Object.entries(kinds)) {
  assert.equal(streamKind(url), expected, `streamKind(${url})`);
}
// A CDN that serves a playlist from an extensionless path is ordinary; the
// content type is the only thing that identifies it.
assert.equal(streamKind("https://x.example/play", "application/vnd.apple.mpegurl"), "hls");
assert.equal(streamKind("https://x.example/play", "application/dash+xml"), "dash");

// One member must not be able to walk everybody else's proxy onto their own
// network, and a manifest can name any host it likes.
const blocked = [
  "127.0.0.1",
  "10.1.2.3",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "169.254.169.254",
  "0.0.0.0",
  "100.64.0.1",
  "::1",
  "::",
  "fd00::1",
  "fe80::1",
  "::ffff:127.0.0.1",
  "not-an-address",
];
for (const address of blocked) {
  assert.equal(isPrivateAddress(address), true, `${address} should be refused`);
}

const allowed = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "2606:4700::1111"];
for (const address of allowed) {
  assert.equal(isPrivateAddress(address), false, `${address} should be allowed`);
}

console.log(
  `watch-proxy self-check passed (${roundTrip.length} round trips, manifests rewritten both ways, ${blocked.length} addresses refused)`,
);
