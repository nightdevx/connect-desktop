import type {
  InboundTrackStats,
  MediaIcePaths,
  OutboundTrackStats,
} from "./media-stats";

export const MEDIA_DIAGNOSTICS_SCHEMA_VERSION = 3;

export interface MediaDiagnosticsStatsInput {
  at: number;
  rttMs: number | null;
  availableOutgoingBitrateBps: number | null;
  outbound: OutboundTrackStats[];
  inbound: InboundTrackStats[];
  /** Optional so stats recorded by callers that predate it still type-check. */
  icePaths?: MediaIcePaths;
}

/**
 * How many samples each connection spent on each network path, keyed like
 * "udp/srflx", "tcp/host" or "udp/relay" (protocol / this machine's candidate
 * type). Anything other than udp with a host, srflx or prflx candidate means
 * the media was not on the direct UDP path the SFU is set up for.
 */
export interface MediaDiagnosticsIcePathSamples {
  publisher: Record<string, number>;
  subscriber: Record<string, number>;
}

export const MEDIA_DIAGNOSTICS_LIMITS = {
  flushIntervalMs: 20_000,
  // Mirrors MediaStatsCollector's DEFAULT_INTERVAL_MS, which is what actually
  // drives recordStats — this said 10s while the real cadence was 2s, so the
  // per-session entry budget below was being spent five times faster than the
  // number it was sized against. Keep the two in step; check-media-diagnostics
  // asserts it.
  sampleIntervalMs: 2_000,
  maxEntriesPerBatch: 400,
  maxEntriesPerSession: 20_000,
  maxDataBytesPerEntry: 4_000,
  maxPendingEntries: 4_000,
} as const;

export type MediaDiagnosticsEntryKind = "event" | "sample";

export type MediaDiagnosticsScope =
  | "session"
  | "stats"
  | "stream-manager"
  | "mic-controller"
  | "remote-media"
  | "screen-capture"
  | "loopback-audio";

export interface MediaDiagnosticsEntry {
  seq: number;
  atMs: number;
  tMs: number;
  kind: MediaDiagnosticsEntryKind;
  scope: string;
  name: string;
  data?: Record<string, unknown>;
}

export interface MediaDiagnosticsGpu {
  videoEncode: string;
  videoDecode: string;
  gpuCompositing: string;
}

export interface MediaDiagnosticsPrefs {
  videoCodec: string;
  hardwareAcceleration: boolean;
  enhancedNoiseSuppression: boolean;
  noiseSuppressionPreset: string;
  echoCancellation: boolean;
  microphoneVolumePct: number;
  masterVolumePct: number;
}

export interface MediaDiagnosticsClient {
  appVersion: string;
  platform: string;
  osVersion: string;
  electronVersion: string;
  chromeVersion: string;
  cpuThreads: number | null;
  deviceMemoryGb: number | null;
  gpu: MediaDiagnosticsGpu | null;
  prefs: MediaDiagnosticsPrefs | null;
  hardwareSvcCodec: string | null;
  audioInputCount: number | null;
  audioOutputCount: number | null;
}

export interface MediaDiagnosticsStat {
  n: number;
  min: number;
  max: number;
  mean: number;
}

export interface MediaDiagnosticsOutboundVideoSummary {
  codecs: Record<string, number>;
  encoderImplementations: Record<string, number>;
  hardwareEncoderSamples: number;
  softwareEncoderSamples: number;
  resolutions: Record<string, number>;
  layerCounts: Record<string, number>;
  fps: MediaDiagnosticsStat | null;
  bitrateBps: MediaDiagnosticsStat | null;
  /** Sample counts. Kept for continuity; limitationSeconds is the real answer. */
  limitation: {
    none: number;
    cpu: number;
    bandwidth: number;
    other: number;
  };
  /**
   * How LONG the encoder was held back, per cause, in seconds.
   *
   * The counts above only say how many two-second samples happened to land
   * inside a limitation. A three-hour screen share reported "cpu" on ten of
   * 2417 samples, which is not enough to tell anyone whether the problem lasted
   * twenty seconds or twenty minutes. Chromium keeps the real durations; these
   * are them.
   */
  limitationSeconds: { cpu: number; bandwidth: number; other: number };
  /** Encoder work per frame in ms. Over ~16ms, 60fps is not reachable. */
  encodeMsPerFrame: MediaDiagnosticsStat | null;
  /** Offered frames the pipeline threw away, as a percentage. */
  framesDroppedPct: MediaDiagnosticsStat | null;
  /**
   * What the CAPTURE produced, against which `fps` above is the encoder's
   * output. Equal and low means the desktop never produced the frames; source
   * high and fps low means the encoder could not keep up. Those need opposite
   * fixes and used to be indistinguishable.
   */
  sourceFps: MediaDiagnosticsStat | null;
  sourceResolutions: Record<string, number>;
  retransmittedPct: MediaDiagnosticsStat | null;
  /**
   * Mean QP per sample: the encoder's own measure of how coarse the picture
   * is (H.264: above 37 is visibly blocky). Key frames and PLIs over the
   * session. All three are absent from sessions recorded before they were.
   */
  qp?: MediaDiagnosticsStat | null;
  keyFrames?: number;
  pli?: number;
}

