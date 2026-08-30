import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

import {
  isPrivateAddress,
  rewriteDashManifest,
  rewriteHlsManifest,
  STREAM_PREFIX,
  streamKind,
} from "./watch-stream-url";

/**
 * A loopback origin for the shared-video player, and the reason one is needed.
 *
 * The packaged renderer is loaded with `loadFile`, so its origin is `file://`.
 * YouTube's IFrame API is driven entirely by postMessage and validates the
 * embedding page's origin against the `origin` parameter it was given; `file://`
 * is not an origin it will hand a player to, so in a packaged build the embed
 * loads and then never becomes controllable — no ready event, no seeking, no
 * sync. It works in development purely because Vite serves the renderer over
 * http://localhost.
 *
 * Rather than move the whole renderer to a custom scheme — which would relocate
 * its origin and with it every setting already in localStorage — this serves one
 * page, on loopback, that the renderer embeds in an iframe. That page gets an
 * ordinary `http://127.0.0.1:<port>` origin, which YouTube accepts, and it talks
 * to the renderer over postMessage.
 *
 * Bound to 127.0.0.1 on an ephemeral port, and it serves exactly one document
 * and nothing else: no file system access, no directory listing, no path
 * handling of any kind. The token in the URL is checked before the page is
 * returned, so another local process cannot even read the page.
 */

const PLAYER_PATH = "/player";

let server: Server | null = null;
let origin = "";
const token = randomBytes(16).toString("hex");

/**
 * The page hosting the YouTube player.
 *
 * The video id is NOT baked in here. It arrives over postMessage from the
 * renderer after the frame loads, so this document is a constant string with no
 * interpolation in it at all — there is nothing to escape and no way to inject.
 * The id is validated again on this side before it reaches the player.
 */
