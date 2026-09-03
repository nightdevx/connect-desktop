import {
  MEDIA_DIAGNOSTICS_LIMITS,
  MEDIA_DIAGNOSTICS_SCHEMA_VERSION,
  MEDIA_DIAGNOSTIC_PROBLEMS,
  MEDIA_DIAGNOSTIC_THRESHOLDS,
  bump,
  pushStat,
  roundStat,
  type MediaDiagnosticsClient,
  type MediaDiagnosticsEntry,
  type MediaDiagnosticsInboundVideoSummary,
  type MediaDiagnosticsOutboundVideoSummary,
  type MediaDiagnosticsPrefs,
  type MediaDiagnosticsStat,
  type MediaDiagnosticsStatsInput,
  type MediaDiagnosticsSummary,
} from "@shared/media-diagnostics";

const emptyClient = (): MediaDiagnosticsClient => ({
  appVersion: "",
  platform: "",
  osVersion: "",
  electronVersion: "",
  chromeVersion: "",
  cpuThreads: null,
  deviceMemoryGb: null,
  gpu: null,
  prefs: null,
  hardwareSvcCodec: null,
  audioInputCount: null,
  audioOutputCount: null,
});

const emptyOutboundVideo = (): MediaDiagnosticsOutboundVideoSummary => ({
  codecs: {},
  encoderImplementations: {},
  hardwareEncoderSamples: 0,
  softwareEncoderSamples: 0,
  resolutions: {},
  layerCounts: {},
  fps: null,
  bitrateBps: null,
  limitation: { none: 0, cpu: 0, bandwidth: 0, other: 0 },
});

const emptyInboundVideo = (): MediaDiagnosticsInboundVideoSummary => ({
  resolutions: {},
  fps: null,
  bitrateBps: null,
  freezeCountMax: 0,
  jitterBufferMsMax: 0,
});

const resolutionKey = (
  width: number | null,
  height: number | null,
): string | null => {
  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }
  return `${width}x${height}`;
};

const truncateData = (
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (!data) {
    return undefined;
  }

  let encoded: string;
  try {
    encoded = JSON.stringify(data);
  } catch {
    return { unserializable: true };
  }

  if (encoded.length <= MEDIA_DIAGNOSTICS_LIMITS.maxDataBytesPerEntry) {
    try {
      return JSON.parse(encoded) as Record<string, unknown>;
    } catch {
      return { unserializable: true };
    }
  }

  return {
    truncated: true,
    bytes: encoded.length,
    preview: encoded.slice(0, MEDIA_DIAGNOSTICS_LIMITS.maxDataBytesPerEntry),
  };
};

class MediaDiagnosticsCollector {
  private sessionId: string | null = null;
  private startedAtMs = 0;
  private lobbyId = "";
  private client: MediaDiagnosticsClient = emptyClient();

  private seq = 0;
  private batchSeq = 0;
  private pending: MediaDiagnosticsEntry[] = [];
  private recorded = 0;
  private truncated = false;
  private flushing = false;
  private timer: number | null = null;

  private durationMs = 0;
  private events = 0;
  private samples = 0;
  private rttMs: MediaDiagnosticsStat | null = null;
  private availableOutgoingBitrateBps: MediaDiagnosticsStat | null = null;
  private outboundAudioBitrateBps: MediaDiagnosticsStat | null = null;
  private outboundVideo: MediaDiagnosticsOutboundVideoSummary | null = null;
  private inboundVideo: MediaDiagnosticsInboundVideoSummary | null = null;
  private inboundAudioConcealmentPct: MediaDiagnosticsStat | null = null;
  private inboundAudioJitterMs: MediaDiagnosticsStat | null = null;
  private packetLossOutboundPct: MediaDiagnosticsStat | null = null;
  private packetLossInboundPct: MediaDiagnosticsStat | null = null;
  private eventCounts: Record<string, number> = {};
  private warnings: Record<string, number> = {};
  private problems = new Set<string>();

  public isActive(): boolean {
    return this.sessionId !== null;
  }