/**
 * One contiguous stretch during which a problem was actually happening.
 *
 * The session tags say a problem occurred somewhere in three hours; this says
 * when, for how long, and how bad it got. Reading the old logs meant scanning
 * 5905 sample rows by hand to find the four that mattered.
 */
export interface MediaDiagnosticsEpisode {
  problem: string;
  /** Milliseconds from session start, matching an entry's tMs. */
  startMs: number;
  endMs: number;
  samples: number;
  /** Worst value seen in the episode, in the problem's own unit. */
  peak: number | null;
}

/**
 * Per-remote-participant receive quality.
 *
 * Whether one person sounds bad or everyone does is the difference between
 * "their uplink" and "your downlink", and it was not answerable from the old
 * summary: every remote track was pooled into one number. The identity is the
 * LiveKit identity, which is the user id — the admin side can resolve a name
 * from it without the client having to carry one into the media layer.
 */
export interface MediaDiagnosticsRemoteSummary {
  identity: string;
  samples: number;
  packetLossPct: MediaDiagnosticsStat | null;
  concealmentPct: MediaDiagnosticsStat | null;
  jitterMs: MediaDiagnosticsStat | null;
  bitrateBps: MediaDiagnosticsStat | null;
}

/**
 * The one-line answer, with the numbers that produced it.
 *
 * The problem tags are a vocabulary, not a diagnosis: "packet-loss,
 * audio-concealment" appears on a healthy call and on a broken one. This ranks
 * the causes that are actually actionable and states the evidence, so the
 * person reading a session does not have to know which threshold means what.
 */
export interface MediaDiagnosticsVerdict {
  code: string;
  headline: string;
  evidence: string[];
}

export interface MediaDiagnosticsInboundVideoSummary {
  resolutions: Record<string, number>;
  fps: MediaDiagnosticsStat | null;
  bitrateBps: MediaDiagnosticsStat | null;
  freezeCountMax: number;
  jitterBufferMsMax: number;
  /**
   * How long pictures stood frozen in all (ms), and how unevenly frames came
   * per sample (standard deviation of the gap, ms). freezeCountMax counts a
   * still screen sending one frame a second as freezing; these are what tell
   * a stutter from that. Absent from sessions recorded before they were.
   */
  freezeMs?: number;
  frameIntervalStdDevMs?: MediaDiagnosticsStat | null;
  hardwareDecoderSamples?: number;
  softwareDecoderSamples?: number;
}

export interface MediaDiagnosticsSummary {
  durationMs: number;
  entries: number;
  events: number;
  samples: number;
  truncated: boolean;
  rttMs: MediaDiagnosticsStat | null;
  availableOutgoingBitrateBps: MediaDiagnosticsStat | null;
  outboundAudioBitrateBps: MediaDiagnosticsStat | null;
  outboundVideo: MediaDiagnosticsOutboundVideoSummary | null;
  inboundVideo: MediaDiagnosticsInboundVideoSummary | null;
  inboundAudioConcealmentPct: MediaDiagnosticsStat | null;
  inboundAudioJitterMs: MediaDiagnosticsStat | null;
  packetLossOutboundPct: MediaDiagnosticsStat | null;
  packetLossInboundPct: MediaDiagnosticsStat | null;
  eventCounts: Record<string, number>;
  warnings: Record<string, number>;
  problems: string[];
  episodes: MediaDiagnosticsEpisode[];
  remotes: MediaDiagnosticsRemoteSummary[];
  verdicts: MediaDiagnosticsVerdict[];
  /** Absent from sessions recorded before the path was measured. */
  icePathSamples?: MediaDiagnosticsIcePathSamples;
}

