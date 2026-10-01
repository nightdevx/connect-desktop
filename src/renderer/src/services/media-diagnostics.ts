import {
  MEDIA_DIAGNOSTICS_LIMITS,
  MEDIA_DIAGNOSTICS_MAX_EPISODES,
  MEDIA_DIAGNOSTICS_MAX_REMOTES,
  MEDIA_DIAGNOSTICS_SCHEMA_VERSION,
  MEDIA_DIAGNOSTIC_PROBLEMS,
  MEDIA_DIAGNOSTIC_THRESHOLDS,
  bump,
  deriveVerdicts,
  pushStat,
  roundStat,
  type MediaDiagnosticsBatch,
  type MediaDiagnosticsClient,
  type MediaDiagnosticsEntry,
  type MediaDiagnosticsEpisode,
  type MediaDiagnosticsIcePathSamples,
  type MediaDiagnosticsInboundVideoSummary,
  type MediaDiagnosticsOutboundVideoSummary,
  type MediaDiagnosticsPrefs,
  type MediaDiagnosticsRemoteSummary,
  type MediaDiagnosticsStat,
  type MediaDiagnosticsStatsInput,
  type MediaDiagnosticsSummary,
} from "@shared/media-diagnostics";
import { classifyIcePath, icePathKey } from "@shared/media-stats";

const emptyIcePathSamples = (): MediaDiagnosticsIcePathSamples => ({
  publisher: {},
  subscriber: {},
});

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
  limitationSeconds: { cpu: 0, bandwidth: 0, other: 0 },
  encodeMsPerFrame: null,
  framesDroppedPct: null,
  sourceFps: null,
  sourceResolutions: {},
  retransmittedPct: null,
});

interface RemoteAccumulator {
  identity: string;
  samples: number;
  packetLossPct: MediaDiagnosticsStat | null;
  concealmentPct: MediaDiagnosticsStat | null;
  jitterMs: MediaDiagnosticsStat | null;
  bitrateBps: MediaDiagnosticsStat | null;
}

/**
 * The participant behind a track key.
 *
 * Keys are built as `${identity}:${source}` for remotes and `local:${source}`
 * for our own tracks, so the identity is everything up to the last colon —
 * split on the first one and a UUID survives intact.
 */