const PLAYER_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; style-src 'unsafe-inline'; connect-src https://www.youtube.com">
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #player { width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<div id="player"></div>
<script>
(function () {
  "use strict";

  // The renderer is the only thing allowed to drive this frame. Its origin is
  // whatever embedded us, captured once from the first message and never
  // widened; every reply goes back to exactly that.
  var parentOrigin = null;
  var parentTarget = null;
  var player = null;
  var ready = false;
  var pending = null;

  // Same shape the backend enforces: eleven URL-safe base64 characters. Checked
  // again here because this frame is a separate origin and must not trust what
  // it is handed.
  var VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

  function post(message) {
    if (parentTarget) {
      parent.postMessage(message, parentTarget);
    }
  }

  // The player becomes ready on its own schedule and the parent speaks on its
  // own; whichever happens second is what announces. Announcing from onReady
  // alone loses the message when the API loads before the first hello arrives.
  var announced = false;
  function announce() {
    if (announced || !ready || !parentTarget) {
      return;
    }
    announced = true;
    post({ type: "ready" });
  }

  function apply(command) {
    if (!ready || !player) {
      pending = command;
      return;
    }
    try {
      if (command.type === "load") {
        if (!VIDEO_ID.test(command.videoId)) {
          return;
        }
        player.loadVideoById({
          videoId: command.videoId,
          startSeconds: Math.max(0, Number(command.position) || 0),
        });
        if (!command.playing) {
          player.pauseVideo();
        }
        return;
      }
      if (command.type === "play") {
        if (typeof command.position === "number") {
          player.seekTo(command.position, true);
        }
        player.playVideo();
        return;
      }
      if (command.type === "pause") {
        if (typeof command.position === "number") {
          player.seekTo(command.position, true);
        }
        player.pauseVideo();
        return;
      }
      if (command.type === "seek") {
        player.seekTo(command.position, true);
        return;
      }
      if (command.type === "mute") {
        if (command.muted) { player.mute(); } else { player.unMute(); }
        return;
      }
      if (command.type === "volume") {
        player.setVolume(Math.max(0, Math.min(100, Number(command.volume) || 0)));
        return;
      }
    } catch (error) {
      post({ type: "error", message: String(error) });
    }
  }

  window.addEventListener("message", function (event) {
    if (!event.data || typeof event.data !== "object") {
      return;
    }
    if (parentOrigin === null) {
      parentOrigin = event.origin;
      // A packaged renderer is loaded with loadFile, so its origin arrives as
      // the string "null", which postMessage cannot parse as a target. The
      // parent checks our origin on every message it receives regardless.
      parentTarget = event.origin === "null" ? "*" : event.origin;
      announce();
    } else if (event.origin !== parentOrigin) {
      return;
    }
    apply(event.data);
  });

  // Reported continuously rather than on request: the renderer's drift check
  // runs on a timer, and a request/response round trip per tick would be a
  // postMessage pair a second for the whole session.
  setInterval(function () {
    if (!ready || !player) {
      return;
    }
    try {
      // getVideoData is undocumented but stable, and it is the only place the
      // title exists: the renderer never fetches anything from YouTube, so
      // without this the room would show a video with no name for its whole
      // length. Guarded because a player mid-load has no data yet.
      var data = null;
      if (typeof player.getVideoData === "function") {
        data = player.getVideoData();
      }

      post({
        type: "tick",
        position: player.getCurrentTime(),
        duration: player.getDuration(),
        title: data && typeof data.title === "string" ? data.title : "",
        // 1 = playing, 2 = paused, 0 = ended, 3 = buffering.
        state: player.getPlayerState(),
      });
    } catch (error) {
      // A player mid-load throws rather than answering; the next tick is 250ms
      // away and there is nothing useful to report meanwhile.
    }
  }, 250);

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player("player", {
      width: "100%",
      height: "100%",
      playerVars: {
        // No YouTube chrome: this app draws its own controls, and the room's
        // playback is not something one viewer's click should move.
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        fs: 0,
        iv_load_policy: 3,
        playsinline: 1,
      },
      events: {
        onReady: function () {
          ready = true;
          announce();
          if (pending) {
            var command = pending;
            pending = null;
            apply(command);
          }
        },
        onStateChange: function (event) {
          post({ type: "state", state: event.data });
        },
        onError: function (event) {
          // 101 and 150 both mean the uploader disallowed embedding, which is
          // the one failure a viewer can do nothing about and therefore the one
          // worth naming.
          post({ type: "player-error", code: event.data });
        },
      },
    });
  };

  var api = document.createElement("script");
  api.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(api);
}());
</script>
</body>
</html>`;

const DIRECT_PATH = "/direct";
const HLS_PATH = "/hls.js";
const STREAM_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

const PASS_THROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

interface StreamSession {
  headers: Record<string, string>;
  expiresAt: number;
}

const streamSessions = new Map<string, StreamSession>();

export function registerStreamSession(headers: Record<string, string>): string {
  const sid = randomBytes(12).toString("base64url");
  streamSessions.set(sid, { headers, expiresAt: Date.now() + STREAM_SESSION_TTL_MS });
  for (const [key, value] of streamSessions) {
    if (value.expiresAt < Date.now()) {
      streamSessions.delete(key);
    }
  }
  return sid;
}

/**
 * The page that plays a stream the local resolver found.
 *
 * Same postMessage protocol the YouTube page speaks, so the renderer's drift
 * loop, describe and volume handling are shared rather than duplicated. Like
 * that page this is a constant with no interpolation in it: the stream URL
 * arrives over postMessage, and hls.js is fetched from a path that carries no
 * secret, so the token never has to be spliced into markup.
 *
 * Everything it loads is same-origin on this loopback server, including every
 * segment — the proxy below is what puts the original Referer and cookies back
 * on requests the CDN would otherwise refuse.
 */
const DIRECT_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; worker-src blob:; style-src 'unsafe-inline'">
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  video { width: 100%; height: 100%; background: #000; display: block; }
</style>
</head>
<body>
<video id="v" playsinline></video>
<script src="/hls.js"></script>
<script>
(function () {
  "use strict";

  var parentOrigin = null;
  var parentTarget = null;
  var announced = false;
  var video = document.getElementById("v");
  var hls = null;
  var loadedSrc = "";

  function post(message) {
    if (parentTarget) {
      parent.postMessage(message, parentTarget);
    }
  }

  // Announced only once the parent has spoken, never at load: nothing can be
  // posted before its origin is known, so a "ready" sent from this script's own
  // top level is written to nowhere and the renderer waits for it forever.
  function announce() {
    if (announced || !parentTarget) {
      return;
    }
    announced = true;
    post({ type: "ready" });
  }

  // The renderer's drift loop reads these as YouTube player states, so they are
  // reported in YouTube's numbering: 0 ended, 1 playing, 2 paused, 3 buffering.
  function playerState() {
    if (video.ended) return 0;
    if (video.readyState < 3 || video.seeking) return 3;
    return video.paused ? 2 : 1;
  }

  function detach() {
    if (hls) {
      try { hls.destroy(); } catch (e) {}
      hls = null;
    }
    video.removeAttribute("src");
    try { video.load(); } catch (e) {}
  }

  function load(command) {
    if (typeof command.src !== "string" || command.src.charAt(0) !== "/") {
      return;
    }
    if (loadedSrc === command.src) {
      return;
    }
    loadedSrc = command.src;
    detach();

    var startAt = Math.max(0, Number(command.position) || 0);
    var onReady = function () {
      if (startAt > 0.5) {
        try { video.currentTime = startAt; } catch (e) {}
      }
      if (command.playing) {
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      }
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });

    if (command.kind === "hls" && window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({ enableWorker: true, backBufferLength: 60, maxBufferLength: 30 });
      hls.on(window.Hls.Events.ERROR, function (_evt, data) {
        if (!data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(); return; }
        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        post({ type: "player-error", code: 2 });
      });
      hls.loadSource(command.src);
      hls.attachMedia(video);
      return;
    }

    if (command.kind === "dash") {
      // Chromium plays no DASH and hls.js does not speak it. Nothing here can
      // make it play, and saying so beats an empty black frame.
      post({ type: "player-error", code: 3 });
      return;
    }

    video.src = command.src;
  }

  function apply(command) {
    try {
      if (command.type === "load") { load(command); return; }
      if (command.type === "play") {
        if (typeof command.position === "number") { video.currentTime = command.position; }
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
        return;
      }
      if (command.type === "pause") {
        if (typeof command.position === "number") { video.currentTime = command.position; }
        video.pause();
        return;
      }
      if (command.type === "seek") {
        if (typeof command.position === "number") { video.currentTime = command.position; }
        return;
      }
      if (command.type === "mute") { video.muted = !!command.muted; return; }
      if (command.type === "volume") {
        video.volume = Math.max(0, Math.min(1, (Number(command.volume) || 0) / 100));
        return;
      }
    } catch (error) {
      post({ type: "error", message: String(error) });
    }
  }

  window.addEventListener("message", function (event) {
    if (!event.data || typeof event.data !== "object") {
      return;
    }
    if (parentOrigin === null) {
      parentOrigin = event.origin;
      // A packaged renderer is loaded with loadFile, so its origin arrives as
      // the string "null", which postMessage cannot parse as a target. The
      // parent checks our origin on every message it receives regardless.
      parentTarget = event.origin === "null" ? "*" : event.origin;
      announce();
    } else if (event.origin !== parentOrigin) {
      return;
    }
    apply(event.data);
  });

  video.addEventListener("error", function () {
    post({ type: "player-error", code: video.error ? video.error.code : 0 });
  });
  video.addEventListener("play", function () { post({ type: "state", state: 1 }); });
  video.addEventListener("pause", function () { post({ type: "state", state: 2 }); });
  video.addEventListener("ended", function () { post({ type: "state", state: 0 }); });

  setInterval(function () {
    try {
      post({
        type: "tick",
        position: video.currentTime || 0,
        duration: isFinite(video.duration) ? video.duration : 0,
        title: "",
        state: playerState(),
      });
    } catch (error) {
      // A player mid-load has nothing to report; the next tick is 250ms away.
    }
  }, 250);
}());
</script>
</body>
</html>`;

