import {
  AudioPresets,
  Room,
  Track,
  ConnectionState,
  DisconnectReason,
  LocalParticipant,
  type Participant,
  type RoomOptions,
  type TrackPublication,
  type TrackPublishOptions,
  type VideoCodec,
} from "livekit-client";
import { logLiveKitDebug } from "../debug-log";
import { LiveKitMicrophoneController } from "../mic";
import type { MicrophoneProcessingPreferences } from "../mic/types";
import {
  type LiveKitStreamManagerCallbacks,
  type ParticipantMediaMap,
  type ParticipantMediaState,
  type ScreenShareMode,
  type VideoPublishQuality,
  type LiveKitAudioProcessingPreferences,
  type RemoteParticipantAudioPreference,
} from "./types";
import { DEFAULT_AUDIO_PROCESSING_PREFERENCES } from "./constants";
import { RemoteMediaHandler } from "./remote-media-handler";
import { RoomEventManager } from "./room-event-manager";
import { MediaStatsCollector, type MediaStatsSnapshot } from "./stats-collector";
import { findQualityLimitation } from "@shared/media-stats";
import {
  DEFAULT_VIDEO_PUBLISH_PREFERENCES,
  buildVideoPublishPlan,
  resolveVideoCodec,
  type VideoContentMode,
  type VideoPublishPreferences,
  type VideoPublishTarget,
} from "./video-profiles";

const AUDIO_LEVEL_SAMPLE_INTERVAL_MS = 100;
const LOCAL_SPEAKING_THRESHOLD = 0.015;
const AUDIO_LEVEL_EMIT_DELTA = 0.05;
// 500ms of hangover at a 100ms tick.
const LOCAL_SILENCE_HOLD_TICKS = 5;
// Stats tick once a second; only warn after the limitation has persisted, so a
// momentary spike while a share starts up does not fire a scary message.
const QUALITY_LIMITATION_TICKS = 8;

// Audio level is compared with a tolerance: it wobbles continuously, and
// treating every micro-change as "changed" would defeat the whole point.
const isSameParticipantMediaState = (
  left: ParticipantMediaState,
  right: ParticipantMediaState,
): boolean => {
  return (
    left.participant === right.participant &&
    left.micEnabled === right.micEnabled &&
    left.cameraEnabled === right.cameraEnabled &&
    left.screenEnabled === right.screenEnabled &&
    left.isSpeaking === right.isSpeaking &&
    left.camera === right.camera &&
    left.screen === right.screen &&
    left.cameraStream === right.cameraStream &&
    left.screenStream === right.screenStream &&
    Math.abs(left.audioLevel - right.audioLevel) <= AUDIO_LEVEL_EMIT_DELTA
  );
};

export class LiveKitStreamManager {
  private room: Room | null = null;
  private currentLobbyId: string | null = null;
  private mediaMap: ParticipantMediaMap = {};
  
  private desiredCameraEnabled = false;
  private desiredScreenEnabled = false;
  private desiredCameraStream: MediaStream | null = null;
  private desiredScreenStream: MediaStream | null = null;
  private desiredScreenMode: ScreenShareMode = "slides";
  private desiredScreenQuality: VideoPublishQuality | null = null;
  private desiredCameraQuality: VideoPublishQuality | null = null;
  private desiredMicEnabled = false;
  private audioProcessingPreferences: LiveKitAudioProcessingPreferences = {
    ...DEFAULT_AUDIO_PROCESSING_PREFERENCES,
  };
  private videoPublishPreferences: VideoPublishPreferences = {
    ...DEFAULT_VIDEO_PUBLISH_PREFERENCES,
  };
  private resolvedVideoCodec: VideoCodec = resolveVideoCodec(
    DEFAULT_VIDEO_PUBLISH_PREFERENCES,
  );

  // No reconnect timer/attempt state here: reconnection is owned by LiveKit
  // internally and, once it gives up, by the app-level reconnect chain. These
  // fields were written but never read.
  private manualDisconnect = false;
  private replacingRoom = false;

  private remoteMediaHandler: RemoteMediaHandler | null = null;
  private roomEventManager: RoomEventManager | null = null;
  private statsCollector: MediaStatsCollector | null = null;
  private readonly microphoneController: LiveKitMicrophoneController;

