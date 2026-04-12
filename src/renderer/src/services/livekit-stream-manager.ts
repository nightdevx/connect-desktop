import {
  ConnectionQuality,
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  VideoPreset,
  VideoQuality,
  supportsVP9,
  type DisconnectReason,
  type LocalParticipant,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RoomEventCallbacks,
  type TrackPublication,
  type TrackPublishOptions,
} from "livekit-client";
import type {
  NetworkStats,
  QualityChangeEventPayload,
  QualityProfile,
  StreamingQualityProfileName,
} from "../../../shared/streaming-contracts";
import workspaceService from "./workspace-service";

export interface ParticipantMediaStreams {
  camera: MediaStream | null;
  screen: MediaStream | null;
}

export type ParticipantMediaMap = Record<string, ParticipantMediaStreams>;

export type ScreenShareMode = "slides" | "motion";

interface LiveKitStreamManagerCallbacks {
  onRemoteStreamsChanged: (streams: ParticipantMediaMap) => void;
  onConnectionStateChanged?: (
    state: "connecting" | "connected" | "reconnecting" | "disconnected",
  ) => void;
  onWarning?: (message: string) => void;
  onQualityProfileApplied?: (profile: QualityProfile, reason: string) => void;
}

interface SenderSample {
  bytesSent: number;
  measuredAtMs: number;
}

const EMPTY_STREAMS: ParticipantMediaStreams = {
  camera: null,
  screen: null,
};

const HIGH_PROFILE: QualityProfile = {
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
};

const profileOrder: StreamingQualityProfileName[] = [
  "EMERGENCY",
  "LOW",
  "MEDIUM",
  "HIGH",
  "ULTRA",
];

const cameraSimulcastMedium = new VideoPreset(1280, 720, 1_500_000, 30);
const cameraSimulcastLow = new VideoPreset(640, 360, 500_000, 20);

const cloneMediaStreams = (
  streams: Map<string, ParticipantMediaStreams>,
): ParticipantMediaMap => {
  const next: ParticipantMediaMap = {};
  streams.forEach((value, key) => {
    next[key] = {
      camera: value.camera,
      screen: value.screen,
    };
  });

  return next;
};

const buildSingleTrackStream = (track: MediaStreamTrack): MediaStream => {
  return new MediaStream([track]);
};

// LiveKitStreamManager controls connection, publishing, quality adaptation, and telemetry.
export class LiveKitStreamManager {
  private room: Room | null = null;
  private currentLobbyId: string | null = null;
  private remoteStreams = new Map<string, ParticipantMediaStreams>();
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
  private remoteAudioCleanups = new Map<string, () => void>();
  private remoteAudioTrackOwners = new Map<string, string>();
  private remoteAudioContext: AudioContext | null = null;

  private cameraPublication: LocalTrackPublication | null = null;
  private screenVideoPublication: LocalTrackPublication | null = null;
  private screenAudioPublication: LocalTrackPublication | null = null;

  private desiredCameraStream: MediaStream | null = null;
  private desiredScreenStream: MediaStream | null = null;
  private desiredScreenMode: ScreenShareMode = "slides";
  private desiredMicEnabled = true;

  private currentProfile: QualityProfile = HIGH_PROFILE;
  private activeNetworkStats: NetworkStats | null = null;
  private lowLatencyMode = true;

  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private manualDisconnect = false;

  private bandwidthTimer: number | null = null;
  private networkPolicyTimer: number | null = null;
  private senderSamples = new Map<string, SenderSample>();

  private qualityEventUnsubscribe: (() => void) | null = null;

  private readonly handleConnected: RoomEventCallbacks["connected"] = () => {
    this.callbacks.onConnectionStateChanged?.("connected");
    this.reconnectAttempt = 0;
    this.startBandwidthReporting();
    this.startNetworkPolicyLoop();
  };

  private readonly handleReconnecting: RoomEventCallbacks["reconnecting"] =
    () => {
      this.callbacks.onConnectionStateChanged?.("reconnecting");
    };

  private readonly handleSignalReconnecting: RoomEventCallbacks["signalReconnecting"] =
    () => {
      this.callbacks.onWarning?.("LiveKit signal bağlantısı yeniden kuruluyor");
    };

  private readonly handleReconnected: RoomEventCallbacks["reconnected"] =
    () => {
      this.callbacks.onConnectionStateChanged?.("connected");
      void this.restorePublishingState();
    };

