// Two reactions to a congested link, decided once per stats tick. Pure: the
// stream manager owns the senders and the subscriptions, this only decides.
// scripts/check-link-guards.cjs holds the rules.

import { MEDIA_DIAGNOSTIC_THRESHOLDS } from "@shared/media-diagnostics";

// --- the audio guard ----------------------------------------------------------
//
// A screen share fills the uplink, the home router's queue fills behind it, and
// the voice sitting in that same queue arrives late: production saw audio RTT
// of 200-1890 ms in sessions with a share running, and none without. The preset
// step-down that answers it needs eight seconds of sustained limitation and then
// a re-capture. This is the fast layer in front of it: as soon as the
// microphone's own round trip climbs well above its floor, the share's bitrate
// ceiling is cut on the live sender -- no re-capture, no new track -- and handed
// back a little at a time once the voice has been on time for a while.

export const AUDIO_GUARD = {
  // Above the floor by this much is queueing, not distance.
  rttMarginMs: 80,
  // Consecutive samples over the line before cutting; one late RTCP report is
  // not congestion. Also the wait between cuts, so each one can take effect.
  triggerSamples: 2,
  cutFactor: 0.7,
  // A quarter of the preset still carries a readable screen; below that the
  // preset step-down is the better tool.
  minFactor: 0.25,
  restoreStep: 0.1,
  // 10 s at the 2 s stats interval.
  restoreAfterSamples: 5,
  // The floor is the lowest RTT of the last two minutes, so it follows a route
  // that genuinely changed without forgetting what an idle link looks like.
  baselineWindow: 60,
  minBaselineSamples: 3,
} as const;

export interface AudioGuardState {
  recentRttMs: number[];
  over: number;
  calm: number;
  /** The share's bitrate ceiling as a fraction of its preset. */
  factor: number;
}

export type AudioGuardAction = "throttle" | "restore" | null;

export interface AudioGuardStep {
  state: AudioGuardState;
  action: AudioGuardAction;
  baselineMs: number | null;
}

export const initialAudioGuard = (): AudioGuardState => ({
  recentRttMs: [],
  over: 0,
  calm: 0,
  factor: 1,
});

const twoDecimals = (value: number): number => Math.round(value * 100) / 100;

export const stepAudioGuard = (
  state: AudioGuardState,
  rttMs: number | null,
  sharing: boolean,
): AudioGuardStep => {
  // Samples taken while not sharing are the best floor there is, so the
  // history is kept whatever else happens.
  const recentRttMs =
    rttMs === null
      ? state.recentRttMs
      : [...state.recentRttMs, rttMs].slice(-AUDIO_GUARD.baselineWindow);
  const baselineMs =
    recentRttMs.length >= AUDIO_GUARD.minBaselineSamples
      ? Math.min(...recentRttMs)
      : null;

  if (!sharing) {
    return { state: { recentRttMs, over: 0, calm: 0, factor: 1 }, action: null, baselineMs };
  }
  if (rttMs === null || baselineMs === null) {
    return { state: { ...state, recentRttMs }, action: null, baselineMs };
  }

  if (rttMs > baselineMs + AUDIO_GUARD.rttMarginMs) {
    const over = state.over + 1;
    if (over >= AUDIO_GUARD.triggerSamples && state.factor > AUDIO_GUARD.minFactor) {
      return {
        state: {
          recentRttMs,
          over: 0,
          calm: 0,
          factor: Math.max(AUDIO_GUARD.minFactor, twoDecimals(state.factor * AUDIO_GUARD.cutFactor)),
        },
        action: "throttle",
        baselineMs,
      };
    }
    return { state: { recentRttMs, over, calm: 0, factor: state.factor }, action: null, baselineMs };
  }

  const calm = state.calm + 1;
  if (state.factor < 1 && calm >= AUDIO_GUARD.restoreAfterSamples) {
    return {
      state: {
        recentRttMs,
        over: 0,
        calm: 0,
        factor: Math.min(1, twoDecimals(state.factor + AUDIO_GUARD.restoreStep)),
      },
      action: "restore",
      baselineMs,
    };
  }
  return { state: { recentRttMs, over: 0, calm, factor: state.factor }, action: null, baselineMs };
};

export const AUDIO_GUARD_FLOOR_BPS = 150_000;

/**
 * The bitrate ceiling of one encoding under the guard. Never above the preset,
 * and never squeezed below a floor at which the layer stops being video.
 */
export const guardedBitrate = (capBps: number, factor: number): number =>
  Math.min(capBps, Math.max(AUDIO_GUARD_FLOOR_BPS, Math.round(capBps * factor)));

// --- downlink diagnosis --------------------------------------------------------
//
// Everybody arriving damaged at once is this machine's download, not everybody
// else's upload -- the inference the session verdicts already make afterwards,
// made live so the user can be told while it matters. One remote cannot tell
// the two apart, so it takes at least two people actually speaking.

export const DOWNLINK = {
  minRemotes: 2,
  // Speaking, not DTX: a silent track sends a packet every few hundred ms and
  // its loss percentage is noise.
  minBitrateBps: 16_000,
  dwellSamples: MEDIA_DIAGNOSTIC_THRESHOLDS.problemDwellSamples,
  lossPct: MEDIA_DIAGNOSTIC_THRESHOLDS.packetLossPct,
} as const;

export interface RemoteAudioSample {
  identity: string;
  packetLossPct: number | null;
  bitrateBps: number | null;
}

export interface DownlinkStep {
  streak: number;
  /** True on the sample that crosses the dwell: once per episode. */
  started: boolean;
  /** True for as long as the episode lasts. */
  active: boolean;
}

export const stepDownlink = (
  streak: number,
  remotes: RemoteAudioSample[],
): DownlinkStep => {
  const speaking = remotes.filter(
    (remote) =>
      remote.packetLossPct !== null &&
      (remote.bitrateBps ?? 0) >= DOWNLINK.minBitrateBps,
  );
  const everyoneLossy =
    speaking.length >= DOWNLINK.minRemotes &&
    speaking.every((remote) => (remote.packetLossPct ?? 0) >= DOWNLINK.lossPct);
  const next = everyoneLossy ? streak + 1 : 0;
  return {
    streak: next,
    started: next === DOWNLINK.dwellSamples,
    active: next >= DOWNLINK.dwellSamples,
  };
};