  private audioContext: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localAudioSource: MediaStreamAudioSourceNode | null = null;
  private micGainNode: GainNode | null = null;
  private localAudioLevel = 0;
  private isSpeakingLocal = false;
  private silenceTicks = 0;
  private lastCapturedStreamId: string | null = null;
  private readonly streamCache = new Map<string, MediaStream>();

  private monitorTimer: number | null = null;
  private analyserBuffer: Uint8Array<ArrayBuffer> | null = null;

  private limitedTicks = 0;
  private limitationNotified = false;
  private videoQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly callbacks: LiveKitStreamManagerCallbacks = {},
  ) {
    this.microphoneController = new LiveKitMicrophoneController(
      (msg) => this.callbacks.onWarning?.(msg),
      (mode) => this.callbacks.onNoiseSuppressionModeChanged?.(mode),
    );
  }

  // Audio-level monitoring runs only while connected to a room.
  //
  // This used to be a requestAnimationFrame loop that rebuilt the whole
  // participant media map at display refresh rate. Every pass produced fresh
  // objects, so React re-rendered every participant tile ~60 times a second —
  // during a screen share that competed directly with the encoder for CPU.
  // A speaking indicator does not need 60Hz; 10Hz is imperceptibly different
  // and only emits when something actually changed.
  private startAudioMonitoring() {
    if (this.monitorTimer !== null) return;
    this.monitorTimer = window.setInterval(() => {
      this.sampleAudioLevels();
    }, AUDIO_LEVEL_SAMPLE_INTERVAL_MS);
  }

  private stopAudioMonitoring(): void {
    if (this.monitorTimer !== null) {
      window.clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    this.silenceTicks = 0;
    this.isSpeakingLocal = false;
    this.localAudioLevel = 0;
  }

  private readLocalAudioLevel(): number | null {
    if (!this.localAnalyser) {
      return null;
    }

    const binCount = this.localAnalyser.frequencyBinCount;
    if (!this.analyserBuffer || this.analyserBuffer.length !== binCount) {
      this.analyserBuffer = new Uint8Array(new ArrayBuffer(binCount));
    }

    const dataArray = this.analyserBuffer;
    this.localAnalyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i += 1) {
      sum += dataArray[i];
    }

    return sum / dataArray.length / 128;
  }

  private sampleAudioLevels(): void {
    let needsUpdate = false;

    const level = this.readLocalAudioLevel();
    if (level !== null) {
      if (level > LOCAL_SPEAKING_THRESHOLD) {
        this.silenceTicks = 0;
        if (!this.isSpeakingLocal) {
          this.isSpeakingLocal = true;
          needsUpdate = true;
        }
        if (Math.abs(level - this.localAudioLevel) > AUDIO_LEVEL_EMIT_DELTA) {
          this.localAudioLevel = level;
          needsUpdate = true;
        }
      } else if (this.isSpeakingLocal) {
        // Hangover so a pause between words does not flicker the indicator.
        this.silenceTicks += 1;
        if (this.silenceTicks >= LOCAL_SILENCE_HOLD_TICKS) {
          this.isSpeakingLocal = false;
          this.localAudioLevel = 0;
          this.silenceTicks = 0;
          needsUpdate = true;
        }
      }
    }

    // Remote speaking flips also arrive via ActiveSpeakersChanged; this catches
    // level drift for the volume bars in between those events.
    if (!needsUpdate && this.room) {
      for (const participant of this.room.remoteParticipants.values()) {
        const current = this.mediaMap[participant.identity];
        if (!current) {
          continue;
        }
        if (
          current.isSpeaking !== participant.isSpeaking ||
          Math.abs(current.audioLevel - participant.audioLevel) >
            AUDIO_LEVEL_EMIT_DELTA
        ) {
          needsUpdate = true;
          break;
        }
      }
    }

    if (needsUpdate) {
      this.updateMediaMap();
    }
  }

  private async updateLocalAudioSource(stream: MediaStream | null) {
    if (!stream) {
      this.localAudioSource?.disconnect();
      this.micGainNode?.disconnect();
      this.localAudioSource = null;
      this.localAnalyser = null;
      this.micGainNode = null;
      this.lastCapturedStreamId = null;
      return;
    }

    if (stream.id === this.lastCapturedStreamId) return;

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.localAudioSource?.disconnect();
      this.micGainNode?.disconnect();

      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.micGainNode = this.audioContext.createGain();
      this.micGainNode.gain.value = Math.max(0, this.audioProcessingPreferences.microphoneVolume) / 100;

      this.localAudioSource = this.audioContext.createMediaStreamSource(stream);
      this.localAudioSource.connect(this.micGainNode);
      this.micGainNode.connect(this.localAnalyser);
      this.lastCapturedStreamId = stream.id;
    } catch (err) {
      console.warn("[LiveKitStreamManager] Failed to setup local audio analysis:", err);
    }
  }

  public async connect(
    url: string,
    token: string,
    lobbyId: string,
  ): Promise<void> {
    // Idempotent only when the existing room is actually CONNECTED to the same
    // lobby. A stale/disconnected room (after an unexpected drop) must be torn
    // down and rebuilt, otherwise reconnect would silently no-op.
    if (
      this.room &&
      this.currentLobbyId === lobbyId &&
      this.room.state === ConnectionState.Connected
    ) {
      return;
    }

    if (this.room) {
      this.replacingRoom = true;
      await this.disconnect();
      this.replacingRoom = false;
    }

    this.currentLobbyId = lobbyId;
    this.manualDisconnect = false;

    this.resolvedVideoCodec = resolveVideoCodec(this.videoPublishPreferences);

    const options: RoomOptions = {
      adaptiveStream: { pixelDensity: "screen" },
      dynacast: true,
      publishDefaults: {
        // Defaults only. Every video publish supplies its own codec, encoding
        // and layer ladder through buildVideoPublishPlan, derived from the
        // resolution the user actually selected.
        videoCodec: this.resolvedVideoCodec,
        dtx: true,
        red: true,
        stopMicTrackOnMute: true,
      },
    };

    this.room = new Room(options);
    this.remoteMediaHandler = new RemoteMediaHandler(this.room);
    this.roomEventManager = new RoomEventManager(
      this.room,
      this.callbacks,
      this.remoteMediaHandler,
      () => this.updateMediaMap(),
      (reason) => this.handleDisconnected(reason),
      () => this.restorePublishingState(),
    );

    this.roomEventManager.registerEvents();
    this.startAudioMonitoring();

    this.limitedTicks = 0;
    this.limitationNotified = false;
    this.statsCollector = new MediaStatsCollector(this.room, (snapshot) => {
      this.callbacks.onMediaStats?.(snapshot);
      this.evaluateQualityLimitation(snapshot);
    });

    if (this.remoteMediaHandler && this.audioProcessingPreferences.selectedAudioOutputDeviceId) {
      void this.remoteMediaHandler.setAudioOutputDevice(this.audioProcessingPreferences.selectedAudioOutputDeviceId);
    }

    try {
      this.callbacks.onConnectionStateChanged?.("connecting");
      // autoSubscribe and connectTimeout are ConnectOptions
      await this.room.connect(url, token, { 
        autoSubscribe: false,
      });
      
      // Publish the microphone first: it is the lowest-bandwidth track and the
      // only one the user notices missing.
      this.microphoneController.prepareParticipantAudioContext(this.room.localParticipant);
      await this.applyMicrophoneState();

      this.statsCollector?.start();

      // Subscribe to what is already in the room. This used to be a hand-rolled
      // ladder of setTimeouts — 200ms settle, 20ms between audio tracks, a
      // 1000ms pause, then 50ms between video tracks — which pushed join to
      // ~2.5s and raced against room teardown (the deferred block kept running
      // after a disconnect). Pacing is what `dynacast` and `adaptiveStream`
      // already do, informed by real congestion signals rather than guesses.
      this.subscribeToExistingTracks();

      await this.restorePublishingState();
    } catch (error) {
      this.callbacks.onConnectionStateChanged?.("disconnected");
      throw error;
    }
  }

  private async cleanupLocalAudioMonitoring(): Promise<void> {
    await this.updateLocalAudioSource(null);
    if (this.audioContext) {
      try {
        if (this.audioContext.state !== "closed") {
          await this.audioContext.close();
        }
      } catch (err) {
        console.warn("[LiveKitStreamManager] Failed to close audioContext:", err);
      }
      this.audioContext = null;
    }
  }

  public async disconnect(): Promise<void> {
    this.manualDisconnect = !this.replacingRoom;
    this.currentLobbyId = null;
    this.stopAudioMonitoring();
    this.statsCollector?.stop();
    this.statsCollector = null;

    // 1. Explicitly disable/mute and stop the microphone track and processor BEFORE disconnecting the room!
    if (this.room) {
      try {
        await this.microphoneController.applyMicrophoneState({
          enabled: false,
          participant: this.room.localParticipant,
          preferences: this.buildMicrophonePreferences(),
          publishOptions: this.buildMicrophonePublishOptions(),
        });
      } catch (err) {
        console.warn("[LiveKitStreamManager] Failed to mute mic before disconnect:", err);
      }
    }

    // 2. Cleanup local audio monitoring (AudioContext, source node, analyzer)
    await this.cleanupLocalAudioMonitoring();

    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }

    if (this.remoteMediaHandler) {
      this.remoteMediaHandler.dispose();
      this.remoteMediaHandler = null;
    }

    await this.microphoneController.dispose();
    this.mediaMap = {};
    this.streamCache.clear();
    this.callbacks.onRemoteStreamsChanged?.({});
    this.callbacks.onConnectionStateChanged?.("disconnected");
  }

  public async setCameraEnabled(
    enabled: boolean,
    stream: MediaStream | null = null,
    quality: VideoPublishQuality | null = null,
  ): Promise<void> {
    this.desiredCameraEnabled = enabled;
    this.desiredCameraStream = stream;
    if (quality) this.desiredCameraQuality = quality;
    await this.applyCameraState();
  }

  public async setScreenEnabled(
    enabled: boolean,
    stream: MediaStream | null = null,
    mode: ScreenShareMode = "slides",
    quality: VideoPublishQuality | null = null,
  ): Promise<void> {
    this.desiredScreenEnabled = enabled;
    this.desiredScreenStream = stream;
    this.desiredScreenMode = mode;
    if (quality) this.desiredScreenQuality = quality;
    await this.applyScreenState();
  }

  public async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.desiredMicEnabled = enabled;
    await this.applyMicrophoneState();
  }

  public setAudioProcessingPreferences(prefs: LiveKitAudioProcessingPreferences): void {
    void this.applyAudioProcessing(prefs);
  }

  public setDeafened(deafened: boolean): void {
    this.remoteMediaHandler?.setDeafened(deafened);
  }

  private async applyAudioProcessing(prefs: LiveKitAudioProcessingPreferences): Promise<void> {
    const changed = 
      this.audioProcessingPreferences.enhancedNoiseSuppressionEnabled !== prefs.enhancedNoiseSuppressionEnabled ||
      this.audioProcessingPreferences.noiseSuppressionPreset !== prefs.noiseSuppressionPreset ||
      this.audioProcessingPreferences.selectedAudioInputDeviceId !== prefs.selectedAudioInputDeviceId;

    const masterVolumeChanged = this.audioProcessingPreferences.masterVolume !== prefs.masterVolume;
    const micVolumeChanged = this.audioProcessingPreferences.microphoneVolume !== prefs.microphoneVolume;

    this.audioProcessingPreferences = { ...prefs };

    // Apply master volume to all remote audio elements
    if (masterVolumeChanged && this.remoteMediaHandler) {
      this.remoteMediaHandler.setMasterVolume(prefs.masterVolume);
    }

    if (micVolumeChanged) {
      // Published audio: the gain node inside the microphone processor chain.
      this.microphoneController.setMicrophoneGain(prefs.microphoneVolume);
      // Local level meter, so the bar reflects what is actually being sent.
      if (this.micGainNode) {
        this.micGainNode.gain.value = Math.max(0, prefs.microphoneVolume) / 100;
      }
    }

    if (changed && this.room?.localParticipant.isMicrophoneEnabled) {
      await this.microphoneController.refreshMicrophoneProcessing({
        participant: this.room.localParticipant,
        preferences: this.buildMicrophonePreferences(prefs),
        publishOptions: this.buildMicrophonePublishOptions(),
      });
    }

    if (this.remoteMediaHandler) {
      void this.remoteMediaHandler.setAudioOutputDevice(
        prefs.selectedAudioOutputDeviceId,
      );
    }
  }

  // Audio first (cheapest and most missed), then the heavy video tracks. The
  // awaits already serialise these; the old fixed 500ms sleeps between them
  // just delayed the stream without changing the order.
  private async restorePublishingState(): Promise<void> {
    await this.applyMicrophoneState();

    if (this.desiredCameraEnabled) {
      await this.applyCameraState();
    }

    if (this.desiredScreenEnabled) {
      await this.applyScreenState();
    }
  }

  private subscribeToExistingTracks(): void {
    if (!this.room) {
      return;
    }

    const deafened = this.remoteMediaHandler?.isDeafenedNow() ?? false;

    for (const participant of this.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (deafened && publication.kind === Track.Kind.Audio) {
          continue;
        }
        void publication.setSubscribed(true);
      }
    }
  }

  // Video quality problems are invisible to the person causing them: their own
  // preview looks fine. This turns "why is your stream blurry" into a concrete,
  // actionable message — and distinguishes a saturated uplink from a software
  // encoder that cannot keep up, which look identical to a viewer.
  private evaluateQualityLimitation(snapshot: MediaStatsSnapshot): void {
    const limitation = findQualityLimitation(snapshot.outbound);

    if (!limitation) {
      this.limitedTicks = 0;
      this.limitationNotified = false;
      return;
    }

    this.limitedTicks += 1;
    if (
      this.limitedTicks < QUALITY_LIMITATION_TICKS ||
      this.limitationNotified
    ) {
      return;
    }

    this.limitationNotified = true;

    if (limitation.softwareEncoderAtFault) {
      this.callbacks.onWarning?.(
        "Video yazılımla kodlanıyor ve işlemci yetişemiyor. Ayarlar → Uygulama'dan donanım hızlandırmayı açın.",
      );
      return;
    }

    if (limitation.kind === "cpu") {
      this.callbacks.onWarning?.(
        "İşlemci yayın kalitesini karşılayamıyor; daha düşük bir yayın kalitesi seçin.",
      );
      return;
    }

    this.callbacks.onWarning?.(
      "Yükleme hızı seçilen yayın kalitesine yetmiyor, görüntü otomatik olarak düşürüldü.",
    );
  }

  private buildMicrophonePreferences(
    source: LiveKitAudioProcessingPreferences = this.audioProcessingPreferences,
  ): MicrophoneProcessingPreferences {
    return {
      enhancedNoiseSuppressionEnabled: source.enhancedNoiseSuppressionEnabled,
      noiseSuppressionPreset: source.noiseSuppressionPreset,
      selectedAudioInputDeviceId: source.selectedAudioInputDeviceId,
      microphoneVolume: source.microphoneVolume,
    };
  }

  // 64 kbps mono Opus instead of LiveKit's 32 kbps default. Voice is the one
  // stream that is always on and it is by far the cheapest thing in the room to
  // spend bitrate on; RED adds packet-loss redundancy on top.
  private buildMicrophonePublishOptions(): TrackPublishOptions {
    return {
      dtx: true,
      red: true,
      audioPreset: AudioPresets.musicHighQuality,
    };
  }

  private async applyMicrophoneState(): Promise<void> {
    if (!this.room) return;
    await this.microphoneController.applyMicrophoneState({
      enabled: this.desiredMicEnabled,
      participant: this.room.localParticipant,
      preferences: this.buildMicrophonePreferences(),
      publishOptions: this.buildMicrophonePublishOptions(),
    });
  }

  // The captured track is the ground truth: a source that could not honour the
  // requested resolution still has to get a layer ladder matching what it is
  // actually producing, not what was asked for.
  private resolveVideoTarget(
    track: MediaStreamTrack,
    quality: VideoPublishQuality | null,
    fallback: VideoPublishTarget,
  ): VideoPublishTarget {
    const settings = track.getSettings();
    return {
      width: settings.width ?? quality?.width ?? fallback.width,
      height: settings.height ?? quality?.height ?? fallback.height,
      maxFramerate:
        quality?.maxFramerate ??
        Math.round(settings.frameRate ?? fallback.maxFramerate),
      maxBitrateBps: quality?.maxBitrateBps ?? fallback.maxBitrateBps,
    };
  }

  private resolveCameraTarget(track: MediaStreamTrack): VideoPublishTarget {
    return this.resolveVideoTarget(track, this.desiredCameraQuality, {
      width: 1280,
      height: 720,
      maxFramerate: 30,
      maxBitrateBps: 1_700_000,
    });
  }

  private resolveScreenTarget(track: MediaStreamTrack): VideoPublishTarget {
    return this.resolveVideoTarget(track, this.desiredScreenQuality, {
      width: 1920,
      height: 1080,
      maxFramerate: 30,
      maxBitrateBps: 3_000_000,
    });
  }

  /**
   * Codec / hardware-acceleration preferences. Applied to the next publish —
   * changing the codec of a live track means renegotiating it, which is a
   * visible glitch we do not want to trigger from a settings toggle.
   */
  public setVideoPublishPreferences(
    preferences: VideoPublishPreferences,
  ): void {
    this.videoPublishPreferences = { ...preferences };
    if (!this.room) {
      this.resolvedVideoCodec = resolveVideoCodec(this.videoPublishPreferences);
    }
  }

  // Camera and screen publishes both unpublish-then-publish on the same
  // participant. Interleaving them (toggle camera while a screen share is
  // starting, or a reconnect restoring both at once) could unpublish a track
  // another in-flight call had just replaced. The mic controller already
  // serialises its work; video now does too.
  private enqueueVideo<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.videoQueue.then(operation, operation);
    this.videoQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private applyCameraState(): Promise<void> {
    return this.enqueueVideo(() => this.applyCameraStateInternal());
  }

  private applyScreenState(): Promise<void> {
    return this.enqueueVideo(() => this.applyScreenStateInternal());
  }

  private async applyCameraStateInternal(): Promise<void> {
    if (!this.room) return;
    const participant = this.room.localParticipant;
    
    if (!this.desiredCameraEnabled) {
      if (participant.isCameraEnabled) {
        await participant.setCameraEnabled(false);
      }
      return;
    }

    const videoTrack = this.desiredCameraStream?.getVideoTracks()[0];
    if (videoTrack) {
      // Check if this specific track is already published
      const isAlreadyPublished = Array.from(participant.trackPublications.values()).some(
        (pub) => pub.track?.mediaStreamTrack === videoTrack
      );
      
      if (isAlreadyPublished) return;

      // Unpublish existing camera tracks first to avoid conflicts
      const existingPubs = Array.from(participant.trackPublications.values()).filter(
        (pub) => pub.source === Track.Source.Camera
      );
      for (const pub of existingPubs) {
        if (pub.track) {
          await participant.unpublishTrack(pub.track);
        }
      }

      // Camera is motion content; keep framerate over resolution on congestion.
      try {
        videoTrack.contentHint = "motion";
      } catch {
        // no-op
      }

      const target = this.resolveCameraTarget(videoTrack);
      const plan = buildVideoPublishPlan({
        target,
        codec: this.resolvedVideoCodec,
        contentMode: "motion",
      });

      logLiveKitDebug("stream-manager", "publish-camera", {
        contentHint: videoTrack.contentHint,
        ...target,
        codec: plan.videoCodec,
        simulcast: plan.simulcast,
        layers: plan.videoSimulcastLayers?.length ?? 0,
        scalabilityMode: plan.scalabilityMode ?? null,
      });

      await participant.publishTrack(videoTrack, {
        name: "camera",
        source: Track.Source.Camera,
        ...plan,
      });
    } else {
      if (!participant.isCameraEnabled) {
        await participant.setCameraEnabled(true);
      }
    }
  }

  private async applyScreenStateInternal(): Promise<void> {
    if (!this.room) return;
    const participant = this.room.localParticipant;
    
    if (!this.desiredScreenEnabled) {
      if (participant.isScreenShareEnabled) {
        await participant.setScreenShareEnabled(false);
      }
      return;
    }

    const screenTrack = this.desiredScreenStream?.getVideoTracks()[0];
    if (screenTrack) {
      // Check if this specific track is already published
      const isAlreadyPublished = Array.from(participant.trackPublications.values()).some(
        (pub) => pub.track?.mediaStreamTrack === screenTrack
      );

      if (isAlreadyPublished) return;

      // Unpublish existing screen tracks first
      const existingPubs = Array.from(participant.trackPublications.values()).filter(
        (pub) => pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio
      );
      for (const pub of existingPubs) {
        if (pub.track) {
          await participant.unpublishTrack(pub.track);
        }
      }

      // Tune encoder to the captured content: motion (game/video) prioritises
      // framerate, slides/text prioritises sharpness. contentHint steers the
      // WebRTC encoder; degradationPreference governs what to drop under load.
      const contentMode: VideoContentMode =
        this.desiredScreenMode === "motion" ? "motion" : "detail";
      try {
        screenTrack.contentHint = contentMode;
      } catch {
        // no-op
      }

      const target = this.resolveScreenTarget(screenTrack);
      const plan = buildVideoPublishPlan({
        target,
        codec: this.resolvedVideoCodec,
        contentMode,
      });

      logLiveKitDebug("stream-manager", "publish-screen", {
        mode: this.desiredScreenMode,
        contentHint: screenTrack.contentHint,
        ...target,
        codec: plan.videoCodec,
        simulcast: plan.simulcast,
        layers: plan.videoSimulcastLayers?.length ?? 0,
        scalabilityMode: plan.scalabilityMode ?? null,
      });

      await participant.publishTrack(screenTrack, {
        name: "screen",
        source: Track.Source.ScreenShare,
        ...plan,
      });

      // Also publish audio track if available (screen share audio)
      const audioTracks = this.desiredScreenStream?.getAudioTracks() ?? [];
      const audioTrack = audioTracks[0];
      
      logLiveKitDebug("stream-manager", "screen-capture-status", {
        hasStream: !!this.desiredScreenStream,
        videoTrackId: screenTrack.id,
        audioTracksCount: audioTracks.length,
        firstAudioTrackId: audioTrack?.id,
        firstAudioTrackEnabled: audioTrack?.enabled,
        firstAudioTrackReadyState: audioTrack?.readyState,
      });

      if (audioTrack) {
        try {
          // Audio comes from the process-exclude loopback (already free of our
          // own output), so publish it directly — no mix-minus needed.
          //
          // Game and music audio is stereo and wideband: the old publish left
          // it on the mono 32 kbps voice default, which is where most of the
          // "screen share audio sounds bad" came from. dtx stays off so a quiet
          // passage is not mistaken for silence and cut.
          await participant.publishTrack(audioTrack, {
            name: "screen_audio",
            source: Track.Source.ScreenShareAudio,
            dtx: false,
            red: true,
            forceStereo: true,
            audioPreset: AudioPresets.musicHighQualityStereo,
          });
          logLiveKitDebug("stream-manager", "screen-audio-published-success", {
            trackId: audioTrack.id,
          });
        } catch (err) {
          console.error("[LiveKitStreamManager] Screen audio publish failed:", err);
          logLiveKitDebug("stream-manager", "screen-audio-published-error", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        logLiveKitDebug("stream-manager", "screen-audio-not-found", {
          message: "No audio track in desiredScreenStream",
        });
      }
    } else {
      if (!participant.isScreenShareEnabled) {
        await participant.setScreenShareEnabled(true);
      }
    }
  }

  private handleDisconnected(reason?: DisconnectReason) {
    if (this.manualDisconnect || this.replacingRoom) return;
    // Unexpected drop: discard the dead room/handlers so the app-level reconnect
    // (performPostJoinSynchronization -> connect with a fresh token) can rebuild.
    this.teardownRoomState();
    this.callbacks.onConnectionStateChanged?.("disconnected");
  }

  // Lightweight teardown for an unexpected disconnect — releases the dead room
  // and remote media without the full manual-disconnect path (mic controller and
  // audio context stay alive for the imminent reconnect).
  private teardownRoomState(): void {
    this.currentLobbyId = null;
    this.stopAudioMonitoring();
    this.statsCollector?.stop();
    this.statsCollector = null;
    if (this.room) {
      try {
        this.room.removeAllListeners();
      } catch {
        // no-op
      }
      this.room = null;
    }
    this.roomEventManager = null;
    if (this.remoteMediaHandler) {
      this.remoteMediaHandler.dispose();
      this.remoteMediaHandler = null;
    }
    this.mediaMap = {};
    this.streamCache.clear();
    void this.updateLocalAudioSource(null);
    this.callbacks.onRemoteStreamsChanged?.({});
  }

  // Reuses the previous per-participant object whenever nothing about that
  // participant changed, and skips the callback entirely when nothing changed
  // at all. Without this every sample produced a fresh object graph and React
  // re-rendered every tile, which is what made the old 60fps loop so expensive.
  private updateMediaMap(): void {
    if (!this.room) return;

    const previous = this.mediaMap;
    const nextMap: ParticipantMediaMap = {};
    const participants = [
      this.room.localParticipant,
      ...Array.from(this.room.remoteParticipants.values()),
    ];

    let changed = participants.length !== Object.keys(previous).length;

    for (const participant of participants) {
      const built = this.buildParticipantMediaState(participant);
      const existing = previous[participant.identity];

      if (existing && isSameParticipantMediaState(existing, built)) {
        nextMap[participant.identity] = existing;
        continue;
      }

      nextMap[participant.identity] = built;
      changed = true;
    }

    this.mediaMap = nextMap;
    if (changed) {
      this.callbacks.onRemoteStreamsChanged?.(nextMap);
    }
  }

  private buildParticipantMediaState(p: Participant): ParticipantMediaState {
    const cameraPub = p.getTrackPublication(Track.Source.Camera);
    const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
    
    // Use the track itself for 'camera' and 'screen' properties if available.
    // LiveKit Track objects have stable identities and .attach() methods,
    // which prevents flickering in React components.
    const cameraTrack = cameraPub?.track ?? null;
    const screenTrack = screenPub?.track ?? null;

    const cameraStream = this.getStreamFromPub(cameraPub);
    const screenStream = this.getStreamFromPub(screenPub);

    if (p instanceof LocalParticipant) {
      const micPub = p.getTrackPublication(Track.Source.Microphone);
      const micStream = this.getStreamFromPub(micPub);
      void this.updateLocalAudioSource(micStream);
    }

    return {
      participant: p,
      micEnabled: p.isMicrophoneEnabled,
      cameraEnabled: !!(cameraPub?.isSubscribed && !cameraPub?.isMuted) || (p instanceof LocalParticipant && p.isCameraEnabled),
      screenEnabled: !!(screenPub?.isSubscribed && !screenPub?.isMuted) || (p instanceof LocalParticipant && p.isScreenShareEnabled),
      isSpeaking: p.isSpeaking || (p instanceof LocalParticipant && this.isSpeakingLocal),
      audioLevel: p instanceof LocalParticipant ? Math.max(p.audioLevel, this.localAudioLevel) : p.audioLevel,
      camera: cameraTrack || cameraStream,
      screen: screenTrack || screenStream,
      cameraStream,
      screenStream,
    };
  }

  private getStreamFromPub(pub?: TrackPublication): MediaStream | null {
    const track = pub?.track;
    if (!track || !track.mediaStreamTrack) return null;

    const trackId = track.mediaStreamTrack.id;
    let stream = this.streamCache.get(trackId);
    
    if (!stream) {
      stream = new MediaStream([track.mediaStreamTrack]);
      this.streamCache.set(trackId, stream);
      
      // Cleanup when the underlying MediaStreamTrack ends
      const cleanup = () => {
        if (this.streamCache.get(trackId) === stream) {
          this.streamCache.delete(trackId);
        }
      };
      
      track.mediaStreamTrack.addEventListener("ended", cleanup, { once: true });
    }

    return stream;
  }

  public async unpublishCamera(): Promise<void> {
    await this.setCameraEnabled(false);
  }

  public async publishCameraStream(
    stream: MediaStream,
    quality: VideoPublishQuality | null = null,
  ): Promise<void> {
    await this.setCameraEnabled(true, stream, quality);
  }

  public async unpublishScreen(): Promise<void> {
    await this.setScreenEnabled(false);
  }

  public setRemoteParticipantAudioPreference(identity: string, pref: RemoteParticipantAudioPreference): void {
    if (this.remoteMediaHandler) {
      this.remoteMediaHandler.setParticipantVolume(identity, pref.volumePercent / 100);
      this.remoteMediaHandler.setParticipantMuted(identity, pref.muted);

      // Screen share audio controls
      if (pref.screenAudioMuted !== undefined) {
        this.remoteMediaHandler.setScreenAudioMuted(identity, pref.screenAudioMuted);
      }
      if (pref.screenAudioVolumePercent !== undefined) {
        this.remoteMediaHandler.setScreenAudioVolume(identity, pref.screenAudioVolumePercent);
      }
    }
  }

  public async publishScreenStream(
    stream: MediaStream,
    mode: ScreenShareMode = "slides",
    quality: VideoPublishQuality | null = null,
  ): Promise<void> {
    await this.setScreenEnabled(true, stream, mode, quality);
  }

  public async refreshMicrophoneProcessing(): Promise<void> {
    if (!this.room) return;
    await this.microphoneController.refreshMicrophoneProcessing({
      participant: this.room.localParticipant,
      preferences: this.buildMicrophonePreferences(),
      publishOptions: this.buildMicrophonePublishOptions(),
    });
  }

  public getParticipantMedia(): ParticipantMediaMap { return this.mediaMap; }
}

export class LiveKitMediaSession extends LiveKitStreamManager {}
