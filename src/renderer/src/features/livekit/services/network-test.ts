import {
  Checker,
  CheckStatus,
  ConnectionCheck,
  Track,
  type CheckInfo,
  type Room,
} from "livekit-client";
import {
  classifyIcePath,
  summarizeIcePath,
  type IcePathKind,
  type RawStatEntry,
} from "@shared/media-stats";

// The network test: livekit-client's ConnectionCheck run against the real SFU,
// in a room of the user's own (POST /media/livekit/network-test), with the same
// connection options the app uses for a call.

export type NetworkTestStepId =
  | "websocket"
  | "webrtc"
  | "audio"
  | "reconnect"
  | "path";

export type NetworkTestStepStatus =
  | "pending"
  | "running"
  | "passed"
  | "warned"
  | "failed"
  | "skipped";

export interface NetworkTestPath {
  /** The path media took on a normal connect. */
  udp: IcePathKind | null;
  /** The path after the server was asked to fall back to TCP. */
  tcp: IcePathKind | null;
}

export interface NetworkTestAudio {
  packetsSent: number;
  /** Loss the SFU reported back for the tone, when it reported anything. */
  lossPct: number | null;
  rttMs: number | null;
}

export interface NetworkTestStep {
  id: NetworkTestStepId;
  status: NetworkTestStepStatus;
  /** livekit-client's own log lines for the check, errors and warnings included. */
  logs: { level: "info" | "warning" | "error"; message: string }[];
  path?: NetworkTestPath;
  audio?: NetworkTestAudio;
}

export interface NetworkTestTarget {
  serverUrl: string;
  token: string;
  iceServers?: RTCIceServer[];
}

const PATH_WAIT_MS = 5_000;

