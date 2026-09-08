// Pure reducers over WebRTC getStats() reports.
//
// Kept free of livekit-client / electron imports so the delta math (which is
// the only non-obvious part) can be checked with plain node — see
// scripts/check-media-stats.cjs.

export interface RawStatEntry {
  id: string;
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface RateSample {
  timestampMs: number;
  bytes: number;
  packets: number;
  packetsLost: number;
  frames: number;
  concealedSamples?: number;
  silentConcealedSamples?: number;
  totalSamplesReceived?: number;
  /**
   * Which RTP streams the counters in this sample were summed from.
   *
   * Every delta below subtracts two samples that are only comparable while they
   * describe the same streams. A reconnect gives the track new SSRCs, and the
   * sender summary pools several entries (`packetsSent` over outbound-rtp,
   * `packetsLost` over remote-inbound-rtp) whose CARDINALITY changes at the same
   * moment — mid-renegotiation a report can carry both the old and the new
   * stream. The old counter-reset guards only caught a delta going negative, so
   * a report that gained an entry produced a large positive jump instead:
   * diagnostics logged 90%+ outbound "packet loss" spikes, every one of them
   * within a second of a reconnect and surrounded by 0% samples.
   */
  sourceKey?: string;

  // --- encoder cost, sender side only ---------------------------------------
  // Cumulative counters whose DELTAS answer the question a limitation flag
  // cannot: whether the pixels are arriving late or leaving late.
  /** Seconds of encode work. Divided by frames, this is ms spent per frame. */
  totalEncodeTimeSec?: number;
  /** Frames the source handed over but the pipeline never encoded. */
  framesDropped?: number;
  /** Frames the capture produced, whether or not they were encoded. */
  sourceFrames?: number;
  /** Cumulative seconds the encoder spent limited, split by cause. */
  limitationCpuSec?: number;
  limitationBandwidthSec?: number;
  limitationOtherSec?: number;
  /** Packets the sender re-sent after a NACK. */
  retransmittedPackets?: number;

  // --- receiver side --------------------------------------------------------
  /** Packets that arrived but were thrown away (late, or buffer overrun). */
  packetsDiscarded?: number;
}

/**
 * Two samples are only comparable while they describe the same RTP streams.
 * Undefined on both sides is how the pure-math unit tests call in, and stays
 * comparable.
 */
const sameSource = (previous: RateSample, current: RateSample): boolean => {
  return previous.sourceKey === current.sourceKey;
};

const buildSourceKey = (entries: RawStatEntry[]): string => {
  const ssrcs: string[] = [];
  for (const entry of entries) {
    const ssrc = entry.ssrc;
    if (typeof ssrc === "number" || typeof ssrc === "string") {
      ssrcs.push(`${entry.type}:${ssrc}`);
    }
  }
  return ssrcs.sort().join(",");
};

/**
 * Chromium's stand-in for "no estimate yet", not a real 1 Gbps uplink.
 *
 * The bandwidth estimator needs something to probe with, and an audio-only send
 * never gives it one, so `availableOutgoingBitrate` sits at exactly 1e9. In the
 * diagnostics logs this was every single audio-only sample (6401 of them) and
 * never once a sample that had outbound video — which put means like "981 Mbps
 * available upload" into session summaries and onto the connection panel.
 * Unknown has to read as unknown.
 */
export const BWE_PLACEHOLDER_BPS = 1_000_000_000;

export const readAvailableOutgoingBitrate = (
  value: number | null,
): number | null => {
  if (value === null || value >= BWE_PLACEHOLDER_BPS) {
    return null;
  }
  return value;
};

/** Delta of a cumulative counter, or null when it is not comparable. */
const delta = (
  previous: RateSample | undefined,
  current: RateSample,
  field: keyof RateSample,
): number | null => {
  if (!previous || !sameSource(previous, current)) {
    return null;
  }
  const before = previous[field];
  const after = current[field];
  if (typeof before !== "number" || typeof after !== "number") {
    return null;
  }
  const difference = after - before;
  return difference < 0 ? null : difference;
};

/**
 * Milliseconds of encoder work per frame produced in this window.
 *
 * The one number that separates "the encoder cannot keep up" from "the capture
 * is not producing frames", which look identical in an fps reading and need
 * opposite fixes. A software H.264 encoder at 1080p sits in the high single
 * digits per frame; past ~16ms it cannot sustain 60fps no matter what the
 * capture offers, and past ~33ms it cannot sustain 30.
 */
export const computeEncodeMsPerFrame = (
  previous: RateSample | undefined,
  current: RateSample,
): number | null => {
  const encodeSec = delta(previous, current, "totalEncodeTimeSec");
  const frames = delta(previous, current, "frames");
  if (encodeSec === null || frames === null || frames <= 0) {
    return null;
  }
  return Math.round((encodeSec / frames) * 10000) / 10;
};

/**
 * How much of what the capture produced never reached the encoder.
 *
 * Paired with the source framerate below, this is the whole diagnosis: a
 * capture running at 27fps and dropping nothing is a capture problem (the
 * desktop is not producing frames), while a capture at 60fps dropping half of
 * them is an encoder that cannot keep up.
 */
export const computeFramesDroppedPct = (
  previous: RateSample | undefined,
  current: RateSample,
): number | null => {
  const dropped = delta(previous, current, "framesDropped");
  const encoded = delta(previous, current, "frames");
  if (dropped === null || encoded === null) {
    return null;
  }
  const offered = dropped + encoded;
  if (offered <= 0) {
    return null;
  }
  return Math.round((dropped / offered) * 1000) / 10;
};

/** Share of sent packets that were retransmissions answering a NACK. */
export const computeRetransmittedPct = (
  previous: RateSample | undefined,
  current: RateSample,
): number | null => {
  const retransmitted = delta(previous, current, "retransmittedPackets");
  const packets = delta(previous, current, "packets");
  if (retransmitted === null || packets === null || packets <= 0) {
    return null;
  }
  return Math.round((retransmitted / packets) * 1000) / 10;
};

export interface LimitationSeconds {
  cpu: number;
  bandwidth: number;
  other: number;
}

/**
 * Seconds the encoder spent limited in this window, per cause.
 *
 * Chromium keeps these as cumulative durations, which is a far better answer
 * than the instantaneous `qualityLimitationReason` the collector used to
 * sample: a reason read every two seconds tells you how many samples happened
 * to land inside a limitation, not how long it lasted. A three-hour share
 * reported "cpu" on ten samples out of 2417 and that was all anyone could say
 * about it.
 */
export const computeLimitationSeconds = (
  previous: RateSample | undefined,
  current: RateSample,
): LimitationSeconds | null => {
  const cpu = delta(previous, current, "limitationCpuSec");
  const bandwidth = delta(previous, current, "limitationBandwidthSec");
  const other = delta(previous, current, "limitationOtherSec");
  if (cpu === null && bandwidth === null && other === null) {
    return null;
  }
  return { cpu: cpu ?? 0, bandwidth: bandwidth ?? 0, other: other ?? 0 };
};

/** Share of the window's received audio that was DTX/comfort-noise silence. */
export const computeSilentPct = (
  previous: RateSample | undefined,
  current: RateSample,
): number | null => {
  if (!previous || !sameSource(previous, current)) {
    return null;
  }
  if (
    typeof previous.silentConcealedSamples !== "number" ||
    typeof current.silentConcealedSamples !== "number" ||
    typeof previous.totalSamplesReceived !== "number" ||
    typeof current.totalSamplesReceived !== "number"
  ) {
    return null;
  }
  const silent = current.silentConcealedSamples - previous.silentConcealedSamples;
  const total = current.totalSamplesReceived - previous.totalSamplesReceived;
  if (silent < 0 || total < MIN_CONCEALMENT_WINDOW_SAMPLES) {
    return null;
  }
  return Math.round((Math.min(silent, total) / total) * 1000) / 10;
};

export type RateCache = Map<string, RateSample>;

export interface OutboundTrackStats {
  trackKey: string;
  kind: "audio" | "video";
  codec: string | null;
  bitrateBps: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  framesPerSecond: number | null;
  packetLossPct: number | null;
  rttMs: number | null;
  qualityLimitationReason: string | null;
  encoderImplementation: string | null;
  /** null when the browser reports nothing usable. */
  hardwareEncoder: boolean | null;
  /** Number of active simulcast/SVC layers actually being sent. */
  layerCount: number;
  availableOutgoingBitrateBps: number | null;
  /**
   * What the CAPTURE produced, before the encoder saw it. Read off the
   * media-source stat rather than outbound-rtp, and the difference between the
   * two is the diagnosis: a share requested at 60fps that encodes 27 is a
   * starved capture if this also says 27, and an overloaded encoder if it says
   * 60. Neither the logs nor the UI could tell those apart.
   */
  sourceFramesPerSecond: number | null;
  sourceFrameWidth: number | null;
  sourceFrameHeight: number | null;
  /** Encoder work per frame, in ms. See computeEncodeMsPerFrame. */
  encodeMsPerFrame: number | null;
  /** Percentage of offered frames the pipeline threw away this window. */
  framesDroppedPct: number | null;
  /** Percentage of sent packets that were NACK retransmissions. */
  retransmittedPct: number | null;
  /** Seconds spent limited in this window, per cause. */
  limitationSeconds: LimitationSeconds | null;
  /**
   * Packets counted in the LAST sampling window, so several tracks can be
   * pooled into one figure. packetLossPct is this window's ratio and is null
   * when the window is too small to divide by; the counts stay either way, and
   * pooling them is how a room full of near-silent tracks still produces one
   * honest number. Null until there is a previous sample to subtract.
   */
  window: { packets: number; packetsLost: number } | null;
}

export interface InboundTrackStats {
  trackKey: string;
  kind: "audio" | "video";
  codec: string | null;
  bitrateBps: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  framesPerSecond: number | null;
  packetLossPct: number | null;
  jitterMs: number | null;
  jitterBufferDelayMs: number | null;
  freezeCount: number | null;
  concealmentPct: number | null;
  concealmentEvents: number | null;
  /**
   * The DTX half of the concealment, kept separately rather than folded away.
   *
   * concealmentPct now excludes it (see computeConcealmentPct), which is right
   * for the threshold but throws away the evidence. Keeping it visible is what
   * lets a reader confirm that a quiet-looking track was quiet because nobody
   * was talking, instead of guessing from the bitrate the way this had to be
   * diagnosed the first time.
   */
  silentPct: number | null;
  /** Packets that arrived and were dropped anyway: too late, or buffer full. */
  packetsDiscarded: number | null;
  /** What the jitter buffer is aiming for, vs the delay it is achieving. */
  jitterBufferTargetMs: number | null;
  decoderImplementation: string | null;
  /**
   * Packets counted in the LAST sampling window, so several tracks can be
   * pooled into one figure. packetLossPct is this window's ratio and is null
   * when the window is too small to divide by; the counts stay either way, and
   * pooling them is how a room full of near-silent tracks still produces one
   * honest number. Null until there is a previous sample to subtract.
   */
  window: { packets: number; packetsLost: number } | null;
}

const num = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const str = (value: unknown): string | null => {
  return typeof value === "string" && value.length > 0 ? value : null;
};

// Software encoder/decoder implementation names as reported by Chromium. A
// SimulcastEncoderAdapter wraps its children's names, so a substring match
// covers "SimulcastEncoderAdapter (libvpx, libvpx)" too.
const SOFTWARE_IMPLEMENTATION_PATTERN =
  /libvpx|libaom|openh264|ffmpeg|libx264|dav1d|external decoder \(fallback/i;

export const isHardwareImplementation = (
  implementation: string | null,
  powerEfficient?: unknown,
): boolean | null => {
  if (typeof powerEfficient === "boolean") {
    return powerEfficient;
  }
  if (!implementation) {
    return null;
  }
  if (SOFTWARE_IMPLEMENTATION_PATTERN.test(implementation)) {
    return false;
  }
  return true;
};

/**
 * Bits per second between two cumulative byte samples. Returns null when there
 * is no usable previous sample, when the clock did not advance, or when the
 * counter went backwards (a renegotiation resets it).
 */
export const computeBitrateBps = (
  previous: RateSample | undefined,
  current: RateSample,
): number | null => {
  if (!previous || !sameSource(previous, current)) {
    return null;
  }
  const elapsedMs = current.timestampMs - previous.timestampMs;
  if (elapsedMs <= 0) {
    return null;
  }
  const deltaBytes = current.bytes - previous.bytes;
  if (deltaBytes < 0) {
    return null;
  }
  return Math.round((deltaBytes * 8 * 1000) / elapsedMs);
};

/**
 * Fewest packets in a window before a loss ratio means anything.
 *
 * A ratio needs a denominator, and DTX gives audio a tiny one: a participant
 * who is not speaking sends comfort noise every few hundred milliseconds, so a
 * one-second window can hold three packets. Lose one of them to ordinary jitter
 * and the arithmetic says 33% loss -- for a track carrying silence.
 *
 * That is the bug behind "the lobby is always dropping packets". The badge takes
 * the worst track in the room, so in a ten-person voice room there is
 * essentially always some silent participant whose two-packet window had a gap
 * in it, and the badge stays red while every real stream is fine.
 *
 * 20 is roughly 0.4s of actual speech at Opus's 50 packets/second. A window
 * below it is reported as unknown, not as zero: a track nobody can measure must
 * not be allowed to say the connection is good either.
 */
export const MIN_LOSS_WINDOW_PACKETS = 20;

/**
 * Loss percentage over the interval, not since the session began -- a burst of
 * loss two minutes ago must not keep the badge red forever.
 *
 * Null means "not measurable in this window", which is a different answer from
 * zero and has to stay different. See MIN_LOSS_WINDOW_PACKETS.
 */
export const computePacketLossPct = (
  previous: RateSample | undefined,
  current: RateSample,
): number | null => {
  if (!previous || !sameSource(previous, current)) {
    return null;
  }
  const deltaLost = current.packetsLost - previous.packetsLost;
  const deltaReceived = current.packets - previous.packets;
  if (deltaLost < 0 || deltaReceived < 0) {
    return null;
  }
  if (deltaLost + deltaReceived < MIN_LOSS_WINDOW_PACKETS) {
    return null;
  }
  return Math.round((deltaLost / (deltaLost + deltaReceived)) * 1000) / 10;
};

/**
 * One loss figure for a whole direction, pooled rather than picked.
 *
 * The badge used to take the maximum across every audio track in the room,
 * which is the wrong shape twice over: it lets one participant's bad uplink --
 * which the person reading the badge can do nothing about -- describe the whole
 * call, and it promotes any single unmeasurable track to the headline. Pooling
 * the counters answers the question the badge is actually asking: of everything
 * sent to this machine in this window, how much arrived.
 *
 * Null when the pooled window is still too small to divide by.
 */
/**
 * The packet counters for one sampling window, or null when there is nothing to
 * subtract from yet. A counter that went backwards is a renegotiation reset and
 * is reported as no window rather than as a negative one.
 */
export const packetWindow = (
  previous: RateSample | undefined,
  current: RateSample,
): { packets: number; packetsLost: number } | null => {
  if (!previous || !sameSource(previous, current)) {
    return null;
  }
  const packets = current.packets - previous.packets;
  const packetsLost = current.packetsLost - previous.packetsLost;
  if (packets < 0 || packetsLost < 0) {
    return null;
  }
  return { packets, packetsLost };
};

export const MIN_CONCEALMENT_WINDOW_SAMPLES = 4800;

/**
 * How much of the window the listener actually heard as damaged.
 *
 * `concealedSamples` alone does NOT answer that, and reading it as if it did is
 * what made "Ses kesintili geldi" fire on healthy calls. Chromium counts the
 * comfort noise it generates for an Opus DTX gap as concealment too, so a
 * participant who is simply not talking reports near-100% concealment — and we
 * publish with `dtx: true`, so somebody in the room is always silent. The
 * diagnostics bore this out: of the samples flagged over the 3% threshold,
 * every one where the sender was under 2 kbps (i.e. sending comfort noise) sat
 * at a 78% mean, while every bucket carrying real speech averaged under 0.25%.
 *
 * `silentConcealedSamples` is the subset that was filled with silence rather
 * than with an attempt at the missing audio, so subtracting it leaves the
 * concealment a human would notice.
 */
export const computeConcealmentPct = (
  previous: RateSample | undefined,
  current: RateSample,
): number | null => {
  if (!previous || !sameSource(previous, current)) {
    return null;
  }
  if (
    typeof previous.concealedSamples !== "number" ||
    typeof current.concealedSamples !== "number" ||
    typeof previous.totalSamplesReceived !== "number" ||
    typeof current.totalSamplesReceived !== "number"
  ) {
    return null;
  }

  const deltaConcealed = current.concealedSamples - previous.concealedSamples;
  const deltaTotal =
    current.totalSamplesReceived - previous.totalSamplesReceived;
  if (deltaConcealed < 0 || deltaTotal < MIN_CONCEALMENT_WINDOW_SAMPLES) {
    return null;
  }

  // Absent on a browser that does not report it: then the number is the old,
  // DTX-contaminated one rather than nothing at all.
  const deltaSilent =
    typeof previous.silentConcealedSamples === "number" &&
    typeof current.silentConcealedSamples === "number"
      ? current.silentConcealedSamples - previous.silentConcealedSamples
      : 0;

  // Clamped rather than trusted: the two counters are updated independently and
  // a window can straddle an update of one but not the other.
  const audible = Math.min(
    Math.max(deltaConcealed - Math.max(deltaSilent, 0), 0),
    deltaTotal,
  );

  return Math.round((audible / deltaTotal) * 1000) / 10;
};

export const poolPacketLossPct = (
  samples: { packetsLost: number; packets: number }[],
): number | null => {
  let lost = 0;
  let received = 0;

  for (const sample of samples) {
    if (sample.packetsLost < 0 || sample.packets < 0) {
      continue;
    }
    lost += sample.packetsLost;
    received += sample.packets;
  }

  if (lost + received < MIN_LOSS_WINDOW_PACKETS) {
    return null;
  }
  return Math.round((lost / (lost + received)) * 1000) / 10;
};

export type QualityLimitationKind = "bandwidth" | "cpu" | "other";

export interface QualityLimitationVerdict {
  kind: QualityLimitationKind;
  trackKey: string;
  /** True when the encoder is running in software and the limit is CPU-bound. */
  softwareEncoderAtFault: boolean;
}

/**
 * Which video track, if any, is being held back right now.
 *
 * WebRTC already lowers bitrate on its own, so this does not try to
 * re-implement congestion control. What was missing is telling the user *why*
 * their stream looks bad — a CPU-limited software encoder and a saturated
 * uplink look identical on screen but need opposite fixes.
 *
 * ponytail: reports only; it does not re-encode at a lower preset. Add that if
 * simulcast/SVC layer dropping turns out not to be enough on real uplinks.
 */
export const findQualityLimitation = (
  outbound: OutboundTrackStats[],
): QualityLimitationVerdict | null => {
  for (const entry of outbound) {
    if (entry.kind !== "video" || !entry.qualityLimitationReason) {
      continue;
    }

    const reason = entry.qualityLimitationReason;
    const kind: QualityLimitationKind =
      reason === "bandwidth" || reason === "cpu" ? reason : "other";

    return {
      kind,
      trackKey: entry.trackKey,
      softwareEncoderAtFault: kind === "cpu" && entry.hardwareEncoder === false,
    };
  }

  return null;
};

const buildCodecMap = (entries: RawStatEntry[]): Map<string, string> => {
  const codecs = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type !== "codec") {
      continue;
    }
    const mimeType = str(entry.mimeType);
    if (mimeType) {
      codecs.set(entry.id, mimeType.split("/").pop() ?? mimeType);
    }
  }
  return codecs;
};