  private readonly handleDisconnected: RoomEventCallbacks["disconnected"] = (
    reason?: DisconnectReason,
  ) => {
    this.callbacks.onConnectionStateChanged?.("disconnected");
    this.clearRemoteState();

    const detail = reason ? String(reason) : "unknown";
    if (!this.manualDisconnect) {
      this.callbacks.onWarning?.(`LiveKit bağlantısı koptu: ${detail}`);
      this.scheduleReconnect();
    }
  };

  private readonly handleParticipantConnected: RoomEventCallbacks["participantConnected"] =
    (participant: RemoteParticipant) => {
      this.callbacks.onWarning?.(
        `${participant.identity} odada, medya akışı bekleniyor`,
      );
    };

  private readonly handleParticipantDisconnected: RoomEventCallbacks["participantDisconnected"] =
    (participant: RemoteParticipant) => {
      this.removeRemoteAudioForIdentity(participant.identity);
      this.remoteStreams.delete(participant.identity);
      this.callbacks.onRemoteStreamsChanged(
        cloneMediaStreams(this.remoteStreams),
      );
    };

  private readonly handleTrackSubscribed: RoomEventCallbacks["trackSubscribed"] =
    (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      this.onTrackSubscribed(participant.identity, track, publication);
    };

  private readonly handleTrackUnsubscribed: RoomEventCallbacks["trackUnsubscribed"] =
    (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      this.onTrackUnsubscribed(participant.identity, track, publication);
    };

  private readonly handleLocalTrackPublished: RoomEventCallbacks["localTrackPublished"] =
    (publication: LocalTrackPublication) => {
      if (publication.source === Track.Source.Camera) {
        this.cameraPublication = publication;
      }
      if (publication.source === Track.Source.ScreenShare) {
        this.screenVideoPublication = publication;
      }
      if (publication.source === Track.Source.ScreenShareAudio) {
        this.screenAudioPublication = publication;
      }
    };

  private readonly handleLocalTrackUnpublished: RoomEventCallbacks["localTrackUnpublished"] =
    (publication: LocalTrackPublication) => {
      if (publication.source === Track.Source.Camera) {
        this.cameraPublication = null;
      }
      if (publication.source === Track.Source.ScreenShare) {
        this.screenVideoPublication = null;
      }
      if (publication.source === Track.Source.ScreenShareAudio) {
        this.screenAudioPublication = null;
      }
    };

  private readonly handleConnectionQualityChanged: RoomEventCallbacks["connectionQualityChanged"] =
    (quality: ConnectionQuality, participant: Participant) => {
      if (!this.room || participant.sid !== this.room.localParticipant.sid) {
        return;
      }

      if (quality === ConnectionQuality.Poor) {
        this.callbacks.onWarning?.(
          "Yerel bağlantı kalitesi düştü, adaptif profil uygulanıyor",
        );
      }
    };

  private readonly handleMediaDevicesError: RoomEventCallbacks["mediaDevicesError"] =
    (error: Error) => {
      this.callbacks.onWarning?.(`Medya cihaz hatası: ${error.message}`);
    };

  private readonly handleTrackSubscriptionFailed: RoomEventCallbacks["trackSubscriptionFailed"] =
    (trackSid: string, participant: RemoteParticipant) => {
      this.callbacks.onWarning?.(
        `${participant.identity} için track subscribe başarısız: ${trackSid}`,
      );
    };

  public constructor(
    private readonly callbacks: LiveKitStreamManagerCallbacks,
  ) {
    this.bindQualityEvents();
  }

  // connect connects to the LiveKit room with reconnect support and state preservation.
  public async connect(lobbyId: string): Promise<void> {
    this.manualDisconnect = false;

    if (
      this.room &&
      this.currentLobbyId === lobbyId &&
      this.room.state === "connected"
    ) {
      return;
    }

    this.callbacks.onConnectionStateChanged?.("connecting");
    this.currentLobbyId = lobbyId;

    await this.establishConnection(lobbyId);
    await this.restorePublishingState();
  }

  // disconnect stops reconnect attempts and disconnects from the active room.
  public async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.stopReconnectTimer();
    this.stopBandwidthReporting();
    this.stopNetworkPolicyLoop();

    this.removeAllRemoteAudioElements();
    this.clearRemoteState();

    const activeRoom = this.room;
    this.room = null;

    this.cameraPublication = null;
    this.screenVideoPublication = null;
    this.screenAudioPublication = null;

    if (activeRoom) {
      await activeRoom.disconnect(false);
    }

