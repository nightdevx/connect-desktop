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
//
// A stall is different: the link itself stops (Wi-Fi mostly), every queue in
// front of it fills, and when it comes back whatever was queued has to drain
// before the voice gets through. Cutting 30% at a time did not shorten those
// (p50 10 s either way). A round trip of a second or more, or the publishing
// connection's ICE going disconnected, drops the top layer's ceiling to the
// floor in one step, and it stays there until the voice has been on time for a
// few samples in a row. Not a pause (`active: false`): the SFU does not move a
// screen share's viewers to the low layer for many seconds (its tracker allows
// for still screens), so a paused top layer froze their picture instead.

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
  // No queue a home router keeps is this deep; the link stopped.
  stallRttMs: 1_000,
  // 6 s at the 2 s stats interval.
  resumeAfterSamples: 3,
} as const;

export interface AudioGuardState {
  recentRttMs: number[];
  over: number;
  calm: number;
  /** The share's bitrate ceiling as a fraction of its preset. */
  factor: number;
  /** A stall: the top layer sits on the floor. */
  stalled: boolean;
}

export type AudioGuardAction = "throttle" | "restore" | "stall" | "recover" | null;

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
  stalled: false,
});

const twoDecimals = (value: number): number => Math.round(value * 100) / 100;

export const stepAudioGuard = (
  state: AudioGuardState,
  rttMs: number | null,
  sharing: boolean,
  // The publishing connection's ICE is disconnected: the round trip on hand
  // is the last one measured before the link stopped, not a current one.
  iceDisconnected = false,
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
    return {
      state: { recentRttMs, over: 0, calm: 0, factor: 1, stalled: false },
      action: null,
      baselineMs,
    };
  }

  if (iceDisconnected || (rttMs !== null && rttMs >= AUDIO_GUARD.stallRttMs)) {
    return {
      state: { ...state, recentRttMs, over: 0, calm: 0, stalled: true },
      action: state.stalled ? null : "stall",
      baselineMs,
    };
  }
  if (state.stalled) {
    // With no floor yet, anything short of a stall counts as on time.
    const onTime =
      rttMs === null || baselineMs === null || rttMs <= baselineMs + AUDIO_GUARD.rttMarginMs;
    const calm = onTime ? state.calm + 1 : 0;
    if (calm >= AUDIO_GUARD.resumeAfterSamples) {
      return {
        state: { ...state, recentRttMs, over: 0, calm: 0, stalled: false },
        action: "recover",
        baselineMs,
      };
    }
    return { state: { ...state, recentRttMs, calm }, action: null, baselineMs };
  }

  if (rttMs === null || baselineMs === null) {
    return { state: { ...state, recentRttMs }, action: null, baselineMs };
  }

  if (rttMs > baselineMs + AUDIO_GUARD.rttMarginMs) {
    const over = state.over + 1;
    if (over >= AUDIO_GUARD.triggerSamples && state.factor > AUDIO_GUARD.minFactor) {
      return {
        state: {
          ...state,
          recentRttMs,
          over: 0,
          calm: 0,
          factor: Math.max(AUDIO_GUARD.minFactor, twoDecimals(state.factor * AUDIO_GUARD.cutFactor)),
        },
        action: "throttle",
        baselineMs,
      };
    }
    return { state: { ...state, recentRttMs, over, calm: 0 }, action: null, baselineMs };
  }

  const calm = state.calm + 1;
  if (state.factor < 1 && calm >= AUDIO_GUARD.restoreAfterSamples) {
    return {
      state: {
        ...state,
        recentRttMs,
        over: 0,
        calm: 0,
        factor: Math.min(1, twoDecimals(state.factor + AUDIO_GUARD.restoreStep)),
      },
      action: "restore",
      baselineMs,
    };
  }
  return { state: { ...state, recentRttMs, over: 0, calm }, action: null, baselineMs };
};

export const AUDIO_GUARD_FLOOR_BPS = 150_000;

/**
 * The bitrate ceiling of one encoding under the guard. Never above the preset,
 * and never squeezed below a floor at which the layer stops being video.
 */