// Chromium reports several candidate pairs; only the nominated/succeeded one
// describes the path actually carrying media.
const findSelectedCandidatePair = (
  entries: RawStatEntry[],
): RawStatEntry | null => {
  let fallback: RawStatEntry | null = null;
  for (const entry of entries) {
    if (entry.type !== "candidate-pair") {
      continue;
    }
    if (entry.nominated === true && entry.state === "succeeded") {
      return entry;
    }
    if (entry.state === "succeeded") {
      fallback = fallback ?? entry;
    }
  }
  return fallback;
};

export const summarizeSenderReport = (
  entries: RawStatEntry[],
  cache: RateCache,
  trackKey: string,
): OutboundTrackStats | null => {
  const outbound = entries.filter((entry) => entry.type === "outbound-rtp");
  if (outbound.length === 0) {
    return null;
  }

  const codecs = buildCodecMap(entries);
  const candidatePair = findSelectedCandidatePair(entries);

  let bytesSent = 0;
  let packetsSent = 0;
  let framesEncoded = 0;
  let totalEncodeTimeSec = 0;
  let framesDropped = 0;
  let retransmittedPackets = 0;
  let limitationCpuSec = 0;
  let limitationBandwidthSec = 0;
  let limitationOtherSec = 0;
  let bestPixels = -1;
  let frameWidth: number | null = null;
  let frameHeight: number | null = null;
  let framesPerSecond: number | null = null;
  let codec: string | null = null;
  let qualityLimitationReason: string | null = null;
  let kind: "audio" | "video" = "video";
  // The entry the reported frame size came from. Everything about the ENCODER
  // is read off this one entry rather than whichever happened to be last.
  let topLayer: RawStatEntry | null = null;

  for (const entry of outbound) {
    bytesSent += num(entry.bytesSent) ?? 0;
    packetsSent += num(entry.packetsSent) ?? 0;
    framesEncoded += num(entry.framesEncoded) ?? 0;
    totalEncodeTimeSec += num(entry.totalEncodeTime) ?? 0;
    framesDropped += num(entry.framesDropped) ?? 0;
    retransmittedPackets += num(entry.retransmittedPacketsSent) ?? 0;

    // Cumulative durations, pooled the same way the byte counters are. A
    // simulcast send reports them per layer and any layer being held back holds
    // the picture back.
    const durations = entry.qualityLimitationDurations as
      | Record<string, unknown>
      | undefined;
    if (durations && typeof durations === "object") {
      limitationCpuSec += num(durations.cpu) ?? 0;
      limitationBandwidthSec += num(durations.bandwidth) ?? 0;
      limitationOtherSec += num(durations.other) ?? 0;
    }

    const entryKind = str(entry.kind) ?? str(entry.mediaType);
    if (entryKind === "audio") {
      kind = "audio";
    }

    const codecId = str(entry.codecId);
    if (codecId && codecs.has(codecId)) {
      codec = codecs.get(codecId) ?? codec;
    }

    qualityLimitationReason =
      str(entry.qualityLimitationReason) ?? qualityLimitationReason;

    // Simulcast: report the highest layer actually being produced, since that
    // is the ceiling the receiver can ask for.
    const width = num(entry.frameWidth);
    const height = num(entry.frameHeight);
    if (width !== null && height !== null && width * height > bestPixels) {
      bestPixels = width * height;
      frameWidth = width;
      frameHeight = height;
      framesPerSecond = num(entry.framesPerSecond);
      topLayer = entry;
    }
  }

  // Read the encoder off the top layer, not off whichever entry came last.
  //
  // A simulcast send is several outbound-rtp entries and they do NOT have to
  // agree: hardware encoders have minimum-resolution and instance limits, so
  // Chromium routinely encodes the 1440p layer on the GPU and the 360p thumbnail
  // in libvpx. Both report their own encoderImplementation and
  // powerEfficientEncoder. Taking the last one meant the answer depended on the
  // order Chromium happened to emit the layers in, and when a software thumbnail
  // landed last the panel told a user with hardware acceleration ON that their
  // video was being encoded in software.
  //
  // The top layer is the honest answer: it is the one carrying the picture, the
  // one whose cost matters, and the one the resolution shown beside it came from.
  // Audio (and video before its first frame) has no dimensions and so no top
  // layer; fall back to the last entry, which is all there is.
  const encoderSource = topLayer ?? outbound[outbound.length - 1];
  const encoderImplementation = str(encoderSource.encoderImplementation);
  const powerEfficient =
    typeof encoderSource.powerEfficientEncoder === "boolean"
      ? encoderSource.powerEfficientEncoder
      : undefined;

  let packetsLost = 0;
  let rttMs: number | null = null;
  for (const entry of entries) {
    if (entry.type !== "remote-inbound-rtp") {
      continue;
    }
    packetsLost += num(entry.packetsLost) ?? 0;
    const roundTripTime = num(entry.roundTripTime);
    if (roundTripTime !== null) {
      rttMs = Math.round(roundTripTime * 1000);
    }
  }

  if (rttMs === null && candidatePair) {
    const pairRtt = num(candidatePair.currentRoundTripTime);
    rttMs = pairRtt === null ? null : Math.round(pairRtt * 1000);
  }

  // The capture, not the encoder. Chromium publishes it as its own stat entry
  // and nothing here used to read it, which is why "requested 60fps, encoded
  // 27" was unanswerable: the missing half of that comparison lives here.
  const mediaSource =
    entries.find(
      (entry) => entry.type === "media-source" && str(entry.kind) === "video",
    ) ?? null;

  const timestampMs = outbound[0].timestamp;
  const sample: RateSample = {
    timestampMs,
    bytes: bytesSent,
    packets: packetsSent,
    packetsLost,
    frames: framesEncoded,
    totalEncodeTimeSec,
    framesDropped,
    retransmittedPackets,
    limitationCpuSec,
    limitationBandwidthSec,
    limitationOtherSec,
    ...(mediaSource ? { sourceFrames: num(mediaSource.frames) ?? 0 } : {}),
    // Both sides of the loss ratio: `packets` is pooled over outbound-rtp and
    // `packetsLost` over remote-inbound-rtp, so either set changing shape
    // invalidates the subtraction.
    sourceKey: buildSourceKey(
      entries.filter(
        (entry) =>
          entry.type === "outbound-rtp" || entry.type === "remote-inbound-rtp",
      ),
    ),
  };
  const previous = cache.get(trackKey);
  cache.set(trackKey, sample);

  return {
    trackKey,
    kind,
    codec,
    bitrateBps: computeBitrateBps(previous, sample),
    frameWidth,
    frameHeight,
    framesPerSecond,
    packetLossPct: computePacketLossPct(previous, sample),
    rttMs,
    // "none" is Chromium's way of saying "not limited"; surfacing it as a
    // reason would make a perfectly healthy stream look degraded.
    qualityLimitationReason:
      qualityLimitationReason === "none" ? null : qualityLimitationReason,
    encoderImplementation,
    hardwareEncoder: isHardwareImplementation(
      encoderImplementation,
      powerEfficient,
    ),
    window: packetWindow(previous, sample),
    layerCount: outbound.length,
    availableOutgoingBitrateBps: readAvailableOutgoingBitrate(
      candidatePair ? num(candidatePair.availableOutgoingBitrate) : null,
    ),
    sourceFramesPerSecond: mediaSource
      ? num(mediaSource.framesPerSecond)
      : null,
    sourceFrameWidth: mediaSource ? num(mediaSource.width) : null,
    sourceFrameHeight: mediaSource ? num(mediaSource.height) : null,
    encodeMsPerFrame: computeEncodeMsPerFrame(previous, sample),
    framesDroppedPct: computeFramesDroppedPct(previous, sample),
    retransmittedPct: computeRetransmittedPct(previous, sample),
    limitationSeconds: computeLimitationSeconds(previous, sample),
  };
};

