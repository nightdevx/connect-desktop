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

/**
 * How often the media path is measured.
 *
 * Every sample calls getRTCStatsReport() once per publication, and each of
 * those walks the peer connection's whole stats graph. In a ten-person room
 * that was ten-plus full stats collections a second on the renderer's main
 * thread -- the same thread drawing the game board, and the one that must not
 * stall while audio is being captured.
 *
 * Two seconds costs the badge nothing it was really delivering. Loss and
 * bitrate are already window averages, and the round-trip time is smoothed by
 * an EMA on top. The wider window is a small bonus of its own: more packets per
 * window means fewer of them are too thin to divide by.
 *
 * QUALITY_LIMITATION_TICKS in stream-manager.ts counts these, so it moved with
 * this number.
 */
const DEFAULT_INTERVAL_MS = 2_000;

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

      // Read every report concurrently rather than awaiting each in turn. The
      // reads do not touch each other -- one publication per key -- and doing
      // them one after another meant a room's worth of round trips stacked end
      // to end inside a single tick, which on a busy room could outlast the
      // interval itself and silently skip samples.
      const [localReports, remoteReports] = await Promise.all([
        Promise.all(
          Array.from(this.room.localParticipant.trackPublications.values()).map(
            async (publication) => ({
              key: `local:${publication.source}`,
              entries: await readReport(publication),
            }),
          ),
        ),
        Promise.all(
          Array.from(this.room.remoteParticipants.values()).flatMap((participant) =>
            Array.from(participant.trackPublications.values())
              .filter((publication) => publication.isSubscribed)
              .map(async (publication) => ({
                key: `${participant.identity}:${publication.source}`,
                entries: await readReport(publication),
              })),
          ),
        ),
      ]);

      for (const report of localReports) {
        liveKeys.add(report.key);
        if (!report.entries) {
          continue;
        }
        const summary = summarizeSenderReport(report.entries, this.cache, report.key);
        if (summary) {
          outbound.push(summary);
        }
      }

      for (const report of remoteReports) {
        liveKeys.add(report.key);
        if (!report.entries) {
          continue;
        }
        const summary = summarizeReceiverReport(report.entries, this.cache, report.key);
        if (summary) {
          inbound.push(summary);
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
