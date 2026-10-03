// Reactions to a congested link and an overloaded encoder, decided once per
// stats tick. Pure: the stream manager owns the senders and the subscriptions,
// this only decides. scripts/check-link-guards.cjs holds the rules.

import { MEDIA_DIAGNOSTIC_THRESHOLDS } from "@shared/media-diagnostics";

// --- the audio guard ----------------------------------------------------------
//
// A screen share fills the uplink, the home router's queue fills behind it, and
// the voice sitting in that same queue arrives late: production saw audio RTT
// of 200-1890 ms in sessions with a share running, and none without. The
// encoder's own congestion control reacts too slowly for a voice. This is the
// fast layer: as soon as the microphone's own round trip climbs well above its
// floor, the share's bitrate ceiling is cut on the live sender -- no
// re-capture, no new track -- and handed back a little at a time once the
// voice has been on time for a while.

export const AUDIO_GUARD = {
  // Above the floor by this much is queueing, not distance.
  rttMarginMs: 80,
  // Consecutive samples over the line before cutting; one late RTCP report is
  // not congestion. Also the wait between cuts, so each one can take effect.
  triggerSamples: 2,
  cutFactor: 0.7,
  // A quarter of the preset still carries a readable screen; below that the
  // encoder's own adaptation (fewer pixels or fewer frames) carries on alone.
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

// --- the encoder guard ---------------------------------------------------------
//
// What the app does about an encoder that reports itself limited. Only a CPU
// limit changes anything: the encoder cannot fix that one, and a lower preset
// (a smaller capture) can. A "bandwidth" limit is the encoder already doing the
// right thing. Its bitrate follows the bandwidth estimate, and it sheds pixels
// (motion) or frames (text) on its own and takes them back when the estimate
// recovers. The app used to answer it with a preset step-down that re-captured
// the screen and almost never came back: 198 step-downs and 16 step-ups in 30
// days, and in 87% of the bandwidth-limited samples the estimate was at least
// twice what was being sent (docs/screen-share-quality-plan.md §2.1). A long
// one is now only told to the user.

export const ENCODER_GUARD = {
  // 8 s at the 2 s stats interval before a CPU step-down.
  cpuTicks: 4,
  // ~3 minutes without a CPU limit before a step back up. Deliberately far
  // longer than the step-down: coming back up costs a re-capture, and the load
  // that caused the step is exactly the kind that returns.
  recoveryTicks: 90,
  // A bandwidth limit this long (a minute) earns one note per share.
  bandwidthNoticeTicks: 30,
} as const;

export type EncoderLimitation = "cpu" | "bandwidth" | "other" | null;

export interface EncoderGuardState {
  cpuTicks: number;
  cpuHandled: boolean;
  healthyTicks: number;
  bandwidthTicks: number;
  bandwidthNoticed: boolean;
}

/**
 * - step-down: a screen share has been CPU-limited long enough; lower the preset.
 * - cpu-notice: the same, with nothing to step down (a camera alone).
 * - step-up: a screen share has run free of CPU limits long enough to try the
 *   rung above again.
 * - bandwidth-notice: tell the user once that the uplink is short.
 */
export type EncoderGuardAction =
  | "step-down"
  | "cpu-notice"
  | "step-up"
  | "bandwidth-notice"
  | null;

export const initialEncoderGuard = (): EncoderGuardState => ({
  cpuTicks: 0,
  cpuHandled: false,
  healthyTicks: 0,
  bandwidthTicks: 0,
  bandwidthNoticed: false,
});

export const stepEncoderGuard = (
  state: EncoderGuardState,
  limitation: EncoderLimitation,
  // A screen share is live and actually sending video.
  sharing: boolean,
): { state: EncoderGuardState; action: EncoderGuardAction } => {
  if (limitation === "cpu") {
    const cpuTicks = state.cpuTicks + 1;
    const due = cpuTicks >= ENCODER_GUARD.cpuTicks && !state.cpuHandled;
    return {
      state: {
        ...state,
        cpuTicks,
        cpuHandled: state.cpuHandled || due,
        healthyTicks: 0,
        bandwidthTicks: 0,
      },
      action: due ? (sharing ? "step-down" : "cpu-notice") : null,
    };
  }

  const next: EncoderGuardState = {
    ...state,
    cpuTicks: 0,
    cpuHandled: false,
    healthyTicks: sharing ? state.healthyTicks + 1 : 0,
    bandwidthTicks: limitation === "bandwidth" ? state.bandwidthTicks + 1 : 0,
  };

  // A bandwidth limit does not count against recovery: the step being undone
  // was a CPU one, and the encoder handles the bandwidth on its own.
  if (next.healthyTicks >= ENCODER_GUARD.recoveryTicks) {
    return { state: { ...next, healthyTicks: 0 }, action: "step-up" };
  }

  if (
    next.bandwidthTicks >= ENCODER_GUARD.bandwidthNoticeTicks &&
    !next.bandwidthNoticed
  ) {
    return { state: { ...next, bandwidthNoticed: true }, action: "bandwidth-notice" };
  }

  return { state: next, action: null };
};

// --- hardware encoder lost mid-share -------------------------------------------
//
// Chromium moves an encoder to software on its own when the GPU encoder fails
// mid-stream: a driver error, a profile the driver turns down, or another app
// holding the encoder's sessions. The share carries on, on the CPU, and nothing
// said so. A share that ran on the hardware and has been on software this long
// is told once.

// 6 s at the 2 s stats interval: longer than a re-capture's encoder rebuild.
export const HARDWARE_FALLBACK_TICKS = 3;

// Chromium encodes every layer under this many pixels tall in software by
// design (ForceSoftwareForLowResolutions), so a window shrunk below it moving
// to software is no fault. Taken on the short side, which also covers a
// portrait window.
const HARDWARE_MIN_SHORT_SIDE = 360;

export interface HardwareFallbackState {
  wasHardware: boolean;
  softwareTicks: number;
  noticed: boolean;
}

export const initialHardwareFallback = (): HardwareFallbackState => ({
  wasHardware: false,
  softwareTicks: 0,
  noticed: false,
});

/**
 * One stats tick of the share's top layer. `fellBack` is true once per share:
 * the tick the software run reaches HARDWARE_FALLBACK_TICKS.
 */
export const stepHardwareFallback = (
  state: HardwareFallbackState,
  hardware: boolean | null,
  frameWidth: number | null,
  frameHeight: number | null,
): { state: HardwareFallbackState; fellBack: boolean } => {
  if (hardware === true) {
    return {
      state: { ...state, wasHardware: true, softwareTicks: 0 },
      fellBack: false,
    };
  }
  const expectedSoftware =
    frameWidth !== null &&
    frameHeight !== null &&
    Math.min(frameWidth, frameHeight) < HARDWARE_MIN_SHORT_SIDE;
  if (hardware === null || expectedSoftware) {
    return { state: { ...state, softwareTicks: 0 }, fellBack: false };
  }
  if (!state.wasHardware || state.noticed) {
    return { state, fellBack: false };
  }
  const softwareTicks = state.softwareTicks + 1;
  const fellBack = softwareTicks >= HARDWARE_FALLBACK_TICKS;
  return { state: { ...state, softwareTicks, noticed: fellBack }, fellBack };
};

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