  public startSession(lobbyId: string, client?: Partial<MediaDiagnosticsClient>): void {
    if (this.sessionId) {
      void this.endSession();
    }

    const random = Math.random().toString(36).slice(2, 10);
    this.sessionId = `${Date.now().toString(36)}-${random}`;
    this.startedAtMs = Date.now();
    this.lobbyId = lobbyId;
    this.client = { ...emptyClient(), ...(client ?? {}) };

    this.seq = 0;
    this.batchSeq = 0;
    this.pending = [];
    this.recorded = 0;
    this.truncated = false;
    this.durationMs = 0;
    this.events = 0;
    this.samples = 0;
    this.rttMs = null;
    this.availableOutgoingBitrateBps = null;
    this.outboundAudioBitrateBps = null;
    this.outboundVideo = null;
    this.inboundVideo = null;
    this.inboundAudioConcealmentPct = null;
    this.inboundAudioJitterMs = null;
    this.packetLossOutboundPct = null;
    this.packetLossInboundPct = null;
    this.eventCounts = {};
    this.warnings = {};
    this.problems = new Set();

    this.record("session", "session-started", { lobbyId });
    this.startTimer();
  }

  public setClientContext(patch: Partial<MediaDiagnosticsClient>): void {
    this.client = { ...this.client, ...patch };
  }

  public setPrefs(prefs: MediaDiagnosticsPrefs): void {
    this.client = { ...this.client, prefs };
  }

  public record(
    scope: string,
    name: string,
    data?: Record<string, unknown>,
  ): void {
    this.append("event", scope, name, data);
    if (this.sessionId) {
      this.events += 1;
      bump(this.eventCounts, `${scope}/${name}`);
      this.deriveEventProblems(scope, name, data);
    }
  }

  public recordWarning(message: string): void {
    const trimmed = message.trim().slice(0, 200);
    if (!trimmed) {
      return;
    }
    bump(this.warnings, trimmed);
    this.record("session", "warning", { message: trimmed });
  }

  public recordStats(snapshot: MediaDiagnosticsStatsInput): void {
    if (!this.sessionId) {
      return;
    }

    this.samples += 1;
    this.durationMs = Date.now() - this.startedAtMs;
    this.rttMs = pushStat(this.rttMs, snapshot.rttMs);
    this.availableOutgoingBitrateBps = pushStat(
      this.availableOutgoingBitrateBps,
      snapshot.availableOutgoingBitrateBps,
    );

    const outboundVideoRows: Record<string, unknown>[] = [];
    for (const entry of snapshot.outbound) {
      if (entry.kind === "audio") {
        this.outboundAudioBitrateBps = pushStat(
          this.outboundAudioBitrateBps,
          entry.bitrateBps,
        );
      } else {
        this.outboundVideo = this.outboundVideo ?? emptyOutboundVideo();
        const video = this.outboundVideo;
        if (entry.codec) {
          bump(video.codecs, entry.codec);
        }
        if (entry.encoderImplementation) {
          bump(video.encoderImplementations, entry.encoderImplementation);
        }
        if (entry.hardwareEncoder === true) {
          video.hardwareEncoderSamples += 1;
        } else if (entry.hardwareEncoder === false) {
          video.softwareEncoderSamples += 1;
          this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.softwareEncoder);
        }
        const resolution = resolutionKey(entry.frameWidth, entry.frameHeight);
        if (resolution) {
          bump(video.resolutions, resolution);
        }
        bump(video.layerCounts, String(entry.layerCount));
        video.fps = pushStat(video.fps, entry.framesPerSecond);
        video.bitrateBps = pushStat(video.bitrateBps, entry.bitrateBps);

        const reason = entry.qualityLimitationReason;
        if (!reason || reason === "none") {
          video.limitation.none += 1;
        } else if (reason === "cpu") {
          video.limitation.cpu += 1;
          this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.cpuLimited);
        } else if (reason === "bandwidth") {
          video.limitation.bandwidth += 1;
          this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.bandwidthLimited);
        } else {
          video.limitation.other += 1;
        }