    this.callbacks.onConnectionStateChanged?.("disconnected");
  }

  // dispose releases handlers and closes room resources.
  public async dispose(): Promise<void> {
    if (this.qualityEventUnsubscribe) {
      this.qualityEventUnsubscribe();
      this.qualityEventUnsubscribe = null;
    }

    await this.disconnect();
  }

  // setMicrophoneEnabled updates microphone publication state and resilience flags.
  public async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.desiredMicEnabled = enabled;

    if (!this.room) {
      return;
    }

    await this.room.localParticipant.setMicrophoneEnabled(
      enabled,
      {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      {
        dtx: this.shouldEnableDtx(),
        red: this.shouldEnableRed(),
      },
    );
  }

  // publishCameraStream publishes camera with 3-layer simulcast and local override support.
  public async publishCameraStream(stream: MediaStream): Promise<void> {
    this.desiredCameraStream = stream;

    const track = stream.getVideoTracks()[0];
    if (!track) {
      throw new Error("Kamera videosu bulunamadı");
    }

    if (!this.room) {
      throw new Error("LiveKit bağlantısı hazır değil");
    }

    await this.unpublishCamera();

    await this.applyTrackConstraints(track, this.currentProfile, "camera");

    const publication = await this.room.localParticipant.publishTrack(track, {
      source: Track.Source.Camera,
      simulcast: true,
      videoCodec: this.currentProfile.codec === "VP8" ? "vp8" : "h264",
      videoEncoding: {
        maxBitrate: Math.max(400_000, this.currentProfile.bitrateKbps * 1000),
        maxFramerate: this.currentProfile.frameRate,
      },
      videoSimulcastLayers: [cameraSimulcastMedium, cameraSimulcastLow],
      degradationPreference: this.lowLatencyMode
        ? "maintain-framerate"
        : "balanced",
    });

    this.cameraPublication = publication;
    this.setVideoQualityHint(publication.track, this.currentProfile.name);
    await this.applySenderParameters(publication, this.currentProfile);
  }

  // unpublishCamera unpublishes camera track while preserving desired publish state.
  public async unpublishCamera(): Promise<void> {
    if (!this.room) {
      this.cameraPublication = null;
      return;
    }

    const track = this.cameraPublication?.track?.mediaStreamTrack;
    if (!track) {
      this.cameraPublication = null;
      return;
    }

    await this.room.localParticipant.unpublishTrack(track, false);
    this.cameraPublication = null;
  }

  // publishScreenStream publishes screen in slides or motion mode with simulcast/SVC controls.
  public async publishScreenStream(
    stream: MediaStream,
    mode?: ScreenShareMode,
  ): Promise<void> {
    this.desiredScreenStream = stream;
    this.desiredScreenMode = mode ?? this.inferScreenMode(stream);

    if (!this.room) {
      throw new Error("LiveKit bağlantısı hazır değil");
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error("Yayın videosu bulunamadı");
    }

    await this.unpublishScreen();

    const screenProfile = this.resolveScreenProfile(
      this.currentProfile,
      this.desiredScreenMode,
    );

    await this.applyTrackConstraints(videoTrack, screenProfile, "screen");

    const useSvc = this.desiredScreenMode === "motion" && supportsVP9();

    const publication = await this.room.localParticipant.publishTrack(
      videoTrack,
      {
        source: Track.Source.ScreenShare,
        simulcast: !useSvc,
        videoCodec: useSvc
          ? "vp9"
          : this.currentProfile.codec === "VP8"
            ? "vp8"
            : "h264",
        scalabilityMode: useSvc ? "L3T3_KEY" : undefined,
        screenShareEncoding: {
          maxBitrate: Math.max(300_000, screenProfile.bitrateKbps * 1000),
          maxFramerate: screenProfile.frameRate,
        },
        screenShareSimulcastLayers: useSvc
          ? undefined
          : [
              new VideoPreset(
                1280,
                720,
                1_500_000,
                Math.min(30, screenProfile.frameRate),
              ),
              new VideoPreset(
                640,
                360,
                500_000,
                Math.min(15, screenProfile.frameRate),
              ),
            ],
        degradationPreference:
          this.desiredScreenMode === "slides"
            ? "maintain-resolution"
            : this.lowLatencyMode
              ? "maintain-framerate"
              : "balanced",
      },
    );

    this.screenVideoPublication = publication;
    this.setVideoQualityHint(publication.track, screenProfile.name);
    await this.applySenderParameters(publication, screenProfile);

    const audioTrack = stream.getAudioTracks()[0] ?? null;
    if (audioTrack) {
      this.screenAudioPublication =
        await this.room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio,
          dtx: this.shouldEnableDtx(),
          red: this.shouldEnableRed(),
        });
    }
  }

  // unpublishScreen unpublishes both screen video and optional screen audio tracks.
  public async unpublishScreen(): Promise<void> {
    if (!this.room) {
      this.screenVideoPublication = null;
      this.screenAudioPublication = null;
      return;
    }

    const videoTrack = this.screenVideoPublication?.track?.mediaStreamTrack;
    if (videoTrack) {
      await this.room.localParticipant.unpublishTrack(videoTrack, false);
    }

    const audioTrack = this.screenAudioPublication?.track?.mediaStreamTrack;
    if (audioTrack) {
      await this.room.localParticipant.unpublishTrack(audioTrack, false);
    }

    this.screenVideoPublication = null;
    this.screenAudioPublication = null;
  }

  // applyQualityProfile applies backend/manual profile decisions over currently published tracks.
  public applyQualityProfile(profile: QualityProfile): void {
    this.currentProfile = profile;

    void this.applyQualityProfileAsync(profile, "backend-quality-override");
  }

  private async applyQualityProfileAsync(
    profile: QualityProfile,
    reason: string,
  ): Promise<void> {
    const cameraTrack = this.cameraPublication?.track?.mediaStreamTrack;
    if (cameraTrack) {
      await this.applyTrackConstraints(cameraTrack, profile, "camera");
      await this.applySenderParameters(this.cameraPublication, profile);
      this.setVideoQualityHint(this.cameraPublication?.track, profile.name);
    }

    const screenTrack = this.screenVideoPublication?.track?.mediaStreamTrack;
    if (screenTrack) {
      const screenProfile = this.resolveScreenProfile(
        profile,
        this.desiredScreenMode,
      );
      await this.applyTrackConstraints(screenTrack, screenProfile, "screen");
      await this.applySenderParameters(
        this.screenVideoPublication,
        screenProfile,
      );
      this.setVideoQualityHint(
        this.screenVideoPublication?.track,
        screenProfile.name,
      );
    }

    this.callbacks.onQualityProfileApplied?.(profile, reason);
  }

  private async establishConnection(lobbyId: string): Promise<void> {
    if (this.room) {
      await this.room.disconnect(false);
      this.room = null;
    }

    const tokenResult = await workspaceService.createLiveKitToken({
      room: lobbyId,
    });
    if (!tokenResult.ok || !tokenResult.data) {
      throw new Error(tokenResult.error?.message ?? "LiveKit token alınamadı");
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: false,
    });

    this.bindRoomEvents(room);
    this.room = room;

    await room.connect(tokenResult.data.serverUrl, tokenResult.data.token, {
      autoSubscribe: true,
      maxRetries: 0,
    });
  }

  private bindRoomEvents(room: Room): void {
    room.on(RoomEvent.Connected, this.handleConnected);
    room.on(RoomEvent.Reconnecting, this.handleReconnecting);
    room.on(RoomEvent.SignalReconnecting, this.handleSignalReconnecting);
    room.on(RoomEvent.Reconnected, this.handleReconnected);
    room.on(RoomEvent.Disconnected, this.handleDisconnected);

    room.on(RoomEvent.ParticipantConnected, this.handleParticipantConnected);
    room.on(
      RoomEvent.ParticipantDisconnected,
      this.handleParticipantDisconnected,
    );
    room.on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed);
    room.on(
      RoomEvent.TrackSubscriptionFailed,
      this.handleTrackSubscriptionFailed,
    );

    room.on(RoomEvent.LocalTrackPublished, this.handleLocalTrackPublished);
    room.on(RoomEvent.LocalTrackUnpublished, this.handleLocalTrackUnpublished);
    room.on(
      RoomEvent.ConnectionQualityChanged,
      this.handleConnectionQualityChanged,
    );
    room.on(RoomEvent.MediaDevicesError, this.handleMediaDevicesError);
  }

  private scheduleReconnect(): void {
    if (
      this.manualDisconnect ||
      this.reconnectTimer != null ||
      !this.currentLobbyId
    ) {
      return;
    }

    this.reconnectAttempt += 1;
    const exponent = Math.min(6, this.reconnectAttempt);
    const baseDelayMs = Math.min(30_000, 1000 * 2 ** exponent);
    const jitterMs = Math.floor(Math.random() * 350);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      const lobbyId = this.currentLobbyId;
      if (!lobbyId || this.manualDisconnect) {
        return;
      }

      void this.establishConnection(lobbyId)
        .then(async () => {
          this.reconnectAttempt = 0;
          await this.restorePublishingState();
        })
        .catch((error) => {
          this.callbacks.onWarning?.(
            `LiveKit yeniden bağlanma başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
          );
          this.scheduleReconnect();
        });
    }, baseDelayMs + jitterMs);
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async restorePublishingState(): Promise<void> {
    if (!this.room) {
      return;
    }

    await this.setMicrophoneEnabled(this.desiredMicEnabled);

    if (this.desiredCameraStream) {
      await this.publishCameraStream(this.desiredCameraStream);
    }

    if (this.desiredScreenStream) {
      await this.publishScreenStream(
        this.desiredScreenStream,
        this.desiredScreenMode,
      );
    }
  }

  private bindQualityEvents(): void {
    if (
      typeof window === "undefined" ||
      !window.streaming ||
      typeof window.streaming.onQualityChange !== "function"
    ) {
      return;
    }

    this.qualityEventUnsubscribe = window.streaming.onQualityChange(
      (event: QualityChangeEventPayload) => {
        if (event.stage === "prepare") {
          void this.applyQualityProfileAsync(
            event.profile,
            "prepare-transition",
          );
          return;
        }

        this.applyQualityProfile(event.profile);
      },
    );
  }

  private startBandwidthReporting(): void {
    this.stopBandwidthReporting();

    this.bandwidthTimer = window.setInterval(() => {
      void this.reportActivePublishBandwidth();
    }, 2000);
  }

  private stopBandwidthReporting(): void {
    if (this.bandwidthTimer != null) {
      window.clearInterval(this.bandwidthTimer);
      this.bandwidthTimer = null;
    }
    this.senderSamples.clear();
  }

  private startNetworkPolicyLoop(): void {
    this.stopNetworkPolicyLoop();

    this.networkPolicyTimer = window.setInterval(() => {
      void this.refreshNetworkAdaptivePolicy();
    }, 2000);
  }

  private stopNetworkPolicyLoop(): void {
    if (this.networkPolicyTimer != null) {
      window.clearInterval(this.networkPolicyTimer);
      this.networkPolicyTimer = null;
    }
  }

  private async refreshNetworkAdaptivePolicy(): Promise<void> {
    if (
      !window.streaming ||
      typeof window.streaming.getNetworkStatus !== "function"
    ) {
      return;
    }

    try {
      const stats = await window.streaming.getNetworkStatus();
      this.activeNetworkStats = stats;

      let changed = false;

      if (stats.packetLossPercent > 5) {
        changed = true;
      }

      if (stats.packetLossPercent > 15) {
        const downgraded = this.downgradeProfile(this.currentProfile);
        if (downgraded.name !== this.currentProfile.name) {
          this.currentProfile = downgraded;
          await this.applyQualityProfileAsync(
            downgraded,
            "network-loss-severe",
          );
          changed = true;
        }
      }

      if (stats.jitterMs > 150) {
        this.lowLatencyMode = false;
        changed = true;
      }

      if (stats.rttMs > 300) {
        this.lowLatencyMode = false;
        changed = true;
      } else if (stats.rttMs < 220 && stats.jitterMs < 120) {
        this.lowLatencyMode = true;
      }

      if (changed && this.desiredMicEnabled) {
        await this.setMicrophoneEnabled(true);
      }
    } catch (error) {
      this.callbacks.onWarning?.(
        `Ağ politikası alınamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
      );
    }
  }

  private shouldEnableRed(): boolean {
    return (this.activeNetworkStats?.packetLossPercent ?? 0) > 5;
  }

  private shouldEnableDtx(): boolean {
    const jitter = this.activeNetworkStats?.jitterMs ?? 0;
    const rtt = this.activeNetworkStats?.rttMs ?? 0;
    return jitter > 150 || rtt > 300;
  }

  private inferScreenMode(stream: MediaStream): ScreenShareMode {
    const frameRate = stream.getVideoTracks()[0]?.getSettings().frameRate ?? 15;
    return frameRate >= 25 ? "motion" : "slides";
  }

  private resolveScreenProfile(
    baseProfile: QualityProfile,
    mode: ScreenShareMode,
  ): QualityProfile {
    if (mode === "slides") {
      return {
        ...baseProfile,
        width: Math.max(1920, baseProfile.width),
        height: Math.max(1080, baseProfile.height),
        frameRate: Math.max(
          5,
          Math.min(15, Math.floor(baseProfile.frameRate / 2)),
        ),
        keyframeIntervalMs: 300,
      };
    }

    return {
      ...baseProfile,
      width: Math.min(baseProfile.width, 1280),
      height: Math.min(baseProfile.height, 720),
      frameRate: Math.max(30, Math.min(60, baseProfile.frameRate)),
      keyframeIntervalMs: 500,
    };
  }

  private downgradeProfile(profile: QualityProfile): QualityProfile {
    const index = profileOrder.indexOf(profile.name);
    if (index <= 0) {
      return profile;
    }

    const nextName = profileOrder[index - 1];
    if (nextName === "LOW") {
      return {
        ...profile,
        name: "LOW",
        width: 854,
        height: 480,
        frameRate: 24,
        bitrateKbps: 800,
        keyframeIntervalMs: 350,
        senderParameters: { maxBitrateBps: 800_000, maxFramerate: 24 },
      };
    }

    if (nextName === "EMERGENCY") {
      return {
        ...profile,
        name: "EMERGENCY",
        width: 640,
        height: 360,
        frameRate: 15,
        bitrateKbps: 300,
        codec: "VP8",
        codecProfile: "",
        keyframeIntervalMs: 250,
        senderParameters: { maxBitrateBps: 300_000, maxFramerate: 15 },
      };
    }

    if (nextName === "MEDIUM") {
      return {
        ...profile,
        name: "MEDIUM",
        width: 1280,
        height: 720,
        frameRate: 30,
        bitrateKbps: 2000,
        keyframeIntervalMs: 800,
        senderParameters: { maxBitrateBps: 2_000_000, maxFramerate: 30 },
      };
    }

    return {
      ...profile,
      name: "HIGH",
      width: 1920,
      height: 1080,
      frameRate: 30,
      bitrateKbps: 4000,
      keyframeIntervalMs: 1200,
      senderParameters: { maxBitrateBps: 4_000_000, maxFramerate: 30 },
    };
  }

  private async applyTrackConstraints(
    track: MediaStreamTrack,
    profile: QualityProfile,
    source: "camera" | "screen",
  ): Promise<void> {
    const constraints: MediaTrackConstraints = {
      width: { ideal: profile.width },
      height: { ideal: profile.height },
      frameRate: { ideal: profile.frameRate, max: profile.frameRate },
    };

    if (source === "camera") {
      (
        constraints as MediaTrackConstraints & {
          focusMode?: ConstrainDOMString;
        }
      ).focusMode = "continuous";
    }

    try {
      await track.applyConstraints(constraints);
    } catch (error) {
      this.callbacks.onWarning?.(
        `Track constraint uygulanamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
      );
    }
  }

  private async applySenderParameters(
    publication: LocalTrackPublication | null,
    profile: QualityProfile,
  ): Promise<void> {
    const sender = publication?.track?.sender;
    if (!sender) {
      return;
    }

    const parameters = sender.getParameters();
    const encodings = parameters.encodings ?? [{}];

    if (encodings.length >= 3) {
      const ordered = [
        profile.senderParameters.maxBitrateBps,
        Math.min(1_500_000, profile.senderParameters.maxBitrateBps),
        Math.min(500_000, profile.senderParameters.maxBitrateBps),
      ];

      parameters.encodings = encodings.map((encoding, index) => {
        const targetBitrate = ordered[Math.min(index, ordered.length - 1)];
        return {
          ...encoding,
          maxBitrate: Math.max(100_000, targetBitrate),
          maxFramerate: profile.senderParameters.maxFramerate,
        };
      });
    } else {
      parameters.encodings = encodings.map((encoding) => {
        return {
          ...encoding,
          maxBitrate: profile.senderParameters.maxBitrateBps,
          maxFramerate: profile.senderParameters.maxFramerate,
        };
      });
    }

    try {
      await sender.setParameters(parameters);
    } catch (error) {
      this.callbacks.onWarning?.(
        `RTCRtpSender ayarı güncellenemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
      );
    }
  }

  private setVideoQualityHint(
    localTrack: LocalTrackPublication["track"] | undefined,
    profileName: StreamingQualityProfileName,
  ): void {
    if (!(localTrack instanceof LocalVideoTrack)) {
      return;
    }

    const quality =
      profileName === "ULTRA" || profileName === "HIGH"
        ? VideoQuality.HIGH
        : profileName === "MEDIUM"
          ? VideoQuality.MEDIUM
          : VideoQuality.LOW;

    localTrack.setPublishingQuality(quality);
  }

  private async reportActivePublishBandwidth(): Promise<void> {
    if (
      !this.room ||
      !window.streaming ||
      typeof window.streaming.reportBandwidthEstimate !== "function"
    ) {
      return;
    }

    await this.reportPublicationBandwidth("camera", this.cameraPublication);
    await this.reportPublicationBandwidth(
      "screen",
      this.screenVideoPublication,
    );
  }

  private async reportPublicationBandwidth(
    source: "camera" | "screen",
    publication: LocalTrackPublication | null,
  ): Promise<void> {
    if (!publication?.track?.sender || !this.currentLobbyId) {
      return;
    }

    const sender = publication.track.sender;

    try {
      const stats = await sender.getStats();
      let bytesSent = 0;
      let packetsSent = 0;
      let packetsLost = 0;
      let rttMs = 0;

      stats.forEach((report) => {
        if (report.type === "outbound-rtp" && !report.isRemote) {
          bytesSent += report.bytesSent ?? 0;
          packetsSent += report.packetsSent ?? 0;
        }

        if (report.type === "remote-inbound-rtp") {
          packetsLost += report.packetsLost ?? 0;
          if (typeof report.roundTripTime === "number") {
            rttMs = Math.max(rttMs, report.roundTripTime * 1000);
          }
        }
      });

      const key = `${source}`;
      const nowMs = Date.now();
      const previous = this.senderSamples.get(key);
      this.senderSamples.set(key, { bytesSent, measuredAtMs: nowMs });

      if (!previous || nowMs <= previous.measuredAtMs) {
        return;
      }

      const bytesDiff = bytesSent - previous.bytesSent;
      const elapsedSeconds = (nowMs - previous.measuredAtMs) / 1000;
      if (bytesDiff <= 0 || elapsedSeconds <= 0) {
        return;
      }

      const bitrateBps = Math.floor((bytesDiff * 8) / elapsedSeconds);

      await window.streaming.reportBandwidthEstimate({
        roomId: this.currentLobbyId,
        source,
        profile: this.currentProfile.name,
        bitrateBps,
        packetsLost,
        packetsSent,
        rttMs,
        timestamp: new Date(nowMs).toISOString(),
      });
    } catch (error) {
      this.callbacks.onWarning?.(
        `Bant genişliği raporu gönderilemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
      );
    }
  }

  private clearRemoteState(): void {
    this.remoteStreams.clear();
    this.callbacks.onRemoteStreamsChanged({});
  }

  private onTrackSubscribed(
    identity: string,
    track: RemoteTrack,
    publication: RemoteTrackPublication,
  ): void {
    if (track.kind === Track.Kind.Audio) {
      this.attachRemoteAudio(track, publication, identity);
      return;
    }

    const previous = this.remoteStreams.get(identity) ?? EMPTY_STREAMS;
    const source = publication.source;

    const next: ParticipantMediaStreams = {
      camera: previous.camera,
      screen: previous.screen,
    };

    if (source === Track.Source.Camera) {
      next.camera = buildSingleTrackStream(track.mediaStreamTrack);
    }

    if (source === Track.Source.ScreenShare) {
      next.screen = buildSingleTrackStream(track.mediaStreamTrack);
    }

    this.remoteStreams.set(identity, next);
    this.callbacks.onRemoteStreamsChanged(
      cloneMediaStreams(this.remoteStreams),
    );
  }

  private onTrackUnsubscribed(
    identity: string,
    track: RemoteTrack,
    publication: RemoteTrackPublication,
  ): void {
    if (track.kind === Track.Kind.Audio) {
      this.detachRemoteAudio(publication.trackSid);
      return;
    }

    const previous = this.remoteStreams.get(identity);
    if (!previous) {
      return;
    }

    const source = publication.source;
    const next: ParticipantMediaStreams = {
      camera: previous.camera,
      screen: previous.screen,
    };

    if (source === Track.Source.Camera) {
      next.camera = null;
    }

    if (source === Track.Source.ScreenShare) {
      next.screen = null;
    }

    if (!next.camera && !next.screen) {
      this.remoteStreams.delete(identity);
    } else {
      this.remoteStreams.set(identity, next);
    }

    this.callbacks.onRemoteStreamsChanged(
      cloneMediaStreams(this.remoteStreams),
    );
  }

  private attachRemoteAudio(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participantIdentity: string,
  ): void {
    this.detachRemoteAudio(publication.trackSid);

    const stream = buildSingleTrackStream(track.mediaStreamTrack);
    const webAudioCleanup = this.attachRemoteAudioWithWebAudio(
      stream,
      track.mediaStreamTrack,
    );

    if (webAudioCleanup) {
      this.remoteAudioCleanups.set(publication.trackSid, webAudioCleanup);
      this.remoteAudioTrackOwners.set(
        publication.trackSid,
        participantIdentity,
      );
      return;
    }

    const audioElement = track.attach() as HTMLAudioElement;
    audioElement.autoplay = true;
    audioElement.dataset.livekitTrackSid = publication.trackSid;
    audioElement.style.display = "none";
    document.body.appendChild(audioElement);
    this.remoteAudioElements.set(publication.trackSid, audioElement);
    this.remoteAudioTrackOwners.set(publication.trackSid, participantIdentity);
  }

  private detachRemoteAudio(trackSid: string): void {
    const cleanup = this.remoteAudioCleanups.get(trackSid);
    if (cleanup) {
      cleanup();
      this.remoteAudioCleanups.delete(trackSid);
    }

    const existing = this.remoteAudioElements.get(trackSid);
    if (!existing) {
      this.remoteAudioTrackOwners.delete(trackSid);
      this.closeRemoteAudioContextIfIdle();
      return;
    }

    existing.remove();
    this.remoteAudioElements.delete(trackSid);
    this.remoteAudioTrackOwners.delete(trackSid);
    this.closeRemoteAudioContextIfIdle();
  }

  private removeRemoteAudioForIdentity(identity: string): void {
    const relatedTrackSIDs: string[] = [];

    this.remoteAudioTrackOwners.forEach((ownerIdentity, trackSid) => {
      if (ownerIdentity === identity) {
        relatedTrackSIDs.push(trackSid);
      }
    });

    relatedTrackSIDs.forEach((trackSid) => {
      this.detachRemoteAudio(trackSid);
    });
  }

  private removeAllRemoteAudioElements(): void {
    this.remoteAudioCleanups.forEach((cleanup) => {
      cleanup();
    });
    this.remoteAudioCleanups.clear();

    this.remoteAudioElements.forEach((element) => {
      element.remove();
    });
    this.remoteAudioElements.clear();
    this.remoteAudioTrackOwners.clear();
    this.closeRemoteAudioContextIfIdle();
  }

  private getRemoteAudioContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (this.remoteAudioContext) {
      return this.remoteAudioContext;
    }

    const Ctx =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!Ctx) {
      return null;
    }

    this.remoteAudioContext = new Ctx();
    return this.remoteAudioContext;
  }

  private attachRemoteAudioWithWebAudio(
    stream: MediaStream,
    track: MediaStreamTrack,
  ): (() => void) | null {
    const context = this.getRemoteAudioContext();
    if (!context) {
      return null;
    }

    const source = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(1, context.currentTime);

    let splitterNode: ChannelSplitterNode | null = null;
    let mergerNode: ChannelMergerNode | null = null;
    let outputNode: AudioNode = source;

    const channelCountFromSettings = track.getSettings().channelCount;
    const effectiveChannelCount =
      typeof channelCountFromSettings === "number" &&
      Number.isFinite(channelCountFromSettings)
        ? channelCountFromSettings
        : source.channelCount;

    if (effectiveChannelCount <= 1) {
      splitterNode = context.createChannelSplitter(1);
      mergerNode = context.createChannelMerger(2);

      source.connect(splitterNode);
      splitterNode.connect(mergerNode, 0, 0);
      splitterNode.connect(mergerNode, 0, 1);
      outputNode = mergerNode;
    }

    outputNode.connect(gainNode);
    gainNode.connect(context.destination);
    void context.resume().catch(() => undefined);

    return () => {
      try {
        source.disconnect();
      } catch {
        // no-op
      }

      try {
        splitterNode?.disconnect();
      } catch {
        // no-op
      }

      try {
        mergerNode?.disconnect();
      } catch {
        // no-op
      }

      try {
        gainNode.disconnect();
      } catch {
        // no-op
      }
    };
  }

  private closeRemoteAudioContextIfIdle(): void {
    if (
      !this.remoteAudioContext ||
      this.remoteAudioCleanups.size > 0 ||
      this.remoteAudioElements.size > 0
    ) {
      return;
    }

    const context = this.remoteAudioContext;
    this.remoteAudioContext = null;
    void context.close().catch(() => undefined);
  }
}

// Backward-compatible alias for existing renderer imports.
export class LiveKitMediaSession extends LiveKitStreamManager {}