const identityOfTrackKey = (trackKey: string): string | null => {
  const separator = trackKey.lastIndexOf(":");
  if (separator <= 0) {
    return null;
  }
  const identity = trackKey.slice(0, separator);
  return identity === "local" ? null : identity;
};

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
  // Every upload runs through this chain, one after another. The server keeps
  // the summary of whichever batch it stored last, so a periodic batch still in
  // flight when the session ends must not land after the final one.
  private uploads: Promise<unknown> = Promise.resolve();

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
  private problemStreaks: Record<string, number> = {};
  private episodes: MediaDiagnosticsEpisode[] = [];
  private openEpisodes = new Map<string, MediaDiagnosticsEpisode>();
  private remotes = new Map<string, RemoteAccumulator>();
  private icePathSamples: MediaDiagnosticsIcePathSamples = emptyIcePathSamples();

  public isActive(): boolean {
    return this.sessionId !== null;
  }

  /** Whether a session is open and it is this lobby's. */
  public isActiveFor(lobbyId: string): boolean {
    return this.sessionId !== null && this.lobbyId === lobbyId;
  }

  public startSession(lobbyId: string, client?: Partial<MediaDiagnosticsClient>): void {
    if (this.sessionId) {
      void this.endSession();
    }

    const random = Math.random().toString(36).slice(2, 10);
    this.sessionId = `${Date.now().toString(36)}-${random}`;
    this.startedAtMs = Date.now();
    this.lobbyId = lobbyId;
    // Merged onto whatever setClientContext has already resolved, NOT onto a
    // fresh empty record.
    //
    // The app version, platform, Electron and Chrome versions, CPU thread count
    // and — the one that matters most — the GPU feature status all arrive from
    // one async IPC call made when the session object is built, which is before
    // the user has joined anything. Starting from emptyClient() threw all of it
    // away on the way into the room, and every session ever uploaded carried
    // `"platform": "", "gpu": null` with only the `prefs` passed in right here
    // surviving. That is the field set that would have said whether hardware
    // video encoding was even available on the machine, on logs where the
    // encoder ran in software for three hours.
    this.client = { ...this.client, ...(client ?? {}) };

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
    this.problemStreaks = {};
    this.episodes = [];
    this.openEpisodes = new Map();
    this.remotes = new Map();
    this.icePathSamples = emptyIcePathSamples();

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

    // What THIS sample breached. Committed once at the end so a problem has to
    // survive consecutive samples before it becomes a session tag — see
    // MEDIA_DIAGNOSTIC_THRESHOLDS.problemDwellSamples.
    const breached = new Set<string>();

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
          breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.softwareEncoder);
        }
        const resolution = resolutionKey(entry.frameWidth, entry.frameHeight);
        if (resolution) {
          bump(video.resolutions, resolution);
        }
        bump(video.layerCounts, String(entry.layerCount));
        video.fps = pushStat(video.fps, entry.framesPerSecond);
        video.bitrateBps = pushStat(video.bitrateBps, entry.bitrateBps);
        video.encodeMsPerFrame = pushStat(
          video.encodeMsPerFrame,
          entry.encodeMsPerFrame,
        );
        video.framesDroppedPct = pushStat(
          video.framesDroppedPct,
          entry.framesDroppedPct,
        );
        video.retransmittedPct = pushStat(
          video.retransmittedPct,
          entry.retransmittedPct,
        );
        video.sourceFps = pushStat(video.sourceFps, entry.sourceFramesPerSecond);
        const sourceResolution = resolutionKey(
          entry.sourceFrameWidth,
          entry.sourceFrameHeight,
        );
        if (sourceResolution) {
          bump(video.sourceResolutions, sourceResolution);
        }
        // Real durations, accumulated from per-window deltas. The sample counts
        // below stay, but this is the number a reader should trust.
        if (entry.limitationSeconds) {
          video.limitationSeconds.cpu += entry.limitationSeconds.cpu;
          video.limitationSeconds.bandwidth += entry.limitationSeconds.bandwidth;
          video.limitationSeconds.other += entry.limitationSeconds.other;
        }

        const reason = entry.qualityLimitationReason;
        if (!reason || reason === "none") {
          video.limitation.none += 1;
        } else if (reason === "cpu") {
          video.limitation.cpu += 1;
          breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.cpuLimited);
        } else if (reason === "bandwidth") {
          video.limitation.bandwidth += 1;
          breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.bandwidthLimited);
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
          // The capture side of the same track. `fps` above is what left the
          // encoder; this is what arrived at it.
          sourceFps:
            entry.sourceFramesPerSecond === null
              ? null
              : Math.round(entry.sourceFramesPerSecond),
          sourceResolution,
          encodeMsPerFrame: entry.encodeMsPerFrame,
          framesDroppedPct: entry.framesDroppedPct,
          retransmittedPct: entry.retransmittedPct,
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
        breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.packetLoss);
      }
    }

    const inboundVideoRows: Record<string, unknown>[] = [];
    for (const entry of snapshot.inbound) {
      // Per participant, not pooled. Whether one peer sounds bad or all of them
      // do is the difference between their uplink and this machine's downlink,
      // and the pooled numbers could not express it.
      this.trackRemote(entry.trackKey, entry);

      this.packetLossInboundPct = pushStat(
        this.packetLossInboundPct,
        entry.packetLossPct,
      );
      if (
        typeof entry.packetLossPct === "number" &&
        entry.packetLossPct >= MEDIA_DIAGNOSTIC_THRESHOLDS.packetLossPct
      ) {
        breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.packetLoss);
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
          breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.audioConcealment);
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
          breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.receiverFreezes);
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
        jitterBufferTargetMs: entry.jitterBufferTargetMs,
        packetsDiscarded: entry.packetsDiscarded,
      });
    }

    if (
      typeof snapshot.rttMs === "number" &&
      snapshot.rttMs >= MEDIA_DIAGNOSTIC_THRESHOLDS.highRttMs
    ) {
      breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.highRtt);
    }

    // Off the direct UDP path on either connection. Same dwell as every other
    // tag, so the moment ICE spends on a pair before nominating another does
    // not tag a healthy session.
    const pathKinds = [
      classifyIcePath(snapshot.icePaths?.publisher ?? null),
      classifyIcePath(snapshot.icePaths?.subscriber ?? null),
    ];
    if (pathKinds.includes("relay")) {
      breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.relayPath);
    }
    if (pathKinds.includes("tcp")) {
      breached.add(MEDIA_DIAGNOSTIC_PROBLEMS.tcpMedia);
    }

    this.commitSampleProblems(breached);
    this.trackEpisodes(breached, snapshot);

    const publisherPath = icePathKey(snapshot.icePaths?.publisher ?? null);
    const subscriberPath = icePathKey(snapshot.icePaths?.subscriber ?? null);
    if (publisherPath) {
      bump(this.icePathSamples.publisher, publisherPath);
    }
    if (subscriberPath) {
      bump(this.icePathSamples.subscriber, subscriberPath);
    }

    this.append("sample", "stats", "media-stats", {
      rttMs: snapshot.rttMs,
      availableOutgoingBitrateBps: snapshot.availableOutgoingBitrateBps,
      // Two short keys rather than the whole candidate record: this rides in
      // every sample and the per-entry budget is 4 KB. The full record is
      // written once, as stream-manager/ice-path-changed, when it changes.
      icePaths: { publisher: publisherPath, subscriber: subscriberPath },
      outbound: outboundVideoRows,
      inbound: inboundVideoRows,
      outboundAudio: snapshot.outbound
        .filter((entry) => entry.kind === "audio")
        .map((entry) => ({
          // Two anonymous rows used to appear whenever screen audio was
          // published alongside the microphone, and nothing said which was
          // which — the reader had to guess from the bitrate.
          trackKey: entry.trackKey,
          bitrateBps: entry.bitrateBps,
          packetLossPct: entry.packetLossPct,
          retransmittedPct: entry.retransmittedPct,
        })),
      inboundAudio: snapshot.inbound
        .filter((entry) => entry.kind === "audio")
        .map((entry) => ({
          trackKey: entry.trackKey,
          bitrateBps: entry.bitrateBps,
          jitterMs: entry.jitterMs,
          concealmentPct: entry.concealmentPct,
          // The DTX share, kept beside the audible one. Without it a reader
          // cannot tell a silent participant from a broken stream, which is
          // exactly the confusion the old concealment number caused.
          silentPct: entry.silentPct,
          packetLossPct: entry.packetLossPct,
          jitterBufferTargetMs: entry.jitterBufferTargetMs,
          packetsDiscarded: entry.packetsDiscarded,
        })),
    });
  }

  /**
   * Groups consecutive breaching samples into stretches with a start, an end
   * and a worst value.
   *
   * A session tag says a problem happened somewhere in three hours. This says
   * when and for how long, which is the difference between a reader scanning
   * 5905 sample rows and reading four lines.
   */
  private trackEpisodes(
    breached: Set<string>,
    snapshot: MediaDiagnosticsStatsInput,
  ): void {
    const at = this.durationMs;
    const peaks = this.samplePeaks(snapshot);

    for (const [problem, episode] of this.openEpisodes) {
      if (breached.has(problem)) {
        continue;
      }
      this.openEpisodes.delete(problem);
      this.pushEpisode(episode);
    }

    for (const problem of breached) {
      const open = this.openEpisodes.get(problem);
      const peak = peaks[problem] ?? null;
      if (open) {
        open.endMs = at;
        open.samples += 1;
        if (peak !== null) {
          open.peak = open.peak === null ? peak : Math.max(open.peak, peak);
        }
        continue;
      }
      this.openEpisodes.set(problem, {
        problem,
        startMs: at,
        endMs: at,
        samples: 1,
        peak,
      });
    }
  }

  /** The worst value behind each problem in this sample, in its own unit. */
  private samplePeaks(
    snapshot: MediaDiagnosticsStatsInput,
  ): Record<string, number> {
    const peaks: Record<string, number> = {};
    const worst = (key: string, value: number | null | undefined): void => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return;
      }
      peaks[key] = Math.max(peaks[key] ?? value, value);
    };

    for (const entry of [...snapshot.outbound, ...snapshot.inbound]) {
      worst(MEDIA_DIAGNOSTIC_PROBLEMS.packetLoss, entry.packetLossPct);
    }
    for (const entry of snapshot.inbound) {
      if (entry.kind === "audio") {
        worst(MEDIA_DIAGNOSTIC_PROBLEMS.audioConcealment, entry.concealmentPct);
      } else {
        worst(MEDIA_DIAGNOSTIC_PROBLEMS.receiverFreezes, entry.freezeCount);
      }
    }
    worst(MEDIA_DIAGNOSTIC_PROBLEMS.highRtt, snapshot.rttMs);
    return peaks;
  }

  private pushEpisode(episode: MediaDiagnosticsEpisode): void {
    // Bounded, and the longest survive: a session that flapped a hundred times
    // must not push its own summary over the entry size limit, and the two
    // second blips are not what anyone is reading for.
    if (this.episodes.length < MEDIA_DIAGNOSTICS_MAX_EPISODES) {
      this.episodes.push(episode);
      return;
    }
    const duration = (candidate: MediaDiagnosticsEpisode): number =>
      candidate.endMs - candidate.startMs;
    let shortest = 0;
    for (let index = 1; index < this.episodes.length; index += 1) {
      if (duration(this.episodes[index]) < duration(this.episodes[shortest])) {
        shortest = index;
      }
    }
    if (duration(episode) > duration(this.episodes[shortest])) {
      this.episodes[shortest] = episode;
    }
  }

  private trackRemote(
    trackKey: string,
    entry: MediaDiagnosticsStatsInput["inbound"][number],
  ): void {
    const identity = identityOfTrackKey(trackKey);
    if (!identity) {
      return;
    }
    let remote = this.remotes.get(identity);
    if (!remote) {
      if (this.remotes.size >= MEDIA_DIAGNOSTICS_MAX_REMOTES) {
        return;
      }
      remote = {
        identity,
        samples: 0,
        packetLossPct: null,
        concealmentPct: null,
        jitterMs: null,
        bitrateBps: null,
      };
      this.remotes.set(identity, remote);
    }
    remote.samples += 1;
    remote.packetLossPct = pushStat(remote.packetLossPct, entry.packetLossPct);
    remote.bitrateBps = pushStat(remote.bitrateBps, entry.bitrateBps);
    if (entry.kind === "audio") {
      remote.concealmentPct = pushStat(
        remote.concealmentPct,
        entry.concealmentPct,
      );
      remote.jitterMs = pushStat(remote.jitterMs, entry.jitterMs);
    }
  }

  private buildEpisodes(): MediaDiagnosticsEpisode[] {
    // Episodes still open at flush time count: a session that ended mid-problem
    // is precisely the one worth reading.
    const all = [...this.episodes, ...this.openEpisodes.values()];
    return all
      .sort((a, b) => a.startMs - b.startMs)
      .map((episode) => ({
        ...episode,
        peak: episode.peak === null ? null : Math.round(episode.peak * 10) / 10,
      }));
  }

  private buildRemotes(): MediaDiagnosticsRemoteSummary[] {
    return [...this.remotes.values()]
      .sort((a, b) => b.samples - a.samples)
      .map((remote) => ({
        identity: remote.identity,
        samples: remote.samples,
        packetLossPct: roundStat(remote.packetLossPct),
        concealmentPct: roundStat(remote.concealmentPct),
        jitterMs: roundStat(remote.jitterMs),
        bitrateBps: roundStat(remote.bitrateBps),
      }));
  }

  public async endSession(): Promise<void> {
    const sessionId = this.sessionId;
    if (!sessionId) {
      return;
    }

    this.stopTimer();
    this.durationMs = Date.now() - this.startedAtMs;
    this.record("session", "session-ended", { durationMs: this.durationMs });

    // Closed here, synchronously, and only then uploaded. It used to stay open
    // until the final upload came back, and a room change does not wait for
    // that: the next room found the session still active, wrote its first
    // entries into it, and everything after — its samples, its reconnects, its
    // network path — was dropped once the old session closed underneath it.
    // Every room switch went unrecorded that way.
    const batches = this.takeBatches(sessionId, true);
    this.sessionId = null;
    await this.upload(batches);
  }

  public buildSummary(): MediaDiagnosticsSummary {
    const summary: MediaDiagnosticsSummary = {
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
            sourceFps: roundStat(this.outboundVideo.sourceFps),
            encodeMsPerFrame: roundStat(this.outboundVideo.encodeMsPerFrame),
            framesDroppedPct: roundStat(this.outboundVideo.framesDroppedPct),
            retransmittedPct: roundStat(this.outboundVideo.retransmittedPct),
            limitationSeconds: {
              cpu: Math.round(this.outboundVideo.limitationSeconds.cpu),
              bandwidth: Math.round(
                this.outboundVideo.limitationSeconds.bandwidth,
              ),
              other: Math.round(this.outboundVideo.limitationSeconds.other),
            },
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
      episodes: this.buildEpisodes(),
      remotes: this.buildRemotes(),
      verdicts: [],
      icePathSamples: {
        publisher: { ...this.icePathSamples.publisher },
        subscriber: { ...this.icePathSamples.subscriber },
      },
    };

    // Derived last, from the finished summary, so the same function can be run
    // again by a reader months later against a stored session.
    summary.verdicts = deriveVerdicts(summary);
    return summary;
  }

  /**
   * Promotes this sample's threshold breaches into session tags, but only once
   * one has held across consecutive samples. A sample that does not breach
   * resets that problem's streak, so the dwell means "still bad", not "bad this
   * often".
   */
  private commitSampleProblems(breached: Set<string>): void {
    for (const problem of Object.keys(this.problemStreaks)) {
      if (!breached.has(problem)) {
        this.problemStreaks[problem] = 0;
      }
    }

    for (const problem of breached) {
      const streak = (this.problemStreaks[problem] ?? 0) + 1;
      this.problemStreaks[problem] = streak;
      if (streak >= MEDIA_DIAGNOSTIC_THRESHOLDS.problemDwellSamples) {
        this.problems.add(problem);
      }
    }
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
    // Keyed on the RECONNECTED event, not on the "reconnecting" state.
    //
    // LiveKit only emits Reconnecting for a full ICE restart. A signal-channel
    // drop emits SignalReconnecting and then Reconnected, so a session that
    // reconnected went untagged — in the field that was three of four
    // reconnects, and each one still re-ran restorePublishingState and
    // corrupted a stats window on the way through. The end of a reconnect is
    // the one edge both kinds share.
    if (
      name === "room-reconnected" ||
      (name === "connection-state" && data?.state === "reconnecting")
    ) {
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
      void this.flush();
    }, MEDIA_DIAGNOSTICS_LIMITS.flushIntervalMs);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async flush(): Promise<void> {
    const sessionId = this.sessionId;
    if (!sessionId || this.flushing || this.pending.length === 0) {
      return;
    }

    this.flushing = true;
    const batches = this.takeBatches(sessionId, false);
    try {
      const sent = await this.upload(batches);
      // Back to the front of the queue for the next flush — unless the session
      // ended meanwhile: a later session must not inherit these.
      if (!sent && this.sessionId === sessionId) {
        this.pending.unshift(...batches.flatMap((batch) => batch.entries));
        this.batchSeq -= batches.length;
      }
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Cuts the pending entries into batches, each stamped with the summary as it
   * stands now. A periodic flush takes one batch; the final one takes all that
   * is left, and only its last batch is marked final.
   */
  private takeBatches(sessionId: string, final: boolean): MediaDiagnosticsBatch[] {
    const summary = this.buildSummary();
    const batches: MediaDiagnosticsBatch[] = [];
    do {
      this.batchSeq += 1;
      batches.push({
        sessionId,
        schemaVersion: MEDIA_DIAGNOSTICS_SCHEMA_VERSION,
        seq: this.batchSeq,
        startedAtMs: this.startedAtMs,
        lobbyId: this.lobbyId,
        client: this.client,
        summary,
        entries: this.pending.splice(0, MEDIA_DIAGNOSTICS_LIMITS.maxEntriesPerBatch),
        final: false,
      });
    } while (final && this.pending.length > 0);
    batches[batches.length - 1].final = final;
    return batches;
  }

  /** Sends the batches in order, after every upload queued before them. */
  private upload(batches: MediaDiagnosticsBatch[]): Promise<boolean> {
    const send = async (): Promise<boolean> => {
      const upload = window.desktopApi?.uploadMediaDiagnostics;
      if (typeof upload !== "function") {
        return false;
      }
      for (const batch of batches) {
        try {
          const result = await upload(batch);
          if (!result?.ok) {
            return false;
          }
        } catch {
          return false;
        }
      }
      return true;
    };
    const sent = this.uploads.then(send);
    this.uploads = sent;
    return sent;
  }
}

export const mediaDiagnostics = new MediaDiagnosticsCollector();
