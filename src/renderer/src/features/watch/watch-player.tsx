import { useCallback, useEffect, useRef, useState } from "react";
import type { WatchRoom } from "./use-watch-room";

/**
 * How often drift is checked. The player reports its position four times a
 * second; correcting on every report would seek against ordinary jitter, and
 * checking rarely lets a late start stay late. Once a second is the compromise.
 */
const DRIFT_CHECK_MS = 1000;

/**
 * How long after a correction to ignore drift.
 *
 * A seek makes the player re-buffer, and while it buffers its reported position
 * is meaningless — usually the seek target, sometimes the old one. Measuring
 * during that window produces a second correction, which produces a third. This
 * is the settle time that breaks the loop.
 */
const CORRECTION_COOLDOWN_MS = 2000;

interface PlayerTick {
  type: "tick";
  position: number;
  duration: number;
  title: string;
  state: number;
}

type PlayerMessage =
  | { type: "ready" }
  | { type: "state"; state: number }
  | { type: "player-error"; code: number }
  | { type: "error"; message: string }
  | PlayerTick;

// YT.PlayerState
const PLAYING = 1;
const PAUSED = 2;

interface WatchPlayerProps {
  room: WatchRoom;
  muted: boolean;
  volume: number;
}

export function WatchPlayer({ room, muted, volume }: WatchPlayerProps): JSX.Element {
  const [playerUrl, setPlayerUrl] = useState("");
  const [frameReady, setFrameReady] = useState(false);
  const [embedRefused, setEmbedRefused] = useState(false);

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const frameOriginRef = useRef("");
  // What the frame was last told to load, so a re-render does not reload the
  // video and restart it for everybody watching.
  const loadedVideoRef = useRef("");
  const correctedAtRef = useRef(0);
  // The video this player has already reported metadata for. Without it the
  // 4Hz tick would become a 4Hz POST.
  const describedRef = useRef("");

  const { state, describe, positionNow, seekTolerance } = room;
  const video = state.video;

  const send = useCallback((message: Record<string, unknown>) => {
    const frame = frameRef.current;
    if (!frame?.contentWindow || !frameOriginRef.current) {
      return;
    }
    frame.contentWindow.postMessage(message, frameOriginRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.desktopApi.getWatchPlayerUrl?.().then((result) => {
      if (cancelled || !result.ok || !result.data) {
        return;
      }
      setPlayerUrl(result.data.url);
      frameOriginRef.current = new URL(result.data.url).origin;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Everything the frame says arrives here. The origin check is the only thing
  // separating it from any other page that might postMessage at this window.
  useEffect(() => {
    const onMessage = (event: MessageEvent<PlayerMessage>) => {
      if (!frameOriginRef.current || event.origin !== frameOriginRef.current) {
        return;
      }
      const message = event.data;
      if (!message || typeof message !== "object") {
        return;
      }

      if (message.type === "ready") {
        setFrameReady(true);
        return;
      }

      if (message.type === "player-error") {
        // 101 and 150 are the uploader disallowing embedding. Everything else is
        // a video that is private, removed or region-locked; both are "this one
        // will not play here", which is all a viewer can act on.
        setEmbedRefused(true);
        return;
      }

      if (message.type === "tick") {
        // The server resolves nothing: it knows the video id and nothing else,
        // deliberately, because learning the title and the length server-side
        // would mean a yt-dlp subprocess on the one path whose whole appeal is
        // that it has none. So the first player to load them reports them, and
        // the server fans them out to everybody else.
        //
        // Sent once per video. describedRef is what stops a 4Hz tick becoming a
        // 4Hz POST, and the server drops a report for a video that has since
        // been replaced.
        if (!video || describedRef.current === video.videoId) {
          return;
        }

        const learnedDuration = message.duration > 0;
        const learnedTitle = message.title.length > 0;
        if (!learnedDuration && !learnedTitle) {
          return;
        }
        // Nothing left to add.
        if ((video.durationSeconds ?? 0) > 0 && (video.title ?? "").length > 0) {
          describedRef.current = video.videoId;
          return;
        }

        describedRef.current = video.videoId;
        void describe(video.videoId, message.title, Math.round(message.duration));
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [describe, video]);

  // Load, or switch to, whatever the room is watching.
  useEffect(() => {
    if (!frameReady || !video) {
      return;
    }
    if (loadedVideoRef.current === video.videoId) {
      return;
    }

    loadedVideoRef.current = video.videoId;
    describedRef.current = "";
    setEmbedRefused(false);
    correctedAtRef.current = Date.now();

    send({
      type: "load",
      videoId: video.videoId,
      position: positionNow(),
      playing: state.playing,
    });
  }, [frameReady, video, state.playing, positionNow, send]);

  // Follow play/pause. Separate from the drift loop because it is a state match
  // rather than a measurement: the room paused, so this player pauses, now.
  useEffect(() => {
    if (!frameReady || !video || loadedVideoRef.current !== video.videoId) {
      return;
    }
    correctedAtRef.current = Date.now();
    send({
      type: state.playing ? "play" : "pause",
      position: positionNow(),
    });
    // state.revision rather than state.playing: a seek that does not change
    // play/pause still has to move this player, and the revision is what changes
    // on every transition.
  }, [frameReady, video, state.playing, state.revision, positionNow, send]);

  // The drift loop.
  useEffect(() => {
    if (!frameReady || !state.active || !state.playing) {
      return;
    }

    const onTick = (event: MessageEvent<PlayerMessage>) => {
      if (event.origin !== frameOriginRef.current) {
        return;
      }
      const message = event.data;
      if (!message || message.type !== "tick") {
        return;
      }
      if (Date.now() - correctedAtRef.current < CORRECTION_COOLDOWN_MS) {
        return;
      }
      // A buffering player is not behind, it is waiting; correcting here would
      // seek it back to where it already is and make it buffer again.
      if (message.state !== PLAYING && message.state !== PAUSED) {
        return;
      }

      const target = positionNow();
      if (Math.abs(message.position - target) > seekTolerance) {
        correctedAtRef.current = Date.now();
        send({ type: "seek", position: target });
      }
    };

    window.addEventListener("message", onTick);
    const timer = window.setInterval(() => {
      // Nothing to do here: the tick messages drive the correction. The interval
      // exists only so a player that stopped reporting gets nudged back.
      if (Date.now() - correctedAtRef.current > CORRECTION_COOLDOWN_MS * 4) {
        send({ type: "seek", position: positionNow() });
        correctedAtRef.current = Date.now();
      }
    }, DRIFT_CHECK_MS * 8);

    return () => {
      window.removeEventListener("message", onTick);
      window.clearInterval(timer);
    };
  }, [frameReady, state.active, state.playing, positionNow, seekTolerance, send]);

  // Volume is per viewer and never leaves this machine: it is how loud the room's
  // video is FOR YOU, exactly like the volume on somebody's screen share.
  useEffect(() => {
    if (!frameReady) {
      return;
    }
    send({ type: "mute", muted });
    send({ type: "volume", volume });
  }, [frameReady, muted, volume, send]);

  if (!playerUrl) {
    return <div className="watch-player watch-player--loading">Oynatıcı hazırlanıyor…</div>;
  }

  return (
    <div className="watch-player">
      <iframe
        ref={frameRef}
        src={playerUrl}
        className="watch-player__frame"
        title="Birlikte izleme"
        // The frame is our own loopback page; it needs to run scripts and play
        // media and nothing else.
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="autoplay; encrypted-media"
      />
      {embedRefused ? (
        <div className="watch-player__overlay">
          Bu video gömülü oynatmaya kapalı. Başka bir bağlantı deneyin.
        </div>
      ) : null}
    </div>
  );
}
