import type { InboundTrackStats, OutboundTrackStats } from "./media-stats";

export const MEDIA_DIAGNOSTICS_SCHEMA_VERSION = 1;

export interface MediaDiagnosticsStatsInput {
  at: number;
  rttMs: number | null;
  availableOutgoingBitrateBps: number | null;
  outbound: OutboundTrackStats[];
  inbound: InboundTrackStats[];
}

export const MEDIA_DIAGNOSTICS_LIMITS = {
  flushIntervalMs: 20_000,
  sampleIntervalMs: 10_000,
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
  limitation: {
    none: number;
    cpu: number;
    bandwidth: number;
    other: number;
  };
}

export interface MediaDiagnosticsInboundVideoSummary {
  resolutions: Record<string, number>;
  fps: MediaDiagnosticsStat | null;
  bitrateBps: MediaDiagnosticsStat | null;
  freezeCountMax: number;
  jitterBufferMsMax: number;
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
};

export const MEDIA_DIAGNOSTIC_THRESHOLDS = {
  highRttMs: 200,
  packetLossPct: 3,
  audioConcealmentPct: 3,
  freezeCount: 1,
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