const readPublisherPath = async (
  room: Room,
  wanted: IcePathKind | null,
): Promise<IcePathKind | null> => {
  const deadline = Date.now() + PATH_WAIT_MS;
  let seen: IcePathKind | null = null;
  while (Date.now() < deadline) {
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    const report = await track?.getRTCStatsReport();
    if (report) {
      seen = classifyIcePath(summarizeIcePath(Array.from(report.values()) as RawStatEntry[]));
      // Right after a protocol switch the old pair can still be reported for a
      // moment; wait for the one asked about, settle for the last seen.
      if (seen && (wanted === null || seen === wanted)) {
        return seen;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return seen;
};

const startTone = (): { track: MediaStreamTrack; stop: () => void } => {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const destination = context.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  return {
    track: destination.stream.getAudioTracks()[0],
    stop: () => {
      oscillator.stop();
      void context.close();
    },
  };
};

// Over 2% loss or a 200 ms round trip, a voice on this connection is audibly
// worse than it should be.
const AUDIO_LOSS_WARN_PCT = 2;
const AUDIO_RTT_WARN_MS = 200;
const AUDIO_SEND_MS = 3_000;

/**
 * Whether audio leaves this machine and reaches the SFU, and how well.
 *
 * livekit-client's own checkPublishAudio is not used. It opens the default
 * microphone and calls it broken if one 43 ms, 8-bit snapshot reads as pure
 * silence -- which a quiet room under the browser's noise suppression easily
 * does -- and on that path it never stops the capture, leaving the microphone
 * open. This is a network test; the microphone has its own test in the audio
 * settings. A tone answers the network question with neither problem.
 */
class AudioPublishCheck extends Checker {
  private audio: NetworkTestAudio | null = null;

  get description(): string {
    return "Audio reaches the SFU";
  }

  protected async perform(): Promise<void> {
    const room = await this.connect();
    const tone = startTone();
    try {
      const publication = await room.localParticipant.publishTrack(tone.track, {
        source: Track.Source.Microphone,
        dtx: false,
        red: false,
      });
      await new Promise((resolve) => setTimeout(resolve, AUDIO_SEND_MS));

      const report = await publication.track?.getRTCStatsReport();
      const entries = report ? (Array.from(report.values()) as RawStatEntry[]) : [];
      const outbound = entries.find((entry) => entry.type === "outbound-rtp");
      const remote = entries.find((entry) => entry.type === "remote-inbound-rtp");
      const packetsSent = typeof outbound?.packetsSent === "number" ? outbound.packetsSent : 0;
      const lost = typeof remote?.packetsLost === "number" ? remote.packetsLost : null;
      const rttMs =
        typeof remote?.roundTripTime === "number" ? Math.round(remote.roundTripTime * 1000) : null;
      const lossPct =
        lost !== null && packetsSent > 0 ? Math.round((lost / packetsSent) * 1000) / 10 : null;
      this.audio = { packetsSent, lossPct, rttMs };

      if (packetsSent === 0) {
        this.appendError("no audio packets were sent");
        return;
      }
      this.appendMessage(`sent ${packetsSent} audio packets`);
      if (lossPct !== null && lossPct > AUDIO_LOSS_WARN_PCT) {
        this.appendWarning(`the SFU reports ${lossPct}% of them lost`);
      }
      if (rttMs !== null && rttMs > AUDIO_RTT_WARN_MS) {
        this.appendWarning(`round trip ${rttMs} ms`);
      }
    } finally {
      tone.stop();
    }
  }

  getInfo(): CheckInfo {
    const info = super.getInfo();
    info.data = { audio: this.audio };
    return info;
  }
}

/**
 * Which path media takes, and whether the TCP fallback works.
 *
 * livekit-client's own checkConnectionProtocol is not used. It publishes a
 * 2 Mbps canvas for twenty seconds, and the requestAnimationFrame loop that
 * paints the canvas is never stopped: after one run, two loops would keep
 * painting in the background until the app restarted. A tone carries the
 * same answer, read off the selected candidate pair the way the call's own
 * telemetry reads it.
 */
class TransportPathCheck extends Checker {
  private readonly path: NetworkTestPath = { udp: null, tcp: null };

  get description(): string {
    return "Media transport path";
  }

  protected async perform(): Promise<void> {
    const room = await this.connect();
    const tone = startTone();
    try {
      await room.localParticipant.publishTrack(tone.track, {
        source: Track.Source.Microphone,
        dtx: false,
        red: false,
      });

      this.path.udp = await readPublisherPath(room, null);
      if (this.path.udp === null) {
        this.appendError("no candidate pair was selected for the published track");
        return;
      }
      this.appendMessage(`path on a normal connect: ${this.path.udp}`);
      if (this.path.udp !== "udp") {
        this.appendWarning(`media is carried over ${this.path.udp}, not UDP`);
      }

      try {
        await this.switchProtocol("tcp");
        this.path.tcp = await readPublisherPath(room, "tcp");
        this.appendMessage(`path after the TCP fallback: ${this.path.tcp ?? "none"}`);
      } catch (error) {
        this.appendWarning(
          `the TCP fallback did not connect: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      tone.stop();
    }
  }

  getInfo(): CheckInfo {
    const info = super.getInfo();
    info.data = { path: { ...this.path } };
    return info;
  }
}

const STEPS: {
  id: NetworkTestStepId;
  run: (check: ConnectionCheck) => Promise<CheckInfo>;
}[] = [
  { id: "websocket", run: (check) => check.checkWebsocket() },
  { id: "webrtc", run: (check) => check.checkWebRTC() },
  { id: "audio", run: (check) => check.createAndRunCheck(AudioPublishCheck) },
  { id: "reconnect", run: (check) => check.checkReconnect() },
  { id: "path", run: (check) => check.createAndRunCheck(TransportPathCheck) },
];

// The signal socket and the media connection are what every later check is
// built on: when either fails, the rest fail for the same reason and only add
// noise to the report.
const PREREQUISITES = new Set<NetworkTestStepId>(["websocket", "webrtc"]);

const toStep = (id: NetworkTestStepId, info: CheckInfo): NetworkTestStep => {
  let status: NetworkTestStepStatus = "passed";
  if (info.status === CheckStatus.FAILED) {
    status = "failed";
  } else if (info.status === CheckStatus.SKIPPED) {
    status = "skipped";
  } else if (info.logs.some((log) => log.level === "warning")) {
    status = "warned";
  }
  const data = info.data as { path?: NetworkTestPath; audio?: NetworkTestAudio | null } | undefined;
  return { id, status, logs: info.logs, path: data?.path, audio: data?.audio ?? undefined };
};

/**
 * Runs the checks one after another, reporting every change. Stops early when
 * a prerequisite fails, and between checks when isCancelled says so.
 */
export const runNetworkTest = async (
  target: NetworkTestTarget,
  onProgress: (steps: NetworkTestStep[]) => void,
  isCancelled: () => boolean = () => false,
): Promise<NetworkTestStep[]> => {
  const check = new ConnectionCheck(target.serverUrl, target.token, {
    // The connection a call makes: one PeerConnection, the same ICE servers.
    roomOptions: { singlePeerConnection: true },
    connectOptions: target.iceServers?.length
      ? { rtcConfig: { iceServers: target.iceServers } }
      : undefined,
  });

  const steps: NetworkTestStep[] = STEPS.map(({ id }) => ({
    id,
    status: "pending",
    logs: [],
  }));
  const report = (): void => onProgress(steps.map((step) => ({ ...step })));
  report();

  for (const [index, { id, run }] of STEPS.entries()) {
    if (isCancelled()) {
      break;
    }
    steps[index] = { ...steps[index], status: "running" };
    report();

    let info: CheckInfo;
    try {
      info = await run(check);
    } catch (error) {
      info = {
        name: id,
        description: id,
        status: CheckStatus.FAILED,
        logs: [{ level: "error", message: error instanceof Error ? error.message : String(error) }],
      };
    }
    steps[index] = toStep(id, info);
    report();

    if (steps[index].status === "failed" && PREREQUISITES.has(id)) {
      for (let later = index + 1; later < steps.length; later += 1) {
        steps[later] = { ...steps[later], status: "skipped" };
      }
      report();
      break;
    }
  }
  return steps;
};