export interface MediaDiagnosticsSessionMeta {
  sessionId: string;
  schemaVersion: number;
  startedAtMs: number;
  lobbyId: string;
  client: MediaDiagnosticsClient;
}

export interface MediaDiagnosticsBatch {
  sessionId: string;
  schemaVersion: number;
  seq: number;
  startedAtMs: number;
  lobbyId: string;
  client: MediaDiagnosticsClient;
  summary: MediaDiagnosticsSummary;
  entries: MediaDiagnosticsEntry[];
  final: boolean;
}

export type MediaDiagnosticsBatchWire = Omit<
  MediaDiagnosticsBatch,
  "client" | "summary"
> & {
  client: unknown;
  summary: unknown;
};

export const MEDIA_DIAGNOSTIC_PROBLEMS = {
  softwareEncoder: "software-encoder",
  cpuLimited: "cpu-limited",
  bandwidthLimited: "bandwidth-limited",
  codecFallback: "codec-fallback",
  qualityStepDown: "quality-step-down",
  receiverFreezes: "receiver-freezes",
  highRtt: "high-rtt",
  packetLoss: "packet-loss",
  audioConcealment: "audio-concealment",
  streamPaused: "stream-paused",
  publishMismatch: "publish-encoding-mismatch",
  micFallback: "microphone-fallback",
  reconnects: "reconnects",
  relayPath: "relay-path",
  tcpMedia: "tcp-media",
} as const;

export type MediaDiagnosticProblem =
  (typeof MEDIA_DIAGNOSTIC_PROBLEMS)[keyof typeof MEDIA_DIAGNOSTIC_PROBLEMS];

export const MEDIA_DIAGNOSTIC_PROBLEM_LABELS: Record<string, string> = {
  "software-encoder": "Video yazılımla kodlandı",
  "cpu-limited": "İşlemci yayına yetişemedi",
  "bandwidth-limited": "Yükleme hızı yetmedi",
  "codec-fallback": "Donanım codec'i kullanılamadı, H.264'e dönüldü",
  "quality-step-down": "Yayın kalitesi otomatik düşürüldü",
  "receiver-freezes": "Alınan görüntü dondu",
  "high-rtt": "Gecikme yüksek",
  "packet-loss": "Paket kaybı",
  "audio-concealment": "Ses kesintili geldi",
  "stream-paused": "SFU yayını duraklattı",
  "publish-encoding-mismatch": "Kodlayıcı istenen ayarı uygulamadı",
  "microphone-fallback": "Mikrofon işleme zinciri kurulamadı",
  reconnects: "Bağlantı koptu ve yeniden kuruldu",
  "relay-path": "Medya TURN aktarma sunucusundan aktı",
  "tcp-media": "Medya TCP yedek yolundan aktı",
};

export const MEDIA_DIAGNOSTIC_THRESHOLDS = {
  highRttMs: 200,
  packetLossPct: 3,
  audioConcealmentPct: 3,
  freezeCount: 1,
  /**
   * Consecutive samples a threshold must stay breached before the session is
   * tagged with the problem.
   *
   * A tag derived from a single sample is a tag that is always on. Every
   * session ever uploaded carried "packet-loss" — including ones whose mean
   * loss was 0.01% — because one sample somewhere had touched 3%, and the
   * biggest single source of those was a reconnect corrupting the delta math.
   * The tags are the admin table's filter, so a tag that never discriminates
   * costs the whole feature.
   *
   * Two samples is 4s at sampleIntervalMs. It clears one-off spikes and keeps
   * everything that lasted, which is the distinction a reader needs. The
   * user-facing warning has always had a dwell of its own
   * (QUALITY_LIMITATION_TICKS); this is the same idea for the log.
   */
  problemDwellSamples: 2,
} as const;

