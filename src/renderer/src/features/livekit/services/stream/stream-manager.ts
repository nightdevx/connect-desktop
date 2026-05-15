import {
  Room,
  Track,
  VideoPreset,
  supportsVP9,
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
  private desiredMicEnabled = true;
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
  private localAudioLevel = 0;
  private isSpeakingLocal = false;
  private silenceTimeout: number | null = null;
  private lastCapturedStreamId: string | null = null;
  private readonly streamCache = new Map<string, MediaStream>();

  public constructor(
    private readonly callbacks: LiveKitStreamManagerCallbacks = {},
  ) {
    this.microphoneController = new LiveKitMicrophoneController(
      (msg) => this.callbacks.onWarning?.(msg),
      (mode) => this.callbacks.onNoiseSuppressionModeChanged?.(mode),
    );
    this.setupLocalAudioMonitoring();
  }

  private setupLocalAudioMonitoring() {
    const checkLevel = () => {
      if (this.localAnalyser) {
        const dataArray = new Uint8Array(this.localAnalyser.frequencyBinCount);
        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const newLevel = average / 128;
        
        const threshold = 0.015; // More sensitive threshold
        const isCurrentlyTalking = newLevel > threshold;
        
        // If talking, reset the silence timer and set level
        if (isCurrentlyTalking) {
          if (newLevel > this.localAudioLevel || !this.isSpeakingLocal) {
            this.localAudioLevel = newLevel;
            this.updateMediaMap();
          }
          this.isSpeakingLocal = true;
          if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
          }
        } else if (this.isSpeakingLocal && !this.silenceTimeout) {
          // If stopped talking, start a 500ms "hang time" before turning off the glow
          this.silenceTimeout = setTimeout(() => {
            this.isSpeakingLocal = false;
            this.localAudioLevel = 0;
            this.updateMediaMap();
            this.silenceTimeout = null;
          }, 500) as any;
        }
      }
      requestAnimationFrame(checkLevel);
    };
    requestAnimationFrame(checkLevel);
  }

  private async updateLocalAudioSource(stream: MediaStream | null) {
    if (!stream) {
      this.localAudioSource?.disconnect();
      this.localAudioSource = null;
      this.localAnalyser = null;
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
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localAudioSource = this.audioContext.createMediaStreamSource(stream);
      this.localAudioSource.connect(this.localAnalyser);
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
    if (this.room && this.currentLobbyId === lobbyId) return;

    if (this.room) {
      this.replacingRoom = true;
      await this.disconnect();
      this.replacingRoom = false;
    }

    this.currentLobbyId = lobbyId;
    this.manualDisconnect = false;
    this.reconnectAttempt = 0;

    const options: RoomOptions = {
      adaptiveStream: { pixelDensity: "screen" },
      dynacast: true,
      publishDefaults: {
        videoSimulcastLayers: [
          new VideoPreset(960, 540, 1_000_000, 30),
          new VideoPreset(480, 270, 400_000, 20),
        ],
        screenShareSimulcastLayers: [
          new VideoPreset(1920, 1080, 4_000_000, 30),
          new VideoPreset(1280, 720, 1_500_000, 30),
        ],
        videoCodec: supportsVP9() ? "vp9" : "vp8",
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

      // 3. Stabilization Delay before heavy operations (1500ms)
      // This ensures the audio jitter buffers are filled and the network is stable.
      setTimeout(async () => {
        if (!this.room) return;

        // 4. Gradual Video Subscription (Priority 2)
        for (const participant of this.room.remoteParticipants.values()) {
          for (const pub of participant.trackPublications.values()) {
            if (pub.kind === Track.Kind.Video) {
              void pub.setSubscribed(true);
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }

        this.microphoneController.prepareParticipantAudioContext(this.room.localParticipant);
        await this.restorePublishingState();
      }, 1500);

    } catch (error) {
      this.callbacks.onConnectionStateChanged?.("disconnected");
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    this.manualDisconnect = !this.replacingRoom;
    this.currentLobbyId = null;

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

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

  public async setCameraEnabled(enabled: boolean, stream: MediaStream | null = null): Promise<void> {
    this.desiredCameraEnabled = enabled;
    this.desiredCameraStream = stream;
    await this.applyCameraState();
  }

  public async setScreenEnabled(enabled: boolean, stream: MediaStream | null = null, mode: ScreenShareMode = "slides"): Promise<void> {
    this.desiredScreenEnabled = enabled;
    this.desiredScreenStream = stream;
    this.desiredScreenMode = mode;
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

    this.audioProcessingPreferences = { ...prefs };

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

      await participant.publishTrack(videoTrack, { 
        name: "camera", 
        source: Track.Source.Camera, 
        simulcast: true 
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
        (pub) => pub.source === Track.Source.ScreenShare
      );
      for (const pub of existingPubs) {
        if (pub.track) {
          await participant.unpublishTrack(pub.track);
        }
      }

      await participant.publishTrack(screenTrack, {
        name: "screen",
        source: Track.Source.ScreenShare,
      });
    } else {
      if (!participant.isScreenShareEnabled) {
        await participant.setScreenShareEnabled(true);
      }
    }
  }

  private handleDisconnected(reason?: DisconnectReason) {
    if (this.manualDisconnect || this.replacingRoom) return;
    this.callbacks.onConnectionStateChanged?.("disconnected");
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

  public async publishCameraStream(stream: MediaStream): Promise<void> {
    await this.setCameraEnabled(true, stream);
  }

  public async unpublishScreen(): Promise<void> {
    await this.setScreenEnabled(false);
  }

  public setRemoteParticipantAudioPreference(identity: string, pref: RemoteParticipantAudioPreference): void {
    if (this.remoteMediaHandler) {
      this.remoteMediaHandler.setParticipantVolume(identity, pref.volumePercent / 100);
      this.remoteMediaHandler.setParticipantMuted(identity, pref.muted);
    }
  }

  public async publishScreenStream(stream: MediaStream): Promise<void> {
    await this.setScreenEnabled(true, stream);
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