        outboundVideoRows.push({
          trackKey: entry.trackKey,
          codec: entry.codec,
          hardwareEncoder: entry.hardwareEncoder,
          encoderImplementation: entry.encoderImplementation,
          resolution,
          fps:
            entry.framesPerSecond === null
              ? null
              : Math.round(entry.framesPerSecond),
          bitrateBps: entry.bitrateBps,
          layerCount: entry.layerCount,
          limitation: entry.qualityLimitationReason,
        });
      }

      this.packetLossOutboundPct = pushStat(
        this.packetLossOutboundPct,
        entry.packetLossPct,
      );
      if (
        typeof entry.packetLossPct === "number" &&
        entry.packetLossPct >= MEDIA_DIAGNOSTIC_THRESHOLDS.packetLossPct
      ) {
        this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.packetLoss);
      }
    }

    const inboundVideoRows: Record<string, unknown>[] = [];
    for (const entry of snapshot.inbound) {
      this.packetLossInboundPct = pushStat(
        this.packetLossInboundPct,
        entry.packetLossPct,
      );
      if (
        typeof entry.packetLossPct === "number" &&
        entry.packetLossPct >= MEDIA_DIAGNOSTIC_THRESHOLDS.packetLossPct
      ) {
        this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.packetLoss);
      }

      if (entry.kind === "audio") {
        this.inboundAudioConcealmentPct = pushStat(
          this.inboundAudioConcealmentPct,
          entry.concealmentPct,
        );
        this.inboundAudioJitterMs = pushStat(
          this.inboundAudioJitterMs,
          entry.jitterMs,
        );
        if (
          typeof entry.concealmentPct === "number" &&
          entry.concealmentPct >= MEDIA_DIAGNOSTIC_THRESHOLDS.audioConcealmentPct
        ) {
          this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.audioConcealment);
        }
        continue;
      }

      this.inboundVideo = this.inboundVideo ?? emptyInboundVideo();
      const video = this.inboundVideo;
      const resolution = resolutionKey(entry.frameWidth, entry.frameHeight);
      if (resolution) {
        bump(video.resolutions, resolution);
      }
      video.fps = pushStat(video.fps, entry.framesPerSecond);
      video.bitrateBps = pushStat(video.bitrateBps, entry.bitrateBps);
      if (typeof entry.freezeCount === "number") {
        video.freezeCountMax = Math.max(video.freezeCountMax, entry.freezeCount);
        if (entry.freezeCount >= MEDIA_DIAGNOSTIC_THRESHOLDS.freezeCount) {
          this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.receiverFreezes);
        }
      }
      if (typeof entry.jitterBufferDelayMs === "number") {
        video.jitterBufferMsMax = Math.max(
          video.jitterBufferMsMax,
          entry.jitterBufferDelayMs,
        );
      }

      inboundVideoRows.push({
        trackKey: entry.trackKey,
        resolution,
        fps:
          entry.framesPerSecond === null
            ? null
            : Math.round(entry.framesPerSecond),
        bitrateBps: entry.bitrateBps,
        freezeCount: entry.freezeCount,
        jitterBufferMs:
          entry.jitterBufferDelayMs === null
            ? null
            : Math.round(entry.jitterBufferDelayMs),
      });
    }

    if (
      typeof snapshot.rttMs === "number" &&
      snapshot.rttMs >= MEDIA_DIAGNOSTIC_THRESHOLDS.highRttMs
    ) {
      this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.highRtt);
    }

    this.append("sample", "stats", "media-stats", {
      rttMs: snapshot.rttMs,
      availableOutgoingBitrateBps: snapshot.availableOutgoingBitrateBps,
      outbound: outboundVideoRows,
      inbound: inboundVideoRows,
      outboundAudio: snapshot.outbound
        .filter((entry) => entry.kind === "audio")
        .map((entry) => ({
          bitrateBps: entry.bitrateBps,
          packetLossPct: entry.packetLossPct,
        })),
      inboundAudio: snapshot.inbound
        .filter((entry) => entry.kind === "audio")
        .map((entry) => ({
          trackKey: entry.trackKey,
          bitrateBps: entry.bitrateBps,
          jitterMs: entry.jitterMs,
          concealmentPct: entry.concealmentPct,
          packetLossPct: entry.packetLossPct,
        })),
    });
  }

  public async endSession(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    this.stopTimer();
    this.durationMs = Date.now() - this.startedAtMs;
    this.record("session", "session-ended", { durationMs: this.durationMs });
    await this.flush(true);
    this.sessionId = null;
  }

  public buildSummary(): MediaDiagnosticsSummary {
    return {
      durationMs: this.durationMs,
      entries: this.recorded,
      events: this.events,
      samples: this.samples,
      truncated: this.truncated,
      rttMs: roundStat(this.rttMs),
      availableOutgoingBitrateBps: roundStat(this.availableOutgoingBitrateBps),
      outboundAudioBitrateBps: roundStat(this.outboundAudioBitrateBps),
      outboundVideo: this.outboundVideo
        ? {
            ...this.outboundVideo,
            fps: roundStat(this.outboundVideo.fps),
            bitrateBps: roundStat(this.outboundVideo.bitrateBps),
          }
        : null,
      inboundVideo: this.inboundVideo
        ? {
            ...this.inboundVideo,
            fps: roundStat(this.inboundVideo.fps),
            bitrateBps: roundStat(this.inboundVideo.bitrateBps),
            jitterBufferMsMax: Math.round(this.inboundVideo.jitterBufferMsMax),
          }
        : null,
      inboundAudioConcealmentPct: roundStat(this.inboundAudioConcealmentPct),
      inboundAudioJitterMs: roundStat(this.inboundAudioJitterMs),
      packetLossOutboundPct: roundStat(this.packetLossOutboundPct),
      packetLossInboundPct: roundStat(this.packetLossInboundPct),
      eventCounts: { ...this.eventCounts },
      warnings: { ...this.warnings },
      problems: [...this.problems].sort(),
    };
  }

  private deriveEventProblems(
    scope: string,
    name: string,
    data?: Record<string, unknown>,
  ): void {
    if (name === "screen-codec-fallback") {
      this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.codecFallback);
    }
    if (name === "quality-step-down") {
      this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.qualityStepDown);
    }
    if (name === "track-stream-paused") {
      this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.streamPaused);
    }
    if (name === "connection-state" && data?.state === "reconnecting") {
      this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.reconnects);
    }
    if (
      scope === "stream-manager" &&
      name.endsWith("-encodings") &&
      typeof data?.mismatch === "string"
    ) {
      this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.publishMismatch);
    }
    if (
      name === "emergency-fallback-success" ||
      name === "processor-attach-final-failure" ||
      name === "emergency-fallback-failed"
    ) {
      this.problems.add(MEDIA_DIAGNOSTIC_PROBLEMS.micFallback);
    }
  }

  private append(
    kind: "event" | "sample",
    scope: string,
    name: string,
    data?: Record<string, unknown>,
  ): void {
    if (!this.sessionId) {
      return;
    }

    if (this.recorded >= MEDIA_DIAGNOSTICS_LIMITS.maxEntriesPerSession) {
      this.truncated = true;
      return;
    }

    this.seq += 1;
    this.recorded += 1;
    const atMs = Date.now();
    this.pending.push({
      seq: this.seq,
      atMs,
      tMs: atMs - this.startedAtMs,
      kind,
      scope,
      name,
      data: truncateData(data),
    });

    if (this.pending.length > MEDIA_DIAGNOSTICS_LIMITS.maxPendingEntries) {
      this.pending.splice(
        0,
        this.pending.length - MEDIA_DIAGNOSTICS_LIMITS.maxPendingEntries,
      );
      this.truncated = true;
    }
  }

  private startTimer(): void {
    if (this.timer !== null || typeof window === "undefined") {
      return;
    }
    this.timer = window.setInterval(() => {
      void this.flush(false);
    }, MEDIA_DIAGNOSTICS_LIMITS.flushIntervalMs);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async flush(final: boolean): Promise<void> {
    const sessionId = this.sessionId;
    if (!sessionId || this.flushing) {
      return;
    }
    if (this.pending.length === 0 && !final) {
      return;
    }

    const upload = window.desktopApi?.uploadMediaDiagnostics;
    if (typeof upload !== "function") {
      this.pending = [];
      return;
    }

    this.flushing = true;
    const entries = this.pending.splice(
      0,
      MEDIA_DIAGNOSTICS_LIMITS.maxEntriesPerBatch,
    );
    this.batchSeq += 1;

    try {
      const result = await upload({
        sessionId,
        schemaVersion: MEDIA_DIAGNOSTICS_SCHEMA_VERSION,
        seq: this.batchSeq,
        startedAtMs: this.startedAtMs,
        lobbyId: this.lobbyId,
        client: this.client,
        summary: this.buildSummary(),
        entries,
        final,
      });

      if (!result?.ok) {
        this.pending.unshift(...entries);
        this.batchSeq -= 1;
      }
    } catch {
      this.pending.unshift(...entries);
      this.batchSeq -= 1;
    } finally {
      this.flushing = false;
    }
  }
}

export const mediaDiagnostics = new MediaDiagnosticsCollector();