export interface MediaDiagnosticsSessionRow {
  sessionId: string;
  userId: string;
  username: string;
  lobbyId: string;
  schemaVersion: number;
  startedAt: string;
  lastSeenAt: string;
  entryCount: number;
  batchCount: number;
  closed: boolean;
  problems: string[];
  client: MediaDiagnosticsClient | null;
  summary: MediaDiagnosticsSummary | null;
}

export interface MediaDiagnosticsSessionQuery {
  userId?: string;
  lobbyId?: string;
  problem?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export const emptyStat = (): MediaDiagnosticsStat => ({
  n: 0,
  min: 0,
  max: 0,
  mean: 0,
});

export const pushStat = (
  stat: MediaDiagnosticsStat | null,
  value: number | null | undefined,
): MediaDiagnosticsStat | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return stat;
  }

  if (!stat || stat.n === 0) {
    return { n: 1, min: value, max: value, mean: value };
  }

  const n = stat.n + 1;
  return {
    n,
    min: Math.min(stat.min, value),
    max: Math.max(stat.max, value),
    mean: stat.mean + (value - stat.mean) / n,
  };
};

export const roundStat = (
  stat: MediaDiagnosticsStat | null,
): MediaDiagnosticsStat | null => {
  if (!stat) {
    return null;
  }
  const round = (value: number): number => Math.round(value * 100) / 100;
  return {
    n: stat.n,
    min: round(stat.min),
    max: round(stat.max),
    mean: round(stat.mean),
  };
};

export const bump = (counter: Record<string, number>, key: string): void => {
  if (!key) {
    return;
  }
  counter[key] = (counter[key] ?? 0) + 1;
};

export const MEDIA_DIAGNOSTICS_MAX_EPISODES = 40;
export const MEDIA_DIAGNOSTICS_MAX_REMOTES = 16;

const seconds = (ms: number): string => `${Math.round(ms / 1000)} sn`;
const pct = (value: number): string => `%${Math.round(value * 10) / 10}`;

/**
 * Ranks what actually went wrong, most actionable first.
 *
 * Deliberately a pure function over the finished summary: the collector calls
 * it at flush time, and the admin reader can call it again on a session stored
 * months ago without the client that produced it. Every verdict carries the
 * numbers behind it, because a headline nobody can check is a headline nobody
 * acts on.
 */