export const guardedBitrate = (capBps: number, factor: number): number =>
  Math.min(capBps, Math.max(AUDIO_GUARD_FLOOR_BPS, Math.round(capBps * factor)));

/** The top layer's ceiling during a stall: the floor, or its own cap if lower. */
export const stalledBitrate = (capBps: number): number =>
  Math.min(capBps, AUDIO_GUARD_FLOOR_BPS);

// --- the QP band -----------------------------------------------------------------
//
// A calm screen (a menu, a map, a scene standing still) costs the encoder next
// to nothing, yet the H.264 rate control still fills the preset's ceiling: it
// sits at its QP floor and spends the rest on detail nobody can see. The bench
// (League, 1080p60) spent 4.7 Mbps at QP 17 on a calm clip where 3.2 Mbps gave
// VMAF 0.3 lower. While the top layer's QP stays under lowQp its ceiling is
// stepped down toward what it really sends; as soon as the QP climbs over
// highQp (the scene got busy) the full ceiling is back on the next tick. A
// fight never sits under lowQp, so it never pays for this.
//
// H.264 only: AV1 and VP9 count QP on a 0-255 scale.

export const QP_BAND = {
  lowQp: 21,
  highQp: 26,
  // Each cut: 80% of the current ceiling, or straight to what is sent plus 15%
  // when that is lower. The QP is what stops the descent.
  step: 0.8,
  headroom: 1.15,
  // Two samples (4 s) under lowQp before a cut, and 6 s between cuts.
  holdSamples: 2,
  gapSamples: 3,
} as const;

/** Below this the picture of a 60 (or 30) fps share starts to suffer. */
export const qpBandFloorBps = (framesPerSecond: number | null): number =>
  framesPerSecond !== null && framesPerSecond <= 30 ? 1_000_000 : 1_500_000;

export interface QpBandState {
  /** The top layer's lowered ceiling; null is the preset's own. */
  capBps: number | null;
  low: number;
  sinceChange: number;
}

/** Half the publishers, fixed per user, for the field A/B (PLAN F8.2c). */
export const inQpBandGroup = (identity: string): boolean => {
  let hash = 0;
  for (const char of identity) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % 2 === 0;
};

/** The full-size layer of a simulcast send: the least scaled-down encoding. */
export const topEncodingIndex = (encodings: RTCRtpEncodingParameters[]): number =>
  encodings.reduce(
    (best, encoding, index) =>
      (encoding.scaleResolutionDownBy ?? 1) < (encodings[best].scaleResolutionDownBy ?? 1)
        ? index
        : best,
    0,
  );

export const initialQpBand = (): QpBandState => ({
  capBps: null,
  low: 0,
  sinceChange: QP_BAND.gapSamples,
});

export const stepQpBand = (
  state: QpBandState,
  qp: number | null,
  bitrateBps: number | null,
  presetCapBps: number,
  floorBps: number,
): { state: QpBandState; changed: boolean } => {
  const sinceChange = state.sinceChange + 1;
  if (qp === null || bitrateBps === null) {
    return { state: { ...state, sinceChange }, changed: false };
  }
  if (qp > QP_BAND.highQp) {
    const changed = state.capBps !== null;
    return {
      state: { capBps: null, low: 0, sinceChange: changed ? 0 : sinceChange },
      changed,
    };
  }
  const low = qp < QP_BAND.lowQp ? state.low + 1 : 0;
  if (low < QP_BAND.holdSamples || sinceChange < QP_BAND.gapSamples) {
    return { state: { ...state, low, sinceChange }, changed: false };
  }
  const current = state.capBps ?? presetCapBps;
  const next = Math.round(
    Math.max(floorBps, Math.min(current * QP_BAND.step, bitrateBps * QP_BAND.headroom)),
  );
  if (next >= current * 0.95) {
    return { state: { ...state, low: 0, sinceChange }, changed: false };
  }
  return { state: { capBps: next, low: 0, sinceChange: 0 }, changed: true };
};

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
