import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clockSkewMs,
  emptyWatchState,
  livePosition,
  type WatchSnapshot,
  type WatchState,
} from "@shared/watch";
import { watchService } from "./watch-service";

export interface WatchRoom {
  state: WatchState;
  /**
   * Whether this viewer may drive the session running RIGHT NOW.
   *
   * Two ways to qualify, and the ordinary one is the second: a moderator may
   * drive anything, and whoever started the video drives their own. The server
   * enforces exactly this pair in watch.Manager.CanControlSession — see the
   * note on the `canControl` field in the Go handler for why the wire carries
   * the moderator half only.
   */
  canControl: boolean;
  /** Whether this viewer may open a video, or replace the one playing. */
  canStart: boolean;
  seekTolerance: number;
  /** This machine's offset from the server clock, in ms. See clockSkewMs. */
  skewMs: number;
  isSending: boolean;
  lastError: string;
  /** Where the video should be right now, from the server's clock. */
  positionNow: () => number;
  start: (link: string) => Promise<boolean>;
  play: (position?: number) => Promise<boolean>;
  pause: (position?: number) => Promise<boolean>;
  seek: (position: number) => Promise<boolean>;
  describe: (videoId: string, title: string, durationSeconds: number) => Promise<void>;
  stop: () => Promise<boolean>;
}

/** How long to wait before asking again for a snapshot that did not arrive. */
const SNAPSHOT_RETRY_MS = 2000;

/**
 * How many times to ask.
 *
 * Bounded rather than endless: a refusal is usually an answer — this account is
 * not in the room — and a client that polls a 403 forever is a client hammering
 * the server on behalf of somebody who is not even watching. Anything that
 * happens after the last attempt is picked up by the reconnect refresh below,
 * or by the next transition anybody in the room makes.
 */
const SNAPSHOT_RETRY_LIMIT = 4;

const errorMessage = (error?: { code: string; message: string }): string => {
  if (!error) {
    return "İşlem tamamlanamadı.";
  }
  switch (error.code) {
    case "WATCH_NOT_ALLOWED":
      return "Bu yayını başlatan kişi yönetiyor.";
    case "WATCH_BUSY":
      return error.message;
    case "WATCH_NOT_A_MEMBER":
      return "Önce odaya katıl.";
    case "WATCH_HOST_NOT_ALLOWED":
      return "Bu adres paylaşılamaz.";
    case "WATCH_INVALID_LINK":
    case "WATCH_EMPTY_LINK":
      return "Geçerli bir bağlantı yapıştır.";
    case "FEATURE_DISABLED":
      return "Birlikte izleme bu odada kapalı.";
    default:
      return error.message;
  }
};

