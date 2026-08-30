export type WatchSource = "youtube" | "direct";

export interface WatchVideo {
  videoId: string;
  source: WatchSource;
  pageUrl?: string;
  title?: string;
  durationSeconds?: number;
  startedBy: string;
  startedByName: string;
  startedAt: string;
}

export interface WatchState {
  lobbyId: string;
  active: boolean;
  video: WatchVideo | null;
  playing: boolean;
  /**
   * Where playback was at {@link positionAt}. Never read on its own — see
   * {@link livePosition}.
   */
  positionSeconds: number;
  /** The instant positionSeconds was true, on the SERVER's clock. */
  positionAt: string;
  /** This payload's send instant, same clock as positionAt. See {@link clockSkewMs}. */
  serverTime: string;
  revision: number;
}

export interface WatchSnapshot {
  state: WatchState;
  canControl: boolean;
  /** How far out of step a player may be before it corrects. Seconds. */
  seekTolerance: number;
}

export const emptyWatchState = (lobbyId: string): WatchState => ({
  lobbyId,
  active: false,
  video: null,
  playing: false,
  positionSeconds: 0,
  positionAt: new Date(0).toISOString(),
  serverTime: new Date(0).toISOString(),
  revision: 0,
});

export const watchVideoRef = (video: WatchVideo | null): string => {
  if (!video) {
    return "";
  }
  return video.source === "direct" ? (video.pageUrl ?? "") : video.videoId;
};

/**
 * How far this machine's clock is ahead of the server's, in milliseconds.
 *
 * Every position in a watch session is stamped on the server's clock, and a
 * desktop several seconds off UTC is ordinary rather than exceptional. Without
 * this correction such a machine computes an offset that is wrong by its own
 * skew and then spends the session seeking against a mistake it cannot see —
 * always the same distance behind or ahead, never converging.
 *
 * Measured from the round trip that delivered the payload: `serverTime` was
 * written somewhere inside it, so half the elapsed time is the best estimate of
 * when, and the remainder is the offset between the two clocks.
 */
export const clockSkewMs = (
  serverTime: string,
  receivedAtMs: number,
  requestStartedAtMs?: number,
): number => {
  const server = Date.parse(serverTime);
  if (!Number.isFinite(server)) {
    return 0;
  }

  const oneWay =
    typeof requestStartedAtMs === "number" && receivedAtMs > requestStartedAtMs
      ? (receivedAtMs - requestStartedAtMs) / 2
      : 0;

  return receivedAtMs - oneWay - server;
};

/**
 * Where the video should be right now, in seconds.
 *
 * This is the extrapolation the server deliberately does not do: it reports a
 * position and the instant that position was true, and every client advances it
 * from there. A paused session simply holds.
 *
 * `skewMs` is this machine's offset from the server clock, from
 * {@link clockSkewMs}. Passing 0 is correct only when the clocks agree.
 */
export const livePosition = (state: WatchState, skewMs = 0, nowMs = Date.now()): number => {
  if (!state.active || !state.video) {
    return 0;
  }
  if (!state.playing) {
    return state.positionSeconds;
  }

  const positionAt = Date.parse(state.positionAt);
  if (!Number.isFinite(positionAt)) {
    return state.positionSeconds;
  }

  const elapsed = (nowMs - skewMs - positionAt) / 1000;
  const position = state.positionSeconds + Math.max(0, elapsed);

  // Past the end, hold at the end rather than running off into a number no
  // player can seek to. Duration is 0 until a client reports it, which reads as
  // unknown rather than as a zero-length video.
  const duration = state.video.durationSeconds ?? 0;
  if (duration > 0 && position > duration) {
    return duration;
  }
  return position;
};

export const formatWatchTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};
