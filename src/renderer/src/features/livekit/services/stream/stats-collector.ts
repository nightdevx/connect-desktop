import { Room, Track, type TrackPublication } from "livekit-client";
import {
  summarizeReceiverReport,
  summarizeSenderReport,
  type InboundTrackStats,
  type OutboundTrackStats,
  type RateCache,
  type RawStatEntry,
} from "@shared/media-stats";

export interface MediaStatsSnapshot {
  at: number;
  /** Round-trip time on the media path, not a backend HTTP round trip. */
  rttMs: number | null;
  availableOutgoingBitrateBps: number | null;
  outbound: OutboundTrackStats[];
  inbound: InboundTrackStats[];
}

export const EMPTY_MEDIA_STATS: MediaStatsSnapshot = {
  at: 0,
  rttMs: null,
  availableOutgoingBitrateBps: null,
  outbound: [],
  inbound: [],
};

const DEFAULT_INTERVAL_MS = 1_000;

// getRTCStatsReport lives on LocalTrack / RemoteTrack, not on the Track base
// class, and publication.track is typed as the base — so narrow it here rather
// than casting at every call site.
interface StatsCapableTrack {
  getRTCStatsReport: () => Promise<RTCStatsReport | undefined>;
}

const hasStatsApi = (track: unknown): track is StatsCapableTrack => {
  return (
    typeof (track as StatsCapableTrack | null)?.getRTCStatsReport === "function"
  );
};

const readReport = async (
  publication: TrackPublication,
): Promise<RawStatEntry[] | null> => {
  const track = publication.track;
  if (!hasStatsApi(track)) {
    return null;
  }

  try {
    const report = await track.getRTCStatsReport();
    if (!report) {
      return null;
    }
    return Array.from(report.values()) as RawStatEntry[];
  } catch {
    // A track can be torn down between enumeration and the stats call.
    return null;
  }
};

/**
 * Samples real WebRTC stats off the LiveKit room on a fixed interval.
 *
 * This is the only honest source for connection quality: the previous badge
 * timed a `/lobby/state` REST call, which measures the backend and says nothing
 * about the media path. It is also how we verify hardware encoding is actually
 * engaged (`OutboundTrackStats.hardwareEncoder`).
 */
export class MediaStatsCollector {
  private timer: number | null = null;
  private sampling = false;
  private readonly cache: RateCache = new Map();

  public constructor(
    private readonly room: Room,
    private readonly onSnapshot: (snapshot: MediaStatsSnapshot) => void,
    private readonly intervalMs: number = DEFAULT_INTERVAL_MS,
  ) {}

  public start(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = window.setInterval(() => {
      void this.sample();
    }, this.intervalMs);
  }

  public stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.cache.clear();
    this.sampling = false;
  }

  private async sample(): Promise<void> {
    // getStats() on a busy connection can take longer than the interval; a
    // second overlapping pass would corrupt the delta math by sampling the
    // same counters twice against one cached baseline.
    if (this.sampling) {
      return;
    }
    this.sampling = true;

    try {
      const liveKeys = new Set<string>();
      const outbound: OutboundTrackStats[] = [];
      const inbound: InboundTrackStats[] = [];

      for (const publication of this.room.localParticipant.trackPublications.values()) {
        const key = `local:${publication.source}`;
        liveKeys.add(key);
        const entries = await readReport(publication);
        if (!entries) {
          continue;
        }
        const summary = summarizeSenderReport(entries, this.cache, key);
        if (summary) {
          outbound.push(summary);
        }
      }

      for (const participant of this.room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (!publication.isSubscribed) {
            continue;
          }
          const key = `${participant.identity}:${publication.source}`;
          liveKeys.add(key);
          const entries = await readReport(publication);
          if (!entries) {
            continue;
          }
          const summary = summarizeReceiverReport(entries, this.cache, key);
          if (summary) {
            inbound.push(summary);
          }
        }
      }

      // Drop baselines for tracks that went away, otherwise the cache grows for
      // the lifetime of the room and a re-published track would be diffed
      // against a stale counter.
      for (const key of Array.from(this.cache.keys())) {
        if (!liveKeys.has(key)) {
          this.cache.delete(key);
        }
      }

      // Prefer the microphone's RTT: it is the one track that is always
      // publishing, so its remote-inbound report is the freshest.
      const micStats = outbound.find(
        (entry) => entry.trackKey === `local:${Track.Source.Microphone}`,
      );
      const rttMs =
        micStats?.rttMs ??
        outbound.find((entry) => entry.rttMs !== null)?.rttMs ??
        null;

      const availableOutgoingBitrateBps =
        outbound.find((entry) => entry.availableOutgoingBitrateBps !== null)
          ?.availableOutgoingBitrateBps ?? null;

      this.onSnapshot({
        at: Date.now(),
        rttMs,
        availableOutgoingBitrateBps,
        outbound,
        inbound,
      });
    } finally {
      this.sampling = false;
    }
  }
}
