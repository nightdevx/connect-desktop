import { useCallback, useEffect, useRef, useState } from "react";
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
  canControl: boolean;
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

const errorMessage = (error?: { code: string; message: string }): string => {
  if (!error) {
    return "İşlem tamamlanamadı.";
  }
  switch (error.code) {
    case "WATCH_NOT_ALLOWED":
      return "Birlikte izlemeyi yönetme yetkin yok.";
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

export function useWatchRoom(lobbyId: string | null): WatchRoom {
  const [state, setState] = useState<WatchState>(() => emptyWatchState(lobbyId ?? ""));
  const [canControl, setCanControl] = useState(false);
  const [seekTolerance, setSeekTolerance] = useState(0.5);
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
    if (snapshot.state.revision < revisionRef.current) {
      return;
    }
    revisionRef.current = snapshot.state.revision;

    // Only a payload that came back from a request this client made can be used
    // to measure the round trip; a broadcast has no known send time.
    if (typeof startedAtMs === "number") {
      const skew = clockSkewMs(snapshot.state.serverTime, Date.now(), startedAtMs);
      skewRef.current = skew;
      setSkewMs(skew);
    }

    setState(snapshot.state);
    setCanControl(snapshot.canControl);
    if (Number.isFinite(snapshot.seekTolerance) && snapshot.seekTolerance > 0) {
      setSeekTolerance(snapshot.seekTolerance);
    }
  }, []);

  useEffect(() => {
    revisionRef.current = -1;
    setLastError("");
    setState(emptyWatchState(lobbyId ?? ""));
    setCanControl(false);

    if (!lobbyId) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    void watchService.getState(lobbyId).then((result) => {
      if (cancelled || lobbyIdRef.current !== lobbyId) {
        return;
      }
      if (result.ok && result.data) {
        applySnapshot(result.data, startedAt);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lobbyId, applySnapshot]);

  // The lobby socket carries every change anybody in the room makes. The
  // subscription is not scoped to a lobby, so the filter is here.
  useEffect(() => {
    return watchService.onStateEvent((event) => {
      if (!lobbyIdRef.current || event.lobbyId !== lobbyIdRef.current) {
        return;
      }
      applySnapshot(
        { state: event.state, canControl, seekTolerance },
        // No startedAt: a broadcast cannot measure a round trip.
        undefined,
      );
    });
  }, [applySnapshot, canControl, seekTolerance]);

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

  const positionNow = useCallback(
    () => livePosition(stateRef.current, skewRef.current),
    [],
  );

  return {
    state,
    canControl,
    seekTolerance,
    skewMs,
    isSending,
    lastError,
    positionNow,
    start: (link) => send((id) => watchService.start(id, link)),
    play: (position) => send((id) => watchService.play(id, position)),
    pause: (position) => send((id) => watchService.pause(id, position)),
    seek: (position) => send((id) => watchService.seek(id, position)),
    // Metadata only, and deliberately not routed through send(): it is not
    // something the user asked for, so it must not raise an error banner or
    // flip the sending flag under a button somebody is about to press.
    describe: async (videoId, title, durationSeconds) => {
      const target = lobbyIdRef.current;
      if (!target) {
        return;
      }
      const result = await watchService.describe(target, videoId, title, durationSeconds);
      if (result.ok && result.data) {
        applySnapshot(result.data);
      }
    },
    stop: () => send((id) => watchService.stop(id)),
  };
}
