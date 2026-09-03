import { useCallback, useEffect, useRef, useState } from "react";
import { watchVideoRef } from "@shared/watch";
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
  const [directUrl, setDirectUrl] = useState("");
  const [frameReady, setFrameReady] = useState(false);
  const [embedRefused, setEmbedRefused] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveStatus, setResolveStatus] = useState("");
  const [resolveError, setResolveError] = useState("");
  const [playable, setPlayable] = useState(false);

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const frameOriginRef = useRef("");
  // When the player last said anything. Distinct from correctedAtRef: one
  // answers "has this player gone quiet", the other "is it still settling".
  const lastTickAtRef = useRef(0);
  // Which of the two loopback pages the frame that said "ready" actually is.
  //
  // frameReady alone is not enough to talk to it. Switching a direct link to a
  // YouTube one swaps the frame's src, and the effect that lowers frameReady
  // runs BEFORE the load effect in that same commit — so the load effect still
  // sees frameReady true, claims the video and posts into a document that is
  // already being torn down. The claim then blocks the reload the new document
  // needs, and that viewer waits on a frame nobody has spoken to. Comparing the
  // page the frame IS against the page the room now wants closes it.
  const frameSourceRef = useRef<"direct" | "embed" | null>(null);
  // What the frame was last told to load, so a re-render does not reload the
  // video and restart it for everybody watching.
  const loadedVideoRef = useRef("");
  const correctedAtRef = useRef(0);
  // What this player has already reported about the video it is playing.
  //
  // Two facts rather than one flag, because a player learns its title before it
  // learns its length and the two therefore become true at different moments.
  // Collapsing them breaks one way or the other: latch on the title and the
  // player retires before it ever knows the duration — every client in the room
  // does the same, the room's duration stays 0, and 0 disables the scrub bar for
  // everybody. Latch only on the duration and a source that never reports one
  // re-POSTs its title on all four of its ticks a second until the rate limiter
  // starts refusing them. Tracked separately, each fact is sent exactly once.
  const reportedRef = useRef({ ref: "", title: false, duration: false });

  const { state, describe, positionNow, seekTolerance } = room;
  const video = state.video;
  const isDirect = video?.source === "direct";
  // A string, so effects can depend on WHICH video without depending on the
  // object that carries it — which is rebuilt on every state change the room
  // broadcasts.
  const videoRefKey = watchVideoRef(video);

  // What the room is watching, read rather than depended on.
  //
  // The load effect below spends up to forty-five seconds resolving a direct
  // link, and its cleanup cancels that. Depending on the video OBJECT would
  // re-run it — and so cancel the resolve — every time anything at all changed
  // in the room state, including another viewer's title report. It depends on
  // the video REFERENCE, a string, and reads the rest from here.
  const roomRef = useRef({ video, playing: state.playing });
  roomRef.current = { video, playing: state.playing };

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
      setDirectUrl(result.data.directUrl ?? "");
      frameOriginRef.current = new URL(result.data.url).origin;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The frame cannot say anything until it knows this window's origin, and it
  // learns that only by receiving a message. Both loopback pages stay silent
  // until then, so the first word has to come from here — repeated, because the
  // frame may still be loading when the first one is sent.
  useEffect(() => {
    if (frameReady) {
      return;
    }
    const hello = (): void => send({ type: "hello" });
    hello();
    const timer = window.setInterval(hello, 400);
    return () => window.clearInterval(timer);
  }, [frameReady, playerUrl, directUrl, send]);

  // Switching between a YouTube video and a direct page swaps the frame's src,
  // which loads a fresh document that has heard nothing. Without this the
  // handshake is skipped and every command is posted into the old frame's grave.
  useEffect(() => {
    setFrameReady(false);
    setPlayable(false);
    frameSourceRef.current = null;
    loadedVideoRef.current = "";
  }, [isDirect]);

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
        frameSourceRef.current =
          roomRef.current.video?.source === "direct" ? "direct" : "embed";
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
        if (message.state === PLAYING || message.state === PAUSED) {
          setPlayable(true);
        }

        // The server resolves nothing: it knows the video id and nothing else,
        // deliberately, because learning the title and the length server-side
        // would mean a yt-dlp subprocess on the one path whose whole appeal is
        // that it has none. So the first player to load them reports them, and
        // the server fans them out to everybody else.
        //
        // Sent at most twice per video. reportedRef is what stops a 4Hz tick
        // becoming a 4Hz POST, and the server drops a report for a video that
        // has since been replaced.
        const ref = watchVideoRef(video);
        if (!video || !ref) {
          return;
        }
        if (reportedRef.current.ref !== ref) {
          reportedRef.current = { ref, title: false, duration: false };
        }

        const learnedDuration = message.duration > 0;
        const learnedTitle = message.title.length > 0;

        // Nothing left to add — usually because a faster client in the room
        // already reported both and the server fanned them out to this one.
        if ((video.durationSeconds ?? 0) > 0 && (video.title ?? "").length > 0) {
          reportedRef.current = { ref, title: true, duration: true };
          return;
        }

        const sendTitle = learnedTitle && !reportedRef.current.title;
        const sendDuration = learnedDuration && !reportedRef.current.duration;
        if (!sendTitle && !sendDuration) {
          return;
        }

        reportedRef.current.title = reportedRef.current.title || sendTitle;
        reportedRef.current.duration = reportedRef.current.duration || sendDuration;
        // 0 rather than a rounded 0 for an unknown length: the server reads 0 as
        // "not reported yet" and leaves whatever it already had alone.
        void describe(ref, message.title, learnedDuration ? Math.round(message.duration) : 0);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [describe, video]);

  // Load, or switch to, whatever the room is watching.
  //
  // A YouTube video is an id the frame can load by itself. A direct page is not:
  // the stream behind it has to be found first, and that happens HERE, on this
  // machine, for this viewer alone. See watch-resolver in the main process.
  useEffect(() => {
    const { video: current } = roomRef.current;
    const wanted = isDirect ? "direct" : "embed";
    if (!frameReady || frameSourceRef.current !== wanted || !current || !videoRefKey) {
      return;
    }
    if (loadedVideoRef.current === videoRefKey) {
      return;
    }

    loadedVideoRef.current = videoRefKey;
    reportedRef.current = { ref: "", title: false, duration: false };
    setEmbedRefused(false);
    setResolveError("");
    setPlayable(false);
    correctedAtRef.current = Date.now();

    if (current.source !== "direct") {
      send({
        type: "load",
        videoId: current.videoId,
        position: positionNow(),
        playing: roomRef.current.playing,
      });
      return;
    }

    let cancelled = false;
    // Whether the claim on loadedVideoRef was ever made good. A run that is
    // torn down before the frame was told anything has to release it, or the
    // guard above turns the next run into an immediate return and the viewer
    // waits on a load nobody is performing.
    let loaded = false;
    setResolving(true);
    setResolveStatus("Sayfa açılıyor, video aranıyor…");

    void window.desktopApi
      .resolveWatchSource?.({ pageUrl: current.pageUrl ?? "" })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok || !result.data) {
          setResolveError(result.error?.message ?? "Video bulunamadı.");
          return;
        }
        loaded = true;
        correctedAtRef.current = Date.now();
        send({
          type: "load",
          src: result.data.src,
          kind: result.data.kind,
          position: positionNow(),
          playing: roomRef.current.playing,
        });
        if (result.data.title) {
          void describe(videoRefKey, result.data.title, 0);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setResolving(false);
        }
      });

    return () => {
      cancelled = true;
      if (!loaded) {
        // Released rather than kept: whatever comes next — this same video on a
        // rebuilt frame, or a different one — has to be free to load.
        loadedVideoRef.current = "";
        setResolving(false);
      }
    };
    // videoRefKey, NOT the video object, and none of the room's other fields.
    // See roomRef: everything else this reads is read at run time, so a pause
    // or somebody else's title report cannot cancel a resolve in flight.
  }, [frameReady, isDirect, videoRefKey, positionNow, send, describe]);

  // Follow play/pause. Separate from the drift loop because it is a state match
  // rather than a measurement: the room paused, so this player pauses, now.
  useEffect(() => {
    if (!frameReady || !videoRefKey || loadedVideoRef.current !== videoRefKey) {
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
  }, [frameReady, videoRefKey, state.playing, state.revision, positionNow, send]);

  // The drift loop.
  //
  // Runs whenever the room has a video, PAUSED INCLUDED. It used to stop the
  // moment the room paused, which left the one state it could not recover from:
  // a player that never took the pause. The embed's own load path issues the
  // pause while the video is still loading and it is routinely swallowed, so a
  // late joiner arriving into a paused session simply plays on — alone, ahead of
  // everybody, with no correction coming until somebody pressed play again.
  useEffect(() => {
    if (!frameReady || !state.active) {
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
      lastTickAtRef.current = Date.now();
      if (Date.now() - correctedAtRef.current < CORRECTION_COOLDOWN_MS) {
        return;
      }
      // A buffering player is not behind, it is waiting; correcting here would
      // seek it back to where it already is and make it buffer again.
      if (message.state !== PLAYING && message.state !== PAUSED) {
        return;
      }

      const target = positionNow();

      if (!state.playing) {
        // The room is paused and this player is not. Stop it where the room is
        // rather than seeking it, or it keeps running and the next check finds
        // it further away still.
        if (message.state === PLAYING) {
          correctedAtRef.current = Date.now();
          send({ type: "pause", position: target });
          return;
        }
        // Paused in both places, but not on the same frame — somebody seeked
        // while the room was held. positionNow is constant here, so this
        // converges in one move.
        if (Math.abs(message.position - target) > seekTolerance) {
          correctedAtRef.current = Date.now();
          send({ type: "seek", position: target });
        }
        return;
      }

      // The room is playing and this player is not. Seeking would drag a stopped
      // picture forward a frame at a time with no sound — which is what a stray
      // click on the embed used to produce. Resume instead.
      if (message.state === PAUSED) {
        correctedAtRef.current = Date.now();
        send({ type: "play", position: target });
        return;
      }

      if (Math.abs(message.position - target) > seekTolerance) {
        correctedAtRef.current = Date.now();
        send({ type: "seek", position: target });
      }
    };

    window.addEventListener("message", onTick);
    lastTickAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      // Nothing to do here while the player is reporting: the ticks above drive
      // every correction. This exists only for a player that has gone SILENT.
      //
      // Measured from the last tick, not from the last correction. A healthy
      // player in perfect sync never corrects, so the old test — time since the
      // last correction — was true on essentially every firing, and seeked a
      // player that had nothing wrong with it. Both the YouTube embed and the
      // direct one re-buffer on a seek, so every viewer in the room got a hitch
      // roughly every eight seconds, for the whole film. That is the exact
      // stutter CORRECTION_COOLDOWN_MS exists to prevent.
      if (Date.now() - lastTickAtRef.current > CORRECTION_COOLDOWN_MS * 4) {
        send({ type: "seek", position: positionNow() });
        correctedAtRef.current = Date.now();
        lastTickAtRef.current = Date.now();
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

  const frameSrc = isDirect ? directUrl : playerUrl;
  if (!frameSrc) {
    return <div className="watch-player watch-player--loading">Oynatıcı hazırlanıyor…</div>;
  }

  const busy = !embedRefused && !resolveError && (resolving || !playable);

  return (
    <div className="watch-player">
      <iframe
        ref={frameRef}
        src={frameSrc}
        className="watch-player__frame"
        title="Birlikte izleme"
        // The frame is our own loopback page; it needs to run scripts and play
        // media and nothing else.
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="autoplay; encrypted-media"
      />
      {busy ? (
        <div className="watch-player__overlay watch-player__overlay--busy">
          <span className="watch-player__spinner" aria-hidden="true" />
          <span>{resolving ? resolveStatus : "Video yükleniyor…"}</span>
        </div>
      ) : null}
      {resolveError ? (
        <div className="watch-player__overlay">{resolveError}</div>
      ) : null}
      {embedRefused ? (
        <div className="watch-player__overlay">
          Bu video oynatılamadı. Başka bir bağlantı deneyin.
        </div>
      ) : null}
    </div>
  );
}
