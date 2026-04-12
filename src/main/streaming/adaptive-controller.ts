import { BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  STREAMING_ERROR_CHANNEL,
  STREAMING_QUALITY_CHANGED_CHANNEL,
  STREAMING_QUALITY_PREPARE_CHANNEL,
  type BandwidthEstimatePayload,
  type NetworkStats,
  type QualityChangeEventPayload,
  type StreamingQualityProfile,
  type StreamingQualityProfileName,
} from "../../shared/streaming-contracts";

interface AdaptiveControllerOptions {
  grpcTarget?: string;
  protoPath?: string;
}

interface IncomingProfileChangeEvent {
  profile?: string;
  reason?: string;
  timestamp_unix_ms?: number | string;
  network_score?: number;
  rtt_ms?: number;
  packet_loss_percent?: number;
  bandwidth_kbps?: number;
  jitter_ms?: number;
  probe_mode?: string;
  quality?: string;
  width?: number;
  height?: number;
  frame_rate?: number;
  bitrate_kbps?: number;
  codec?: string;
  codec_profile?: string;
  keyframe_interval_ms?: number;
}

const profileDefaults: Record<
  StreamingQualityProfileName,
  StreamingQualityProfile
> = {
  ULTRA: {
    name: "ULTRA",
    width: 1920,
    height: 1080,
    frameRate: 60,
    bitrateKbps: 8000,
    codec: "H264",
    codecProfile: "High",
    keyframeIntervalMs: 2000,
    senderParameters: {
      maxBitrateBps: 8_000_000,
      maxFramerate: 60,
    },
  },
  HIGH: {
    name: "HIGH",
    width: 1920,
    height: 1080,
    frameRate: 30,
    bitrateKbps: 4000,
    codec: "H264",
    codecProfile: "High",
    keyframeIntervalMs: 2000,
    senderParameters: {
      maxBitrateBps: 4_000_000,
      maxFramerate: 30,
    },
  },
  MEDIUM: {
    name: "MEDIUM",
    width: 1280,
    height: 720,
    frameRate: 30,
    bitrateKbps: 2000,
    codec: "H264",
    codecProfile: "Main",
    keyframeIntervalMs: 1000,
    senderParameters: {
      maxBitrateBps: 2_000_000,
      maxFramerate: 30,
    },
  },
  LOW: {
    name: "LOW",
    width: 854,
    height: 480,
    frameRate: 30,
    bitrateKbps: 800,
    codec: "H264",
    codecProfile: "Baseline",
    keyframeIntervalMs: 500,
    senderParameters: {
      maxBitrateBps: 800_000,
      maxFramerate: 30,
    },
  },
  EMERGENCY: {
    name: "EMERGENCY",
    width: 640,
    height: 360,
    frameRate: 15,
    bitrateKbps: 300,
    codec: "VP8",
    codecProfile: "",
    keyframeIntervalMs: 250,
    senderParameters: {
      maxBitrateBps: 300_000,
      maxFramerate: 15,
    },
  },
};

const toProfileName = (
  value: string | undefined,
): StreamingQualityProfileName => {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "ULTRA") {
    return "ULTRA";
  }
  if (normalized === "HIGH") {
    return "HIGH";
  }
  if (normalized === "MEDIUM") {
    return "MEDIUM";
  }
  if (normalized === "LOW") {
    return "LOW";
  }
  return "EMERGENCY";
};

// AdaptiveController receives backend profile commands and broadcasts quality transitions.
export class AdaptiveController {
  private readonly grpcTarget: string | null;
  private readonly protoPath: string;

  private grpcClient: any = null;
  private grpcStream: any = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private started = false;
  private manualProfile: StreamingQualityProfileName | null = null;

  private networkStats: NetworkStats = {
    score: 0,
    rttMs: 0,
    packetLossPercent: 0,
    bandwidthKbps: 0,
    jitterMs: 0,
    quality: "poor",
    probeMode: "normal",
    activeProfile: "MEDIUM",
    manualProfile: null,
    updatedAt: new Date(0).toISOString(),
  };

  public constructor(options: AdaptiveControllerOptions) {
    const normalizedTarget = options.grpcTarget?.trim();
    this.grpcTarget = normalizedTarget ? normalizedTarget : null;
    this.protoPath = options.protoPath ?? this.resolveDefaultProtoPath();
  }

  // start opens the gRPC profile change stream and begins listening for updates.
  public start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    if (!this.grpcTarget) {
      return;
    }

