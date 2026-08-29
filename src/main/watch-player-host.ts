import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

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
  var player = null;
  var ready = false;
  var pending = null;

  // Same shape the backend enforces: eleven URL-safe base64 characters. Checked
  // again here because this frame is a separate origin and must not trust what
  // it is handed.
  var VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

  function post(message) {
    if (parentOrigin) {
      parent.postMessage(message, parentOrigin);
    }
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
          post({ type: "ready" });
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
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      // One document, one token, nothing else. No path is ever turned into a
      // file system lookup, so there is no traversal to defend against.
      if (url.pathname !== PLAYER_PATH || url.searchParams.get("t") !== token) {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(PLAYER_HTML);
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
  if (server) {
    server.close();
    server = null;
    origin = "";
  }
}