export function useWatchRoom(
  lobbyId: string | null,
  currentUserId?: string | null,
): WatchRoom {
  const [state, setState] = useState<WatchState>(() => emptyWatchState(lobbyId ?? ""));
  // The MODERATOR half of the answer, and only that half. See WatchRoom.canControl.
  const [roleCanControl, setRoleCanControl] = useState(false);
  const [seekTolerance, setSeekTolerance] = useState(0.5);
  // Mirrored in refs so the socket listener reads today's value rather than the
  // one its closure was built with.
  //
  // React flushes a passive effect a whole turn of the loop after the commit
  // that changed a value, and a watch-state frame arriving in that gap ran the
  // previous listener — which wrote its stale flag straight back through
  // applySnapshot. A moderator opening a room where somebody else already had a
  // video running lost their override to the first frame that arrived, and got
  // it back only by leaving and coming in again.
  const roleCanControlRef = useRef(false);
  const seekToleranceRef = useRef(0.5);
  const [isSending, setIsSending] = useState(false);
  const [lastError, setLastError] = useState("");

  // Kept in refs as well as state: positionNow is called from a player callback
  // on every tick and must not make this hook re-render, and applySnapshot has
  // to compare revisions without depending on a rendered value.
  const revisionRef = useRef(-1);
  const skewRef = useRef(0);
  const [skewMs, setSkewMs] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lobbyIdRef = useRef(lobbyId);
  lobbyIdRef.current = lobbyId;

  /**
   * Applies a snapshot, dropping one that lost a race.
   *
   * Frames arrive from two directions — the reply to this client's own command
   * and the broadcast on the lobby socket — so out-of-order delivery is normal
   * rather than exceptional. The revision is what makes that harmless.
   */
  const applySnapshot = useCallback((snapshot: WatchSnapshot, startedAtMs?: number) => {
    // Measured BEFORE the revision guard, and that order is the whole point.
    //
    // A round trip is a fact about two clocks, not about the payload it
    // happened to carry: serverTime is just as good a measurement whether or
    // not this frame turned out to be the newest one. Behind the guard, a
    // viewer whose bootstrap reply was overtaken by any broadcast — one
    // `describe` from a faster client is enough — kept a skew of zero for the
    // whole session and then spent it seeking against an error it could not
    // see. Every position in a watch session is stamped on the server's clock,
    // and for a viewer without control this reply is the only sample they ever
    // get.
    if (typeof startedAtMs === "number") {
      const skew = clockSkewMs(snapshot.state.serverTime, Date.now(), startedAtMs);
      skewRef.current = skew;
      setSkewMs(skew);
    }

    if (snapshot.state.revision < revisionRef.current) {
      return;
    }
    revisionRef.current = snapshot.state.revision;

    setState(snapshot.state);
    roleCanControlRef.current = snapshot.canControl;
    setRoleCanControl(snapshot.canControl);
    if (Number.isFinite(snapshot.seekTolerance) && snapshot.seekTolerance > 0) {
      seekToleranceRef.current = snapshot.seekTolerance;
      setSeekTolerance(snapshot.seekTolerance);
    }
  }, []);

  /**
   * Asks the server what the room is watching, and keeps asking.
   *
   * This is the only REST call a viewer without control makes all session, so
   * losing it loses everything at once: the video already playing, the
   * moderator flag, and the single clock-skew sample. A transient failure — a
   * blip, or a 403 while a join is still propagating through the server's
   * roster — used to leave that member on an empty stage until somebody
   * happened to press pause.
   *
   * Returns its own canceller, so the caller can drop an in-flight ladder when
   * the room changes underneath it.
   */
  const refresh = useCallback(() => {
    const target = lobbyIdRef.current;
    if (!target) {
      return () => undefined;
    }

    let cancelled = false;
    let timer = 0;

    const attempt = (remaining: number): void => {
      const startedAt = Date.now();
      void watchService.getState(target).then((result) => {
        if (cancelled || lobbyIdRef.current !== target) {
          return;
        }
        if (result.ok && result.data) {
          applySnapshot(result.data, startedAt);
          return;
        }
        if (remaining > 0) {
          timer = window.setTimeout(() => attempt(remaining - 1), SNAPSHOT_RETRY_MS);
        }
      });
    };

    attempt(SNAPSHOT_RETRY_LIMIT);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [applySnapshot]);

  useEffect(() => {
    revisionRef.current = -1;
    setLastError("");
    setState(emptyWatchState(lobbyId ?? ""));
    roleCanControlRef.current = false;
    setRoleCanControl(false);

    if (!lobbyId) {
      return;
    }
    return refresh();
  }, [lobbyId, refresh]);

  // The lobby socket carries every change anybody in the room makes. The
  // subscription is not scoped to a lobby, so the filter is here.
  //
  // It also carries the socket's own status, and that matters more here than
  // anywhere else on this stream: watch-state is a pure delta with no replay,
  // so a socket that drops and redials loses every play, pause, seek and stop
  // issued while it was away. The viewer keeps extrapolating the last state
  // they saw — still playing while the room is paused, or frozen while it
  // resumed — and the drift loop faithfully holds them there. Asking again on
  // reconnect closes that, at one request per reconnect rather than a
  // heartbeat.
  useEffect(() => {
    let cancelResync: (() => void) | undefined;

    const stop = watchService.onStreamEvent((event) => {
      if (event.type === "stream-status") {
        if (event.status === "connected") {
          cancelResync?.();
          cancelResync = refresh();
        }
        return;
      }

      if (!lobbyIdRef.current || event.lobbyId !== lobbyIdRef.current) {
        return;
      }
      applySnapshot(
        {
          state: event.state,
          // A broadcast carries no per-recipient answer, so the moderator flag
          // stays whatever the last reply said. That is safe precisely because
          // it is the STABLE half: "is a moderator" does not change under a
          // client's feet, while "may drive what is playing now" changes every
          // time somebody else starts a video. The starter half is re-derived
          // below from state.video.startedBy, which every frame carries.
          canControl: roleCanControlRef.current,
          seekTolerance: seekToleranceRef.current,
        },
        // No startedAt: a broadcast cannot measure a round trip.
        undefined,
      );
    });

    return () => {
      stop();
      cancelResync?.();
    };
    // Read through refs above, so this subscribes ONCE per lobby rather than
    // tearing the socket listener down and rebuilding it every time a tolerance
    // or a permission changed.
  }, [applySnapshot, refresh]);

  const send = useCallback(
    async (
      action: (lobbyId: string) => Promise<{
        ok: boolean;
        data?: WatchSnapshot;
        error?: { code: string; message: string };
      }>,
    ): Promise<boolean> => {
      const target = lobbyIdRef.current;
      if (!target) {
        return false;
      }

      setIsSending(true);
      const startedAt = Date.now();
      try {
        const result = await action(target);
        if (!result.ok || !result.data) {
          setLastError(errorMessage(result.error));
          return false;
        }
        setLastError("");
        applySnapshot(result.data, startedAt);
        return true;
      } finally {
        setIsSending(false);
      }
    },
    [applySnapshot],
  );

  const positionNow = useCallback(() => livePosition(stateRef.current, skewRef.current), []);

  // Every command below is memoised, and that is correctness rather than
  // tidiness.
  //
  // WatchPlayer's load effect depends on these, and a direct link is resolved
  // inside it by opening the page in a hidden window — up to forty-five seconds
  // of work whose cleanup cancels the resolve in flight. A command rebuilt on
  // every render re-ran that effect on any re-render at all: the resolve was
  // cancelled, the guard on the already-loaded ref made the re-run return
  // immediately, and the viewer sat on "video aranıyor…" for the rest of the
  // session. One faster client reporting the title was enough to do it to
  // everybody else in the room.
  const start = useCallback((link: string) => send((id) => watchService.start(id, link)), [send]);

  const play = useCallback(
    (position?: number) => send((id) => watchService.play(id, position)),
    [send],
  );

  const pause = useCallback(
    (position?: number) => send((id) => watchService.pause(id, position)),
    [send],
  );

  const seek = useCallback(
    (position: number) => send((id) => watchService.seek(id, position)),
    [send],
  );

  const stop = useCallback(() => send((id) => watchService.stop(id)), [send]);

  // Metadata only, and deliberately not routed through send(): it is not
  // something the user asked for, so it must not raise an error banner or flip
  // the sending flag under a button somebody is about to press.
  const describe = useCallback(
    async (videoId: string, title: string, durationSeconds: number) => {
      const target = lobbyIdRef.current;
      if (!target) {
        return;
      }
      const result = await watchService.describe(target, videoId, title, durationSeconds);
      if (result.ok && result.data) {
        applySnapshot(result.data);
      }
    },
    [applySnapshot],
  );

  const isStarter = Boolean(
    currentUserId && state.active && state.video?.startedBy === currentUserId,
  );

  return useMemo(
    () => ({
      state,
      canControl: roleCanControl || isStarter,
      // Mirrors watch.Manager.CanStart: opening a video is an ordinary member's
      // move, but a running session belongs to whoever started it until they
      // stop it, or a moderator does.
      canStart: roleCanControl || !state.active || isStarter,
      seekTolerance,
      skewMs,
      isSending,
      lastError,
      positionNow,
      start,
      play,
      pause,
      seek,
      describe,
      stop,
    }),
    [
      state,
      roleCanControl,
      isStarter,
      seekTolerance,
      skewMs,
      isSending,
      lastError,
      positionNow,
      start,
      play,
      pause,
      seek,
      describe,
      stop,
    ],
  );
}