    this.connectStream();
  }

  // stop closes stream resources and cancels pending reconnect attempts.
  public stop(): void {
    this.started = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.grpcStream && typeof this.grpcStream.cancel === "function") {
      this.grpcStream.cancel();
    }
    this.grpcStream = null;

    if (this.grpcClient && typeof this.grpcClient.close === "function") {
      this.grpcClient.close();
    }
    this.grpcClient = null;
  }

  // setManualQuality applies a manual profile override, or clears it when null.
  public setManualQuality(
    profile: StreamingQualityProfileName | null,
  ): StreamingQualityProfile | null {
    this.manualProfile = profile;
    this.networkStats.manualProfile = profile;
    this.networkStats.updatedAt = new Date().toISOString();

    if (!profile) {
      return null;
    }

    const resolvedProfile = profileDefaults[profile];
    this.networkStats.activeProfile = profile;

    const payload: QualityChangeEventPayload = {
      profile: resolvedProfile,
      reason: "manual quality override",
      timestamp: new Date().toISOString(),
      mode: "manual",
      stage: "commit",
    };

    void this.transitionWithoutDrop(payload);
    return resolvedProfile;
  }

  // getNetworkStatus returns the latest known network and profile snapshot.
  public getNetworkStatus(): NetworkStats {
    return { ...this.networkStats };
  }

  // reportBandwidthEstimate forwards renderer-side uplink measurements to backend via gRPC.
  public async reportBandwidthEstimate(
    payload: BandwidthEstimatePayload,
  ): Promise<void> {
    if (
      !this.grpcClient ||
      typeof this.grpcClient.ReportBandwidthEstimate !== "function"
    ) {
      return;
    }

    const timestampMs = Date.parse(payload.timestamp);

    await new Promise<void>((resolvePromise, rejectPromise) => {
      this.grpcClient.ReportBandwidthEstimate(
        {
          room_id: payload.roomId,
          source: payload.source,
          profile: payload.profile,
          bitrate_bps: Math.max(0, Math.floor(payload.bitrateBps)),
          packets_lost: Math.max(0, Math.floor(payload.packetsLost)),
          packets_sent: Math.max(0, Math.floor(payload.packetsSent)),
          rtt_ms: Math.max(0, payload.rttMs),
          timestamp_unix_ms: Number.isFinite(timestampMs)
            ? timestampMs
            : Date.now(),
        },
        (error: Error | null) => {
          if (error) {
            rejectPromise(error);
            return;
          }

          resolvePromise();
        },
      );
    }).catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "report bandwidth estimate failed";
      this.emitError("GRPC_BANDWIDTH_REPORT_FAILED", message);
    });
  }

  private connectStream(): void {
    if (!this.started) {
      return;
    }

    const grpcTarget = this.grpcTarget;
    if (!grpcTarget) {
      return;
    }

    const grpc = this.safeRequire("@grpc/grpc-js");
    const protoLoader = this.safeRequire("@grpc/proto-loader");
    if (!grpc || !protoLoader) {
      this.emitError(
        "GRPC_MODULE_MISSING",
        "gRPC modules could not be loaded. Install @grpc/grpc-js and @grpc/proto-loader.",
      );
      return;
    }

    if (!existsSync(this.protoPath)) {
      this.emitError(
        "GRPC_PROTO_NOT_FOUND",
        `Adaptive proto could not be found at ${this.protoPath}`,
      );
      return;
    }

    try {
      const packageDefinition = protoLoader.loadSync(this.protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const loaded = grpc.loadPackageDefinition(packageDefinition) as {
        adaptivecontroller?: {
          v1?: {
            QualityDecisionService?: new (
              target: string,
              creds: unknown,
            ) => {
              StreamProfileChanges: (request: { client_id: string }) => any;
              ReportBandwidthEstimate?: (
                request: {
                  room_id: string;
                  source: string;
                  profile: string;
                  bitrate_bps: number;
                  packets_lost: number;
                  packets_sent: number;
                  rtt_ms: number;
                  timestamp_unix_ms: number;
                },
                callback: (error: Error | null) => void,
              ) => void;
              close?: () => void;
            };
          };
        };
      };

      const ServiceCtor = loaded.adaptivecontroller?.v1?.QualityDecisionService;
      if (!ServiceCtor) {
        this.emitError(
          "GRPC_SERVICE_NOT_FOUND",
          "QualityDecisionService definition could not be loaded from proto.",
        );
        return;
      }

      this.grpcClient = new ServiceCtor(
        grpcTarget,
        grpc.credentials.createInsecure(),
      );

      this.grpcStream = this.grpcClient.StreamProfileChanges({
        client_id: "connect-desktop-main",
      });

      this.grpcStream.on("data", (event: IncomingProfileChangeEvent) => {
        this.handleIncomingProfileEvent(event);
      });

      this.grpcStream.on("error", (error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown adaptive stream error";
        this.emitError("GRPC_STREAM_ERROR", message);
        this.scheduleReconnect();
      });

      this.grpcStream.on("end", () => {
        this.scheduleReconnect();
      });

      this.grpcStream.on("close", () => {
        this.scheduleReconnect();
      });

      this.reconnectAttempt = 0;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Adaptive stream initialization failed";
      this.emitError("GRPC_STREAM_INIT_FAILED", message);
      this.scheduleReconnect();
    }
  }

  private handleIncomingProfileEvent(event: IncomingProfileChangeEvent): void {
    const requestedProfileName = toProfileName(event.profile);
    const appliedProfileName = this.manualProfile ?? requestedProfileName;

    const profile = this.resolveProfileFromEvent(appliedProfileName, event);
    const timestamp = this.resolveTimestamp(event.timestamp_unix_ms);
    const reason =
      event.reason?.trim() ||
      (this.manualProfile
        ? "manual profile override is active"
        : "profile changed by backend decision stream");

    this.networkStats = {
      score: this.toFiniteNumber(event.network_score, this.networkStats.score),
      rttMs: this.toFiniteNumber(event.rtt_ms, this.networkStats.rttMs),
      packetLossPercent: this.toFiniteNumber(
        event.packet_loss_percent,
        this.networkStats.packetLossPercent,
      ),
      bandwidthKbps: this.toFiniteNumber(
        event.bandwidth_kbps,
        this.networkStats.bandwidthKbps,
      ),
      jitterMs: this.toFiniteNumber(
        event.jitter_ms,
        this.networkStats.jitterMs,
      ),
      quality: this.normalizeQuality(event.quality, this.networkStats.quality),
      probeMode: this.normalizeProbeMode(
        event.probe_mode,
        this.networkStats.probeMode,
      ),
      activeProfile: profile.name,
      manualProfile: this.manualProfile,
      updatedAt: timestamp,
    };

    const payload: QualityChangeEventPayload = {
      profile,
      reason,
      timestamp,
      mode: this.manualProfile ? "manual" : "auto",
      stage: "commit",
    };

    void this.transitionWithoutDrop(payload);
  }

  private async transitionWithoutDrop(
    payload: QualityChangeEventPayload,
  ): Promise<void> {
    this.broadcast(STREAMING_QUALITY_PREPARE_CHANNEL, payload);

    await new Promise<void>((resolvePromise) => {
      setTimeout(() => resolvePromise(), 120);
    });

    this.broadcast(STREAMING_QUALITY_CHANGED_CHANNEL, payload);
  }

  private resolveProfileFromEvent(
    profileName: StreamingQualityProfileName,
    event: IncomingProfileChangeEvent,
  ): StreamingQualityProfile {
    const base = profileDefaults[profileName];

    const width = this.toFiniteNumber(event.width, base.width);
    const height = this.toFiniteNumber(event.height, base.height);
    const frameRate = this.toFiniteNumber(event.frame_rate, base.frameRate);
    const bitrateKbps = this.toFiniteNumber(
      event.bitrate_kbps,
      base.bitrateKbps,
    );
    const keyframeIntervalMs = this.toFiniteNumber(
      event.keyframe_interval_ms,
      base.keyframeIntervalMs,
    );

    const codec = (event.codec?.toUpperCase() === "VP8" ? "VP8" : "H264") as
      | "H264"
      | "VP8";

    const codecProfile =
      event.codec_profile === "High" ||
      event.codec_profile === "Main" ||
      event.codec_profile === "Baseline"
        ? event.codec_profile
        : base.codecProfile;

    return {
      name: profileName,
      width,
      height,
      frameRate,
      bitrateKbps,
      codec,
      codecProfile,
      keyframeIntervalMs,
      senderParameters: {
        maxBitrateBps: Math.max(100_000, Math.floor(bitrateKbps * 1000)),
        maxFramerate: Math.max(1, Math.floor(frameRate)),
      },
    };
  }

  private scheduleReconnect(): void {
    if (!this.started) {
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempt += 1;
    const retryDelayMs = Math.min(
      30_000,
      1000 * 2 ** Math.min(5, this.reconnectAttempt),
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectStream();
    }, retryDelayMs);
  }

  private emitError(code: string, message: string): void {
    this.broadcast(STREAMING_ERROR_CHANNEL, {
      code,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) {
        continue;
      }

      win.webContents.send(channel, payload);
    }
  }

  private safeRequire(moduleName: string): any {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(moduleName);
    } catch {
      return null;
    }
  }

  private resolveDefaultProtoPath(): string {
    const candidates = [
      resolve(__dirname, "./proto/adaptive-controller.proto"),
      resolve(
        process.cwd(),
        "src/main/streaming/proto/adaptive-controller.proto",
      ),
      resolve(
        process.cwd(),
        "dist/main/streaming/proto/adaptive-controller.proto",
      ),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return candidates[0];
  }

  private resolveTimestamp(raw: number | string | undefined): string {
    const numeric = this.toFiniteNumber(raw, Date.now());
    return new Date(numeric).toISOString();
  }

  private toFiniteNumber(
    raw: number | string | undefined,
    fallback: number,
  ): number {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }

    if (typeof raw === "string") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  private normalizeQuality(
    raw: string | undefined,
    fallback: NetworkStats["quality"],
  ): NetworkStats["quality"] {
    const normalized = raw?.trim().toLowerCase();
    if (
      normalized === "good" ||
      normalized === "medium" ||
      normalized === "poor"
    ) {
      return normalized;
    }

    return fallback;
  }

  private normalizeProbeMode(
    raw: string | undefined,
    fallback: NetworkStats["probeMode"],
  ): NetworkStats["probeMode"] {
    const normalized = raw?.trim().toLowerCase();
    if (normalized === "normal" || normalized === "degraded") {
      return normalized;
    }

    return fallback;
  }
}