function endWith(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function serveHlsLibrary(response: ServerResponse): Promise<void> {
  try {
    const file = await readFile(require.resolve("hls.js/dist/hls.min.js"));
    response.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(file);
  } catch {
    endWith(response, 500, "hls.js not found");
  }
}

async function serveStream(
  request: IncomingMessage,
  response: ServerResponse,
  rawPath: string,
  rawQuery: string,
): Promise<void> {
  const parts = rawPath.split("/");
  const sid = parts[2];
  const scheme = parts[3];
  const rest = parts.slice(4).join("/");

  const session = streamSessions.get(sid ?? "");
  if (!session || session.expiresAt < Date.now()) {
    endWith(response, 403, "stream session expired");
    return;
  }
  if ((scheme !== "http" && scheme !== "https") || !rest) {
    endWith(response, 400, "bad target");
    return;
  }

  let target: URL;
  try {
    target = new URL(`${scheme}://${rest}${rawQuery ? `?${rawQuery}` : ""}`);
  } catch {
    endWith(response, 400, "bad target");
    return;
  }

  // The same gate the resolver applies to the page: a manifest is remote data,
  // and a segment URL inside it must not be able to walk this proxy onto the
  // viewer's own network.
  const addresses = await lookup(target.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    endWith(response, 403, "blocked address");
    return;
  }

  const outgoing: Record<string, string> = { ...session.headers, "accept-encoding": "identity" };
  if (typeof request.headers.range === "string") {
    outgoing.range = request.headers.range;
  }

  const controller = new AbortController();
  request.on("close", () => controller.abort());

  let upstream: Response;
  try {
    upstream = await fetch(target.href, {
      headers: outgoing,
      redirect: "follow",
      signal: controller.signal,
    });
  } catch {
    if (!controller.signal.aborted) {
      endWith(response, 502, "upstream unreachable");
    }
    return;
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const kind = streamKind(upstream.url || target.href, contentType);

  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  for (const name of PASS_THROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  }

  if (kind === "hls" || kind === "dash") {
    const text = await upstream.text();
    const base = upstream.url || target.href;
    const body =
      kind === "hls" ? rewriteHlsManifest(text, base, sid) : rewriteDashManifest(text, sid);
    delete headers["content-length"];
    headers["Content-Type"] =
      kind === "hls" ? "application/vnd.apple.mpegurl" : "application/dash+xml";
    response.writeHead(upstream.status, headers);
    response.end(body);
    return;
  }

  response.writeHead(upstream.status, headers);
  if (!upstream.body) {
    response.end();
    return;
  }
  Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(response);
}

export async function watchDirectPlayerURL(): Promise<string> {
  await watchPlayerURL();
  return `${origin}${DIRECT_PATH}?t=${token}`;
}

/**
 * Starts the player host if it is not already running and returns the URL the
 * renderer should embed. Idempotent.
 */
export async function watchPlayerURL(): Promise<string> {
  if (server && origin) {
    return `${origin}${PLAYER_PATH}?t=${token}`;
  }

  await new Promise<void>((resolve, reject) => {
    const created = createServer((request, response) => {
      // Kept raw rather than parsed: a stream path carries the origin's own
      // percent-encoding, and decoding it here would hand the CDN back a URL it
      // never issued.
      const raw = request.url ?? "/";
      const queryAt = raw.indexOf("?");
      const rawPath = queryAt === -1 ? raw : raw.slice(0, queryAt);
      const rawQuery = queryAt === -1 ? "" : raw.slice(queryAt + 1);
      const suppliedToken = new URLSearchParams(rawQuery).get("t");

      if (rawPath.startsWith(STREAM_PREFIX)) {
        // No token here: the session id in the path is itself the secret, and
        // hls.js resolves segment URLs relative to the manifest, which would
        // drop a query parameter this side had added.
        void serveStream(request, response, rawPath, rawQuery).catch(() => {
          if (!response.headersSent) {
            endWith(response, 502, "stream failed");
          }
        });
        return;
      }

      if (rawPath === HLS_PATH) {
        // A public library file with no secret in it, so it needs no token —
        // which is what lets DIRECT_HTML stay a constant with nothing spliced
        // into it.
        void serveHlsLibrary(response);
        return;
      }

      if ((rawPath === PLAYER_PATH || rawPath === DIRECT_PATH) && suppliedToken === token) {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(rawPath === PLAYER_PATH ? PLAYER_HTML : DIRECT_HTML);
        return;
      }

      endWith(response, 404, "not found");
    });

    created.on("error", reject);
    // Loopback only. An ephemeral port so nothing has to be reserved and two
    // copies of the app cannot collide.
    created.listen(0, "127.0.0.1", () => {
      const address = created.address() as AddressInfo;
      origin = `http://127.0.0.1:${address.port}`;
      server = created;
      resolve();
    });
  });

  return `${origin}${PLAYER_PATH}?t=${token}`;
}

export function stopWatchPlayerHost(): void {
  streamSessions.clear();
  if (server) {
    server.close();
    server = null;
    origin = "";
  }
}
