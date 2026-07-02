import {
  Room,
  Track,
  VideoPreset,
  supportsVP9,
  ConnectionState,
  DisconnectReason,
  LocalParticipant,
  type Participant,
  type RoomOptions,
  type TrackPublication,
} from "livekit-client";
import { logLiveKitDebug } from "../debug-log";
import { LiveKitMicrophoneController } from "../mic";
import {
  type LiveKitStreamManagerCallbacks,
  type ParticipantMediaMap,
  type ParticipantMediaState,
  type ScreenShareMode,
  type QualityProfile,
  type VideoPublishQuality,
  type LiveKitAudioProcessingPreferences,
  type RemoteParticipantAudioPreference,
} from "./types";
import { HIGH_PROFILE, DEFAULT_AUDIO_PROCESSING_PREFERENCES } from "./constants";
import { RemoteMediaHandler } from "./remote-media-handler";
import { RoomEventManager } from "./room-event-manager";

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

  private currentProfile: QualityProfile = HIGH_PROFILE;
  private lowLatencyMode = true;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private manualDisconnect = false;
  private replacingRoom = false;

  private remoteMediaHandler: RemoteMediaHandler | null = null;
  private roomEventManager: RoomEventManager | null = null;
  private readonly microphoneController: LiveKitMicrophoneController;

  private audioContext: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localAudioSource: MediaStreamAudioSourceNode | null = null;
  private micGainNode: GainNode | null = null;
  private localAudioLevel = 0;
  private isSpeakingLocal = false;
  private silenceTimeout: number | null = null;
  private lastCapturedStreamId: string | null = null;
  private readonly streamCache = new Map<string, MediaStream>();

  private monitoringActive = false;
  private analyserBuffer: Uint8Array<ArrayBuffer> | null = null;

  public constructor(
    private readonly callbacks: LiveKitStreamManagerCallbacks = {},
  ) {
    this.microphoneController = new LiveKitMicrophoneController(
      (msg) => this.callbacks.onWarning?.(msg),
      (mode) => this.callbacks.onNoiseSuppressionModeChanged?.(mode),
    );
  }

  // Audio-level monitoring only runs while connected to a room. Previously this
  // rAF loop started in the constructor and spun ~60fps forever (even idle),
  // burning CPU/battery; now connect() starts it and disconnect/teardown stops it.
  private startAudioMonitoring() {
    if (this.monitoringActive) return;
    this.monitoringActive = true;

    const checkLevel = () => {
      if (!this.monitoringActive) return;

      let needsUpdate = false;

      // 1. Check local audio
      if (this.localAnalyser) {
        const binCount = this.localAnalyser.frequencyBinCount;
        if (!this.analyserBuffer || this.analyserBuffer.length !== binCount) {
          this.analyserBuffer = new Uint8Array(new ArrayBuffer(binCount));
        }
        const dataArray = this.analyserBuffer;
        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const newLevel = average / 128;
        
        const threshold = 0.015;
        const isCurrentlyTalking = newLevel > threshold;
        
        if (isCurrentlyTalking) {
          if (newLevel > this.localAudioLevel || !this.isSpeakingLocal) {
            this.localAudioLevel = newLevel;
            needsUpdate = true;
          }
          this.isSpeakingLocal = true;
          if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
          }
        } else if (this.isSpeakingLocal && !this.silenceTimeout) {
          this.silenceTimeout = setTimeout(() => {
            this.isSpeakingLocal = false;
            this.localAudioLevel = 0;
            this.updateMediaMap();
            this.silenceTimeout = null;
          }, 500) as any;
        }
      }

      // 2. Check remote participants' isSpeaking state changes
      if (this.room) {
        for (const p of this.room.remoteParticipants.values()) {
          const currentState = this.mediaMap[p.identity];
          // If the LiveKit participant.isSpeaking changed from what we have in state
          if (currentState && currentState.isSpeaking !== p.isSpeaking) {
            needsUpdate = true;
            break;
          }
          // Also detect significant audio level changes for visualization if needed
          if (currentState && Math.abs(currentState.audioLevel - p.audioLevel) > 0.05) {
             needsUpdate = true;
             break;
          }
        }
      }

      if (needsUpdate) {
        this.updateMediaMap();
      }

      requestAnimationFrame(checkLevel);
    };
    requestAnimationFrame(checkLevel);
  }

  private stopAudioMonitoring(): void {
    this.monitoringActive = false;
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    this.isSpeakingLocal = false;
    this.localAudioLevel = 0;
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
    this.reconnectAttempt = 0;

    const useVP9 = supportsVP9();
    const options: RoomOptions = {
      adaptiveStream: { pixelDensity: "screen" },
      dynacast: true,
      publishDefaults: {
        // Fallback camera layers only; the real encoding is supplied per-publish
        // in applyCameraState/applyScreenState from the user-selected quality.
        videoSimulcastLayers: [
          new VideoPreset(1280, 720, 1_700_000, 30),
          new VideoPreset(640, 360, 500_000, 20),
        ],
        videoCodec: useVP9 ? "vp9" : "vp8",
        // VP9/AV1 aren't universally decodable; publish a VP8 backup so every
        // subscriber gets a stream (LiveKit picks per-subscriber).
        backupCodec: useVP9 ? true : undefined,
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

    if (this.remoteMediaHandler && this.audioProcessingPreferences.selectedAudioOutputDeviceId) {
      void this.remoteMediaHandler.setAudioOutputDevice(this.audioProcessingPreferences.selectedAudioOutputDeviceId);
    }

    try {
      this.callbacks.onConnectionStateChanged?.("connecting");
      // autoSubscribe and connectTimeout are ConnectOptions
      await this.room.connect(url, token, { 
        autoSubscribe: false,
      });
      
      // Professional Stabilization Strategy:
      // 1. Post-Connect Breathing Room (200ms)
      // Allows the ICE connection and DTLS handshake to fully stabilize before flooding the pipe.
      await new Promise(resolve => setTimeout(resolve, 200));

      // 2. Staggered Audio Subscription (Priority 1)
      // Subscribing to all audio at once can spike signaling. We stagger them slightly.
      const remoteParticipants = Array.from(this.room.remoteParticipants.values());
      for (const participant of remoteParticipants) {
        for (const pub of participant.trackPublications.values()) {
          if (pub.kind === Track.Kind.Audio) {
            void pub.setSubscribed(true);
            // Micro-delay between subscriptions to prevent signaling congestion
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        }
      }

      // 3. Publish the local mic immediately (Priority 1, low bandwidth) so the
      // user can be heard within ~200ms of join instead of waiting for the heavy
      // video stabilization window below.
      this.microphoneController.prepareParticipantAudioContext(this.room.localParticipant);
      await this.applyMicrophoneState();

      // 4. Stabilization Delay before heavy operations.
      // Lets audio jitter buffers fill before flooding the pipe with video.
      setTimeout(async () => {
        if (!this.room) return;

        // 5. Gradual Video Subscription (Priority 2)
        for (const participant of this.room.remoteParticipants.values()) {
          for (const pub of participant.trackPublications.values()) {
            if (pub.kind === Track.Kind.Video) {
              void pub.setSubscribed(true);
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }

        // Restore camera/screen publishing (mic already applied above; this
        // re-applies it idempotently and brings up the heavy video tracks).
        await this.restorePublishingState();
      }, 1000);

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

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 1. Explicitly disable/mute and stop the microphone track and processor BEFORE disconnecting the room!
    if (this.room) {
      try {
        await this.microphoneController.applyMicrophoneState({
          enabled: false,
          participant: this.room.localParticipant,
          preferences: {
            enhancedNoiseSuppressionEnabled: this.audioProcessingPreferences.enhancedNoiseSuppressionEnabled,
            noiseSuppressionPreset: this.audioProcessingPreferences.noiseSuppressionPreset,
            selectedAudioInputDeviceId: this.audioProcessingPreferences.selectedAudioInputDeviceId,
          },
          publishOptions: { dtx: true, red: true },
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

    // Apply microphone volume via gain node
    if (micVolumeChanged && this.micGainNode) {
      this.micGainNode.gain.value = Math.max(0, prefs.microphoneVolume) / 100;
    }

    if (changed && this.room?.localParticipant.isMicrophoneEnabled) {
      await this.microphoneController.refreshMicrophoneProcessing({
        participant: this.room.localParticipant,
        preferences: {
          enhancedNoiseSuppressionEnabled: prefs.enhancedNoiseSuppressionEnabled,
          noiseSuppressionPreset: prefs.noiseSuppressionPreset,
          selectedAudioInputDeviceId: prefs.selectedAudioInputDeviceId,
        },
        publishOptions: { dtx: true, red: true },
      });
    }

    if (this.remoteMediaHandler) {
      void this.remoteMediaHandler.setAudioOutputDevice(
        prefs.selectedAudioOutputDeviceId,
      );
    }
  }

  private async restorePublishingState(): Promise<void> {
    // 1. Prioritize Audio: Highest priority for communication, lowest bandwidth.
    await this.applyMicrophoneState();
    
    // 2. Brief stabilization delay before starting heavy video tracks.
    if (this.desiredCameraEnabled || this.desiredScreenEnabled) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 3. Camera: Only if explicitly enabled.
    if (this.desiredCameraEnabled) {
      await this.applyCameraState();
      // Wait for camera to stabilize before screen share if both are enabled.
      if (this.desiredScreenEnabled) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // 4. Screen Share: Highest bandwidth, lowest priority during initial join.
    if (this.desiredScreenEnabled) {
      await this.applyScreenState();
    }
  }

  private async applyMicrophoneState(): Promise<void> {
    if (!this.room) return;
    await this.microphoneController.applyMicrophoneState({
      enabled: this.desiredMicEnabled,
      participant: this.room.localParticipant,
      preferences: {
        enhancedNoiseSuppressionEnabled: this.audioProcessingPreferences.enhancedNoiseSuppressionEnabled,
        noiseSuppressionPreset: this.audioProcessingPreferences.noiseSuppressionPreset,
        selectedAudioInputDeviceId: this.audioProcessingPreferences.selectedAudioInputDeviceId,
      },
      publishOptions: { dtx: true, red: true },
    });
  }

  private async applyCameraState(): Promise<void> {
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

      const cameraQuality = this.desiredCameraQuality;
      logLiveKitDebug("stream-manager", "publish-camera", {
        contentHint: videoTrack.contentHint,
        maxBitrateBps: cameraQuality?.maxBitrateBps ?? "default",
        maxFramerate: cameraQuality?.maxFramerate ?? "default",
        degradationPreference: "maintain-framerate",
      });
      await participant.publishTrack(videoTrack, {
        name: "camera",
        source: Track.Source.Camera,
        simulcast: true,
        degradationPreference: "maintain-framerate",
        ...(cameraQuality
          ? {
              videoEncoding: {
                maxBitrate: cameraQuality.maxBitrateBps,
                maxFramerate: cameraQuality.maxFramerate,
              },
            }
          : {}),
      });
    } else {
      if (!participant.isCameraEnabled) {
        await participant.setCameraEnabled(true);
      }
    }
  }

  private async applyScreenState(): Promise<void> {
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
      const isMotion = this.desiredScreenMode === "motion";
      try {
        screenTrack.contentHint = isMotion ? "motion" : "detail";
      } catch {
        // no-op
      }

      const screenQuality = this.desiredScreenQuality;
      logLiveKitDebug("stream-manager", "publish-screen", {
        mode: this.desiredScreenMode,
        contentHint: screenTrack.contentHint,
        maxBitrateBps: screenQuality?.maxBitrateBps ?? "default",
        maxFramerate: screenQuality?.maxFramerate ?? "default",
        degradationPreference: isMotion ? "maintain-framerate" : "maintain-resolution",
      });
      await participant.publishTrack(screenTrack, {
        name: "screen",
        source: Track.Source.ScreenShare,
        // Single high-quality layer so the selected resolution/bitrate is honored
        // instead of being capped by the fixed simulcast defaults.
        simulcast: false,
        degradationPreference: isMotion ? "maintain-framerate" : "maintain-resolution",
        ...(screenQuality
          ? {
              videoEncoding: {
                maxBitrate: screenQuality.maxBitrateBps,
                maxFramerate: screenQuality.maxFramerate,
              },
            }
          : {}),
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
          await participant.publishTrack(audioTrack, {
            name: "screen_audio",
            source: Track.Source.ScreenShareAudio,
            dtx: false,
            red: true,
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

  private updateMediaMap(): void {
    if (!this.room) return;
    const nextMap: ParticipantMediaMap = {};
    const participants = [this.room.localParticipant, ...Array.from(this.room.remoteParticipants.values())];
    participants.forEach((p) => {
      nextMap[p.identity] = this.buildParticipantMediaState(p);
    });
    this.mediaMap = nextMap;
    this.callbacks.onRemoteStreamsChanged?.(nextMap);
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
      preferences: {
        enhancedNoiseSuppressionEnabled: this.audioProcessingPreferences.enhancedNoiseSuppressionEnabled,
        noiseSuppressionPreset: this.audioProcessingPreferences.noiseSuppressionPreset,
        selectedAudioInputDeviceId: this.audioProcessingPreferences.selectedAudioInputDeviceId,
      },
      publishOptions: { dtx: true, red: true },
    });
  }

  public getParticipantMedia(): ParticipantMediaMap { return this.mediaMap; }
}

export class LiveKitMediaSession extends LiveKitStreamManager {}