export const summarizeReceiverReport = (
  entries: RawStatEntry[],
  cache: RateCache,
  trackKey: string,
): InboundTrackStats | null => {
  const inbound = entries.find((entry) => entry.type === "inbound-rtp");
  if (!inbound) {
    return null;
  }

  const codecs = buildCodecMap(entries);
  const codecId = str(inbound.codecId);

  const jitterBufferDelay = num(inbound.jitterBufferDelay);
  const jitterBufferTargetDelay = num(inbound.jitterBufferTargetDelay);
  const jitterBufferEmittedCount = num(inbound.jitterBufferEmittedCount);
  const jitterBufferDelayMs =
    jitterBufferDelay !== null &&
    jitterBufferEmittedCount !== null &&
    jitterBufferEmittedCount > 0
      ? Math.round((jitterBufferDelay / jitterBufferEmittedCount) * 1000)
      : null;

  const concealedSamples = num(inbound.concealedSamples);
  const silentConcealedSamples = num(inbound.silentConcealedSamples);
  const totalSamplesReceived = num(inbound.totalSamplesReceived);

  const sample: RateSample = {
    timestampMs: inbound.timestamp,
    bytes: num(inbound.bytesReceived) ?? 0,
    packets: num(inbound.packetsReceived) ?? 0,
    packetsLost: num(inbound.packetsLost) ?? 0,
    frames: num(inbound.framesDecoded) ?? 0,
    ...(concealedSamples !== null ? { concealedSamples } : {}),
    ...(silentConcealedSamples !== null ? { silentConcealedSamples } : {}),
    ...(totalSamplesReceived !== null ? { totalSamplesReceived } : {}),
    packetsDiscarded: num(inbound.packetsDiscarded) ?? 0,
    sourceKey: buildSourceKey([inbound]),
  };
  const previous = cache.get(trackKey);
  cache.set(trackKey, sample);

  const jitter = num(inbound.jitter);

  return {
    trackKey,
    kind: str(inbound.kind) === "audio" ? "audio" : "video",
    codec: codecId ? (codecs.get(codecId) ?? null) : null,
    bitrateBps: computeBitrateBps(previous, sample),
    frameWidth: num(inbound.frameWidth),
    frameHeight: num(inbound.frameHeight),
    framesPerSecond: num(inbound.framesPerSecond),
    packetLossPct: computePacketLossPct(previous, sample),
    jitterMs: jitter === null ? null : Math.round(jitter * 1000),
    jitterBufferDelayMs,
    freezeCount: num(inbound.freezeCount),
    concealmentPct: computeConcealmentPct(previous, sample),
    concealmentEvents: num(inbound.concealmentEvents),
    silentPct: computeSilentPct(previous, sample),
    packetsDiscarded: delta(previous, sample, "packetsDiscarded"),
    jitterBufferTargetMs:
      jitterBufferTargetDelay !== null &&
      jitterBufferEmittedCount !== null &&
      jitterBufferEmittedCount > 0
        ? Math.round((jitterBufferTargetDelay / jitterBufferEmittedCount) * 1000)
        : null,
    decoderImplementation: str(inbound.decoderImplementation),
    window: packetWindow(previous, sample),
  };
};
