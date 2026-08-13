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
}

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
  decoderImplementation: string | null;
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
  if (!previous) {
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
 * Loss percentage over the interval, not since the session began — a burst of
 * loss two minutes ago must not keep the badge red forever.
 */
export const computePacketLossPct = (
  previous: RateSample | undefined,
  current: RateSample,
): number | null => {
  if (!previous) {
    return null;
  }
  const deltaLost = current.packetsLost - previous.packetsLost;
  const deltaReceived = current.packets - previous.packets;
  if (deltaLost < 0 || deltaReceived < 0) {
    return null;
  }
  const total = deltaLost + deltaReceived;
  if (total <= 0) {
    return 0;
  }
  return Math.round((deltaLost / total) * 1000) / 10;
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
  let bestPixels = -1;
  let frameWidth: number | null = null;
  let frameHeight: number | null = null;
  let framesPerSecond: number | null = null;
  let codec: string | null = null;
  let encoderImplementation: string | null = null;
  let powerEfficient: unknown;
  let qualityLimitationReason: string | null = null;
  let kind: "audio" | "video" = "video";

  for (const entry of outbound) {
    bytesSent += num(entry.bytesSent) ?? 0;
    packetsSent += num(entry.packetsSent) ?? 0;
    framesEncoded += num(entry.framesEncoded) ?? 0;

    const entryKind = str(entry.kind) ?? str(entry.mediaType);
    if (entryKind === "audio") {
      kind = "audio";
    }

    const codecId = str(entry.codecId);
    if (codecId && codecs.has(codecId)) {
      codec = codecs.get(codecId) ?? codec;
    }

    encoderImplementation =
      str(entry.encoderImplementation) ?? encoderImplementation;
    if (typeof entry.powerEfficientEncoder === "boolean") {
      powerEfficient = entry.powerEfficientEncoder;
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
    }
  }

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

  const timestampMs = outbound[0].timestamp;
  const sample: RateSample = {
    timestampMs,
    bytes: bytesSent,
    packets: packetsSent,
    packetsLost,
    frames: framesEncoded,
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
    layerCount: outbound.length,
    availableOutgoingBitrateBps: candidatePair
      ? num(candidatePair.availableOutgoingBitrate)
      : null,
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
  const jitterBufferEmittedCount = num(inbound.jitterBufferEmittedCount);
  const jitterBufferDelayMs =
    jitterBufferDelay !== null &&
    jitterBufferEmittedCount !== null &&
    jitterBufferEmittedCount > 0
      ? Math.round((jitterBufferDelay / jitterBufferEmittedCount) * 1000)
      : null;

  const sample: RateSample = {
    timestampMs: inbound.timestamp,
    bytes: num(inbound.bytesReceived) ?? 0,
    packets: num(inbound.packetsReceived) ?? 0,
    packetsLost: num(inbound.packetsLost) ?? 0,
    frames: num(inbound.framesDecoded) ?? 0,
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
    decoderImplementation: str(inbound.decoderImplementation),
  };
};
