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
import {
  DEFAULT_AUDIO_PROCESSING_PREFERENCES,
  isScreenSource as isScreenSourceKind,
} from "./constants";
import { RemoteMediaHandler } from "./remote-media-handler";
import { RoomEventManager } from "./room-event-manager";
import { MediaStatsCollector, type MediaStatsSnapshot } from "./stats-collector";
import { findQualityLimitation } from "@shared/media-stats";
import { scaleBitrateToResolution } from "@shared/video-layers";
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
    // screenAvailable was missing here. Because screen shares are opt-in,
    // starting one changes nothing else about the publisher from a viewer's
    // point of view: screenEnabled stays false (nobody has subscribed yet) and
    // screen/screenStream stay null (no track). So this comparator reported
    // "unchanged", updateMediaMap skipped the callback, and the viewer's React
    // state never learned that anyone had started broadcasting.
    left.screenAvailable === right.screenAvailable &&
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
  // Desired remote-audio state, owned by the manager rather than the
  // RemoteMediaHandler, which is discarded and rebuilt on every reconnect.
  private desiredDeafened = false;
  // Identities whose screen share this user has explicitly chosen to watch.
  //
  // Screen video is the single most expensive thing in the room, and it used to
  // be pushed to everyone the instant someone started sharing. Watching is
  // opt-in: nothing is subscribed until an identity is in here, and it survives
  // reconnects so a hiccup does not silently stop a stream you were watching.
  private readonly watchedScreenIdentities = new Set<string>();
  private readonly remoteAudioPreferences = new Map<string, RemoteParticipantAudioPreference>();
  // Single-flight guard for connect().
  private connectPromise: Promise<void> | null = null;
  private connectingLobbyId: string | null = null;

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
    // Single-flight. Without it, a second connect() landing while the first was
    // still awaiting room.connect() took the `if (this.room)` branch and ran
    // disconnect(), which nulls this.room — and the first call then resumed and
    // dereferenced it, throwing, emitting "disconnected" and scheduling yet
    // another reconnect. A self-sustaining failure loop.
    if (this.connectPromise && this.connectingLobbyId === lobbyId) {
      return this.connectPromise;
    }

    this.connectingLobbyId = lobbyId;
    this.connectPromise = this.connectInternal(url, token, lobbyId).finally(() => {
      this.connectPromise = null;
      this.connectingLobbyId = null;
    });

    return this.connectPromise;
  }

  private async connectInternal(
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

    // Hold the room in a local. `this.room` is mutable and read again after two
    // awaits below; a concurrent teardown would otherwise turn those reads into
    // a null dereference.
    const room = new Room(options);
    this.room = room;
    this.remoteMediaHandler = new RemoteMediaHandler(room);

    // Re-seed the handler with the user's actual preferences.
    //
    // connect() builds a brand-new RemoteMediaHandler on every reconnect, and
    // only the output device used to be re-applied — deafen, master volume and
    // every per-participant volume/mute reset to defaults. So a user who had
    // deafened, or dropped the master volume, or muted one loud participant,
    // silently got the whole room back at 100% one second after any socket
    // blip, with the UI still showing the old state. Ordered before
    // registerEvents so the first subscribe pass sees the right deafen flag.
    this.remoteMediaHandler.setMasterVolume(this.audioProcessingPreferences.masterVolume ?? 1);
    this.remoteMediaHandler.setDeafened(this.desiredDeafened);
    for (const [participantId, preference] of this.remoteAudioPreferences) {
      this.applyRemoteParticipantAudioPreference(participantId, preference);
    }

    this.roomEventManager = new RoomEventManager(
      room,
      this.callbacks,
      this.remoteMediaHandler,
      () => this.updateMediaMap(),
      (reason) => this.handleDisconnected(reason),
      () => this.restorePublishingState(),
      (identity) => this.watchedScreenIdentities.has(identity),
    );

    this.roomEventManager.registerEvents();
    this.startAudioMonitoring();

    this.limitedTicks = 0;
    this.limitationNotified = false;
    this.statsCollector = new MediaStatsCollector(room, (snapshot) => {
      this.callbacks.onMediaStats?.(snapshot);
      this.evaluateQualityLimitation(snapshot);
    });

    if (this.remoteMediaHandler && this.audioProcessingPreferences.selectedAudioOutputDeviceId) {
      void this.remoteMediaHandler.setAudioOutputDevice(this.audioProcessingPreferences.selectedAudioOutputDeviceId);
    }

    try {
      this.callbacks.onConnectionStateChanged?.("connecting");
      // autoSubscribe and connectTimeout are ConnectOptions
      await room.connect(url, token, {
        autoSubscribe: false,
      });

      // Another connect replaced this room while we were awaiting. Drop ours
      // rather than publishing into an abandoned room.
      if (this.room !== room) {
        await room.disconnect();
        return;
      }

      // Subscribe to what is already in the room BEFORE touching the
      // microphone. The two are independent — hearing the room does not depend
      // on publishing into it — and the mic path is the slow one: device
      // enumeration, getUserMedia, two audioWorklet.addModule() loads and a
      // WebAssembly compile for RNNoise. With `autoSubscribe: false` this call
      // is the only thing that subscribes to tracks already present, so putting
      // it after `await applyMicrophoneState()` meant whoever joined second sat
      // in silence for the whole length of their own microphone setup. In a 1:1
      // call that is always the person who answered.
      //
      // (Pacing is left to `dynacast` and `adaptiveStream`. This used to be a
      // hand-rolled ladder of setTimeouts — 200ms settle, 20ms between audio
      // tracks, a 1000ms pause, then 50ms between video tracks — which pushed
      // join to ~2.5s and raced against room teardown.)
      this.subscribeToExistingTracks();

      this.statsCollector?.start();

      // restorePublishingState starts with applyMicrophoneState, so the mic is
      // published here; it used to be called explicitly as well, which was a
      // second (idempotent, but still awaited) pass over the same work.
      this.microphoneController.prepareParticipantAudioContext(room.localParticipant);
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
    // Pin the room this call is tearing down, the same way connectInternal
    // does. `this.room` is read again after several awaits below, and callers
    // do not always await this method — leaveActiveLobby fires it and returns,
    // so answering a call right after leaving a lobby had connect() install a
    // new room while this teardown was still suspended. It would then resume,
    // disconnect the CALL's room, null it out, dispose its media handler and
    // report "disconnected": a call with no audio, recovered only by the
    // reconnect chain seconds later.
    const room = this.room;

    this.manualDisconnect = !this.replacingRoom;
    this.currentLobbyId = null;
    this.stopAudioMonitoring();
    this.statsCollector?.stop();
    this.statsCollector = null;

    // 1. Explicitly disable/mute and stop the microphone track and processor BEFORE disconnecting the room!
    if (room) {
      try {
        await this.microphoneController.applyMicrophoneState({
          enabled: false,
          participant: room.localParticipant,
          preferences: this.buildMicrophonePreferences(),
          publishOptions: this.buildMicrophonePublishOptions(),
        });
      } catch (err) {
        console.warn("[LiveKitStreamManager] Failed to mute mic before disconnect:", err);
      }
    }

    // Always close the room this call was asked to close, even if it is no
    // longer the current one — otherwise the old socket leaks.
    if (room) {
      await room.disconnect();
    }

    // Everything below is shared state (the local audio graph, the microphone
    // controller, the media map). If a newer room owns it now, leave it alone.
    if (this.room !== room) {
      return;
    }

    // 2. Cleanup local audio monitoring (AudioContext, source node, analyzer)
    await this.cleanupLocalAudioMonitoring();

    this.room = null;

    if (this.remoteMediaHandler) {
      this.remoteMediaHandler.dispose();
      this.remoteMediaHandler = null;
    }

    await this.microphoneController.dispose();
    this.mediaMap = {};
    this.streamCache.clear();
    this.callbacks.onRemoteStreamsChanged?.({});
    // Only when a room was actually torn down. The hook treats "disconnected"
    // with an active lobby as a dropped connection and schedules the rejoin
    // chain — every other deliberate teardown clears activeLobbyId first, but
    // the text-only branch of performPostJoinSynchronization cannot: the user
    // IS in that lobby. Announcing a no-op teardown there made the chain rejoin,
    // re-run the sync, disconnect again, and loop forever.
    if (room) {
      this.callbacks.onConnectionStateChanged?.("disconnected");
    }
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
    // Remember it here, not only in the handler: connect() throws the handler
    // away and builds a new one on every reconnect.
    this.desiredDeafened = deafened;
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
        if (isScreenSourceKind(publication.source)) {
          // Restores whatever the user had chosen to watch before the
          // reconnect, rather than resubscribing everyone by default.
          void publication.setSubscribed(
            this.watchedScreenIdentities.has(participant.identity),
          );
          continue;
        }
        void publication.setSubscribed(true);
      }
    }
  }

  /** Reports whether this user is currently watching the given screen share. */
  public isWatchingScreen(identity: string): boolean {
    return this.watchedScreenIdentities.has(identity);
  }

  /**
   * Starts or stops watching one participant's screen share.
   *
   * Subscribing pulls the video (and its system audio, if any); unsubscribing
   * stops the bytes at the SFU, so declining to watch actually costs nothing
   * rather than merely hiding a stream that is still being delivered.
   */
  public setScreenSubscription(identity: string, watch: boolean): void {
    const normalized = identity.trim();
    if (!normalized) {
      return;
    }

    if (watch) {
      this.watchedScreenIdentities.add(normalized);
    } else {
      this.watchedScreenIdentities.delete(normalized);
    }

    const participant = this.room?.remoteParticipants.get(normalized);
    if (participant) {
      for (const publication of participant.trackPublications.values()) {
        if (!isScreenSourceKind(publication.source)) {
          continue;
        }
        void publication.setSubscribed(watch);
      }
    }

    this.updateMediaMap();
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

    const width = settings.width ?? quality?.width ?? fallback.width;
    const height = settings.height ?? quality?.height ?? fallback.height;

    const presetWidth = quality?.width ?? fallback.width;
    const presetHeight = quality?.height ?? fallback.height;
    const presetBitrateBps = quality?.maxBitrateBps ?? fallback.maxBitrateBps;

    // The dimensions already came from the track; the bitrate has to follow it
    // down or a 1080p monitor shared under the 2160p preset publishes 1080p at
    // a 2160p ceiling.
    const maxBitrateBps = scaleBitrateToResolution({
      presetBitrateBps,
      presetWidth,
      presetHeight,
      actualWidth: width,
      actualHeight: height,
    });

    return {
      width,
      height,
      maxFramerate:
        quality?.maxFramerate ??
        Math.round(settings.frameRate ?? fallback.maxFramerate),
      maxBitrateBps,
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

    // "Available" is publication state; "enabled" is subscription state. For
    // the local participant the two coincide — you always see your own share.
    const screenAvailable =
      !!(screenPub && !screenPub.isMuted) ||
      (p instanceof LocalParticipant && p.isScreenShareEnabled);

    return {
      participant: p,
      micEnabled: p.isMicrophoneEnabled,
      cameraEnabled: !!(cameraPub?.isSubscribed && !cameraPub?.isMuted) || (p instanceof LocalParticipant && p.isCameraEnabled),
      screenEnabled: !!(screenPub?.isSubscribed && !screenPub?.isMuted) || (p instanceof LocalParticipant && p.isScreenShareEnabled),
      screenAvailable,
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
    // Remember it, so a reconnect can re-apply it to the fresh handler.
    this.remoteAudioPreferences.set(identity, pref);
    this.applyRemoteParticipantAudioPreference(identity, pref);
  }

  private applyRemoteParticipantAudioPreference(
    identity: string,
    pref: RemoteParticipantAudioPreference,
  ): void {
    if (!this.remoteMediaHandler) {
      return;
    }

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