export const deriveVerdicts = (
  summary: MediaDiagnosticsSummary,
): MediaDiagnosticsVerdict[] => {
  const verdicts: MediaDiagnosticsVerdict[] = [];
  const video = summary.outboundVideo;

  if (video) {
    // How long video was PUBLISHING, not how long the session lasted. A
    // three-hour lobby session carrying a forty-minute share would otherwise
    // divide by the wrong number and report a real problem as a rounding error.
    const shareSec = Math.max(
      (video.fps?.n ?? 0) * (MEDIA_DIAGNOSTICS_LIMITS.sampleIntervalMs / 1000),
      1,
    );
    const limited = video.limitationSeconds;
    const encodeMs = video.encodeMsPerFrame?.mean ?? null;
    const sourceFps = video.sourceFps?.mean ?? null;
    // The summary does not carry the preset's frame rate; the capture's own
    // peak stands in for it, since a 60 fps preset shows 60 at its best. A
    // fixed "under 45" called every 1080p30 share a starved capture.
    const targetFps = (video.sourceFps?.max ?? 0) >= 50 ? 60 : 30;
    const encodedFps = video.fps?.mean ?? null;
    const software =
      video.softwareEncoderSamples > 0 && video.hardwareEncoderSamples === 0;

    // The headline finding from the field logs: three hours of 1080p encoded by
    // two software H.264 instances, on a machine whose owner had hardware
    // acceleration switched on.
    if (software && limited.cpu >= 5) {
      verdicts.push({
        code: "software-encoder-cpu-bound",
        headline:
          "Video yazılımla kodlandı ve işlemci yetişemedi; donanım kodlayıcı devrede değil.",
        evidence: [
          `işlemci kısıtı ${seconds(limited.cpu * 1000)} — yayın süresinin ${pct((limited.cpu / shareSec) * 100)} kadarı`,
          `kodlayıcı: ${Object.keys(video.encoderImplementations).join(", ") || "bilinmiyor"}`,
          ...(encodeMs !== null ? [`kare başına ${encodeMs} ms kodlama`] : []),
        ],
      });
    } else if (limited.cpu >= 5) {
      verdicts.push({
        code: "cpu-bound",
        headline: "İşlemci seçilen yayın kalitesini karşılayamadı.",
        evidence: [
          `işlemci kısıtı ${seconds(limited.cpu * 1000)}`,
          ...(encodeMs !== null ? [`kare başına ${encodeMs} ms kodlama`] : []),
        ],
      });
    }

    // Capture starvation vs encoder overload. Same symptom on screen, opposite
    // fixes, and the old summary could not tell them apart at all.
    if (
      sourceFps !== null &&
      encodedFps !== null &&
      sourceFps > 0 &&
      encodedFps / sourceFps < 0.7
    ) {
      verdicts.push({
        code: "encoder-drops-frames",
        headline:
          "Kaynak kareleri üretti ama kodlayıcı yetiştiremedi; kareler düşürüldü.",
        evidence: [
          `kaynak ${Math.round(sourceFps)} fps, kodlanan ${Math.round(encodedFps)} fps`,
          ...(video.framesDroppedPct
            ? [`düşürülen kare ${pct(video.framesDroppedPct.mean)}`]
            : []),
        ],
      });
    } else if (
      sourceFps !== null &&
      video.sourceResolutions &&
      sourceFps > 0 &&
      sourceFps < targetFps * 0.8 &&
      Object.keys(video.sourceResolutions).some((key) => key.includes("1080") || key.includes("1440") || key.includes("2160"))
    ) {
      verdicts.push({
        code: "capture-starved",
        headline:
          "Ekran yakalama istenen kare hızını üretemedi; darboğaz kodlayıcıda değil, kaynakta.",
        evidence: [
          `kaynak ortalama ${Math.round(sourceFps)} fps, hedef ${targetFps} fps`,
          `çözünürlük: ${Object.keys(video.sourceResolutions).join(", ")}`,
        ],
      });
    }

    // A coarse picture with the uplink to spare: the encoder spent its whole
    // bitrate ceiling and it was not enough for the content, so the preset's
    // ceiling is what to raise. H.264 only: 37 is libwebrtc's own high-QP mark
    // for it, and VP8, VP9 and AV1 count QP on other scales.
    const qp = video.qp ?? null;
    const codecs = Object.keys(video.codecs);
    if (
      qp !== null &&
      qp.n >= 15 &&
      qp.mean >= 37 &&
      codecs.length > 0 &&
      codecs.every((codec) => codec.startsWith("H264")) &&
      limited.bandwidth < shareSec * 0.1
    ) {
      verdicts.push({
        code: "encoder-quality-bound",
        headline:
          "Yükleme yeterliyken görüntü kaba kodlandı; seçilen kalitenin bit hızı tavanı bu içeriğe yetmiyor.",
        evidence: [
          `QP ortalama ${qp.mean}, en yüksek ${qp.max} (H.264'te 37 üstü gözle görülür bloklanma)`,
          ...(video.bitrateBps
            ? [
                `gönderilen ortalama ${Math.round(video.bitrateBps.mean / 100_000) / 10} Mbps`,
              ]
            : []),
          `bant genişliği kısıtı ${seconds(limited.bandwidth * 1000)}`,
        ],
      });
    }

    if (limited.bandwidth >= 5) {
      verdicts.push({
        code: "uplink-bound",
        headline: "Yükleme hızı seçilen yayın kalitesine yetmedi.",
        evidence: [
          `bant genişliği kısıtı ${seconds(limited.bandwidth * 1000)}`,
          ...(summary.availableOutgoingBitrateBps
            ? [
                `ölçülen uplink tahmini min ${Math.round(summary.availableOutgoingBitrateBps.min / 1000)} kbps`,
              ]
            : []),
        ],
      });
    }
  }

  // Whose fault is the bad audio: one peer's uplink, or this machine's
  // downlink? Answerable only because the remotes are no longer pooled.
  const remotes = summary.remotes ?? [];
  const measured = remotes.filter((remote) => remote.samples >= 5);
  const bad = measured.filter(
    (remote) =>
      (remote.packetLossPct?.mean ?? 0) >= MEDIA_DIAGNOSTIC_THRESHOLDS.packetLossPct ||
      (remote.concealmentPct?.mean ?? 0) >=
        MEDIA_DIAGNOSTIC_THRESHOLDS.audioConcealmentPct,
  );

  if (measured.length >= 2 && bad.length === measured.length) {
    verdicts.push({
      code: "local-downlink",
      headline:
        "Odadaki herkes bozuk geldi; sorun karşı taraflarda değil, bu makinenin indirme yolunda.",
      evidence: [
        `${measured.length} katılımcının ${bad.length}'i eşzamanlı kayıplı`,
        ...bad
          .slice(0, 3)
          .map(
            (remote) =>
              `${remote.identity.slice(0, 8)}: kayıp ${pct(remote.packetLossPct?.mean ?? 0)}, kesinti ${pct(remote.concealmentPct?.mean ?? 0)}`,
          ),
      ],
    });
  } else if (bad.length > 0 && bad.length < measured.length) {
    verdicts.push({
      code: "remote-uplink",
      headline: `${bad.length} katılımcı bozuk geldi, diğerleri temiz; sorun o katılımcıların gönderme yolunda.`,
      evidence: bad
        .slice(0, 3)
        .map(
          (remote) =>
            `${remote.identity.slice(0, 8)}: kayıp ${pct(remote.packetLossPct?.mean ?? 0)}, kesinti ${pct(remote.concealmentPct?.mean ?? 0)}`,
        ),
    });
  }

  // Media off the direct UDP path. Every other number looks the same on it —
  // RTT and loss do not say which path carried them — but on TCP one lost
  // packet holds back everything queued behind it, and a relay is an extra
  // hop. Production had both, unseen: clients routed through a TURN relay on
  // the SFU's own host, and sessions LiveKit pinned to TCP after a short UDP
  // failure.
  const paths = summary.icePathSamples;
  if (paths) {
    const fallbackLines: string[] = [];
    let sawRelay = false;
    for (const [connection, counts] of [
      ["yayın (publisher)", paths.publisher],
      ["alım (subscriber)", paths.subscriber],
    ] as const) {
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      for (const [key, count] of Object.entries(counts)) {
        const relay = key.endsWith("/relay");
        if (
          (relay || key.startsWith("tcp/")) &&
          count >= MEDIA_DIAGNOSTIC_THRESHOLDS.problemDwellSamples
        ) {
          sawRelay = sawRelay || relay;
          fallbackLines.push(
            `${connection}: ${key} ${count} örnek (${pct((count / Math.max(total, 1)) * 100)})`,
          );
        }
      }
    }

    if (fallbackLines.length > 0) {
      verdicts.push({
        code: "fallback-path",
        headline: sawRelay
          ? "Medya bir süre TURN aktarma sunucusundan aktı; doğrudan UDP yolu kullanılmadı."
          : "Medya bir süre TCP yedek yolundan aktı; 7882/UDP'ye ulaşılamamış ya da sunucu oturumu TCP'ye çevirmiş olabilir.",
        evidence: fallbackLines,
      });
    }
  }

  const reconnects = Object.entries(summary.eventCounts)
    .filter(([name]) => name.endsWith("/room-reconnected"))
    .reduce((total, [, count]) => total + count, 0);
  if (reconnects > 0) {
    verdicts.push({
      code: "reconnects",
      headline: `Bağlantı ${reconnects} kez koptu ve yeniden kuruldu.`,
      evidence: [
        `her kopuş yayını yeniden yayımlıyor ve o anki istatistik penceresini geçersiz kılıyor`,
      ],
    });
  }

  if ((summary.rttMs?.mean ?? 0) >= MEDIA_DIAGNOSTIC_THRESHOLDS.highRttMs) {
    verdicts.push({
      code: "high-rtt",
      headline: "Gecikme oturum boyunca yüksek kaldı.",
      evidence: [
        `RTT ortalama ${Math.round(summary.rttMs?.mean ?? 0)} ms, en yüksek ${Math.round(summary.rttMs?.max ?? 0)} ms`,
      ],
    });
  }

  return verdicts;
};
