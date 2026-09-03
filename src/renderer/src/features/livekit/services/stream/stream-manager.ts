import {
  Room,
  Track,
  ConnectionState,
  DisconnectReason,
  LocalParticipant,
  type LocalTrackPublication,
  type Participant,
  type RoomOptions,
  type TrackPublication,
  type TrackPublishOptions,
  type VideoCodec,
} from "livekit-client";
import { logLiveKitDebug } from "@/services/debug-log";
import { mediaDiagnostics } from "@/services/media-diagnostics";
import { LiveKitMicrophoneController } from "../mic";
import type { MicrophoneProcessingPreferences } from "../mic/types";
import {
  type LiveKitStreamManagerCallbacks,
  type ParticipantMediaMap,
  type ParticipantMediaState,
  type ScreenShareMode,
  type VideoPublishQuality,
  type LiveKitAudioProcessingPreferences,
  type PausedTrackKind,
  type RemoteParticipantAudioPreference,
  pausedTrackKey,
} from "./types";
import {
  DEFAULT_AUDIO_PROCESSING_PREFERENCES,
  isScreenSource as isScreenSourceKind,
  shouldSubscribePublication,
} from "./constants";
import {
  NOT_SPEAKING,
  advanceSpeaking,
  readRmsLevel,
  type SpeakingTrack,
} from "./speaking";
import {
  buildWatcherMap,
  decodeWatchState,
  encodeWatchState,
  watcherMapsEqual,
  type ScreenWatcherMap,
} from "./screen-watchers";
import { RemoteMediaHandler } from "./remote-media-handler";
import { RoomEventManager } from "./room-event-manager";
import { MediaStatsCollector, type MediaStatsSnapshot } from "./stats-collector";
import { findQualityLimitation } from "@shared/media-stats";
import {
  describeEncodingMismatch,
  scaleBitrateToResolution,
} from "@shared/video-layers";
import {
  DEFAULT_VIDEO_PUBLISH_PREFERENCES,
  buildVideoPublishPlan,
  resolveCodecTarget,
  resolveHardwareSvcCodec,
  resolveVideoCodec,
  type VideoContentMode,
  type VideoPublishPlan,
  type VideoPublishPreferences,
  type VideoPublishTarget,
} from "./video-profiles";

const AUDIO_LEVEL_SAMPLE_INTERVAL_MS = 100;
// How long leaving a room may wait for the microphone to be muted politely.
// The mute is queued behind every other microphone operation, so without a
// ceiling a slow one held the leave open with the user still audible.
const DISCONNECT_MIC_MUTE_BUDGET_MS = 300;
// Stats tick once a second; only warn after the limitation has persisted, so a
// momentary spike while a share starts up does not fire a scary message.
// Stats ticks, not seconds. Halved when the sampling interval doubled, so the
// warning still needs about eight seconds of sustained limiting behind it.
const QUALITY_LIMITATION_TICKS = 4;

const MICROPHONE_BITRATE_BPS = 64_000;

const SCREEN_AUDIO_PUBLISH_OPTIONS: TrackPublishOptions = {
  name: "screen_audio",
  source: Track.Source.ScreenShareAudio,
  dtx: false,
  red: false,
  forceStereo: true,
  audioPreset: { maxBitrate: 96_000 },
};

const SOFTWARE_SVC_TICKS = 2;

// A publication that exists and is not muted. Covers a self-mute and a
// moderator's force-mute identically, which is what we want: either way nothing
// is on the wire, so nobody can be speaking.
const isMicrophoneLive = (participant: Participant): boolean => {
  const publication = participant.getTrackPublication(Track.Source.Microphone);
  return !!publication && !publication.isMuted;
};

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
    left.camera === right.camera &&
    left.screen === right.screen &&
    left.cameraStream === right.cameraStream &&
    left.screenStream === right.screenStream
  );
};

export class LiveKitMediaSession {
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
  // Until when a disconnect is expected because the app is changing rooms on
  // somebody else's instruction. See expectRoomChange.
  private roomChangeExpectedUntil = 0;
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
  // What everyone ELSE says they are watching, keyed by their identity.
  // Replaced wholesale per sender; see ./screen-watchers.ts for why the wire
  // format is whole state rather than deltas.
  private readonly watchStateByViewer = new Map<string, string[]>();
  // Last audience reported upward, so a re-announcement that changed nothing
  // does not re-render every tile in the room.
  private lastEmittedWatchers: ScreenWatcherMap = {};
  private readonly remoteAudioPreferences = new Map<string, RemoteParticipantAudioPreference>();
  private readonly pausedTracks = new Set<string>();
  // Single-flight guard for connect().
  private connectPromise: Promise<void> | null = null;
  private connectingLobbyId: string | null = null;

  private remoteMediaHandler: RemoteMediaHandler | null = null;
  private roomEventManager: RoomEventManager | null = null;
  private statsCollector: MediaStatsCollector | null = null;
  private readonly microphoneController: LiveKitMicrophoneController;

  private localAnalyser: AnalyserNode | null = null;
  private localAudioSource: MediaStreamAudioSourceNode | null = null;
  // Resolved speaking state per LiveKit identity — everyone in the room,
  // including the local participant. Owned here rather than derived in React so
  // there is exactly one answer to "is this person talking", arrived at the same
  // way for everybody. See ./speaking.ts for why that matters.
  private readonly speakingByIdentity = new Map<string, SpeakingTrack>();
  private lastCapturedStreamId: string | null = null;
  private readonly streamCache = new Map<string, MediaStream>();

  private monitorTimer: number | null = null;
  private analyserBuffer: Uint8Array<ArrayBuffer> | null = null;

  private limitedTicks = 0;
  private limitationNotified = false;
  private softwareSvcTicks = 0;
  private hardwareSvcCodec: VideoCodec | null = null;
  private hardwareSvcProbe: Promise<void> | null = null;
  private screenCodecFallback: VideoCodec | null = null;
  private codecFallbackInFlight = false;
  private encoderOverloadHandler:
    | ((reason: "cpu" | "bandwidth") => void)
    | null = null;
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
      this.sampleSpeakingState();
    }, AUDIO_LEVEL_SAMPLE_INTERVAL_MS);
  }

  private stopAudioMonitoring(): void {
    if (this.monitorTimer !== null) {
      window.clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    this.speakingByIdentity.clear();
  }

  private readLocalAudioLevel(): number | null {
    if (!this.localAnalyser) {
      return null;
    }

    const sampleCount = this.localAnalyser.fftSize;
    if (!this.analyserBuffer || this.analyserBuffer.length !== sampleCount) {
      this.analyserBuffer = new Uint8Array(new ArrayBuffer(sampleCount));
    }

    return readRmsLevel(this.localAnalyser, this.analyserBuffer);
  }

  /**
   * This person's voice level, or null when we are not receiving it.
   *
   * The local participant is measured off the capture graph; everyone else off
   * the playback bus they are already being decoded into. Both are the real
   * waveform, so both answer the same question with the same accuracy — which is
   * the point, and used not to be true.
   */
  private readSpeechLevel(participant: Participant): number | null {
    if (participant === this.room?.localParticipant) {
      return this.readLocalAudioLevel();
    }
    return this.remoteMediaHandler?.readMicLevel(participant.identity) ?? null;
  }

  // One tick of the speaking state machine for every participant, and a media-map
  // update only when somebody's answer actually flipped.
  //
  // This is the only writer of isSpeaking. It used to be split: the local ring
  // came from an analyser here, and remote rings were derived in React from the
  // server's active-speaker list, with a second hold timer of their own. Two
  // signals, two smoothing constants, two sets of edge cases — and the remote one
  // was the coarse estimate, which is why other people's rings were the ones that
  // came and went.
  private sampleSpeakingState(): void {
    const room = this.room;
    if (!room) return;

    let changed = false;
    const present = new Set<string>();

    const participants: Participant[] = [
      room.localParticipant,
      ...Array.from(room.remoteParticipants.values()),
    ];

    for (const participant of participants) {
      const identity = participant.identity;
      present.add(identity);

      const previous = this.speakingByIdentity.get(identity) ?? NOT_SPEAKING;
      const next = advanceSpeaking(previous, {
        level: this.readSpeechLevel(participant),
        serverSpeaking: participant.isSpeaking,
        micLive: isMicrophoneLive(participant),
      });

      if (next.speaking !== previous.speaking) {
        changed = true;
      }

      if (next.speaking) {
        this.speakingByIdentity.set(identity, next);
      } else {
        this.speakingByIdentity.delete(identity);
      }
    }

    // Somebody who left mid-word would otherwise keep their entry forever, and
    // an identity that reconnects inherits it.
    for (const identity of Array.from(this.speakingByIdentity.keys())) {
      if (!present.has(identity)) {
        this.speakingByIdentity.delete(identity);
        changed = true;
      }
    }

    if (changed) {
      this.emitSpeakingIdentities();
    }
  }

  private emitSpeakingIdentities(): void {
    this.callbacks.onSpeakingChanged?.(
      Array.from(this.speakingByIdentity.keys()).sort(),
    );
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
      const context = this.microphoneController.getOrCreateAudioContext();
      if (!context || context.state === "closed") {
        return;
      }

      if (context.state === "suspended") {
        await context.resume();
      }

      this.localAudioSource?.disconnect();

      this.localAnalyser = context.createAnalyser();
      this.localAnalyser.fftSize = 256;

      // Straight into the analyser, with no gain node in between. The stream fed
      // here is the PUBLISHED track, which has already had the processor's gain
      // applied — multiplying by microphoneVolume a second time made the meter
      // read gain squared against the fixed speaking thresholds, so at 50% mic
      // volume your own speaking ring stayed dark while everyone else saw you
      // talking. That asymmetry is exactly what the speaking gate exists to
      // remove.
      this.localAudioSource = context.createMediaStreamSource(stream);
      this.localAudioSource.connect(this.localAnalyser);
      this.lastCapturedStreamId = stream.id;
    } catch (err) {
      console.warn("[LiveKitMediaSession] Failed to setup local audio analysis:", err);
    }
  }

  public async connect(
    url: string,
    token: string,
    lobbyId: string,
    iceServers?: RTCIceServer[],
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
    this.connectPromise = this.connectInternal(
      url,
      token,
      lobbyId,
      iceServers,
    ).finally(() => {
      this.connectPromise = null;
      this.connectingLobbyId = null;
    });

    return this.connectPromise;
  }

  private async connectInternal(
    url: string,
    token: string,
    lobbyId: string,
    iceServers?: RTCIceServer[],
  ): Promise<void> {
    // Idempotent when the existing room for this lobby is alive — and
    // Reconnecting counts as alive.
    //
    // Only Connected used to count, which meant an app-level rejoin arriving
    // during livekit-client's own resume tore down a session that was about to
    // come back. That is not hypothetical: the lobby websocket and the media
    // transport are different connections, but nearly every real network event
    // hits both, so a `stream-status: closed` escalated into a full re-join at
    // exactly the moment the Room was in Reconnecting. The rebuild then joined
    // with the same LiveKit identity while the SFU still held the previous
    // participant for its 20s departure_timeout, so the server evicted the
    // session we had just left behind — and that eviction arrived as another
    // Disconnected, which scheduled another rejoin.
    if (
      this.room &&
      this.currentLobbyId === lobbyId &&
      (this.room.state === ConnectionState.Connected ||
        this.room.state === ConnectionState.Reconnecting)
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

    if (mediaDiagnostics.isActive()) {
      mediaDiagnostics.record("session", "room-reconnected", { lobbyId });
    } else {
      mediaDiagnostics.startSession(lobbyId, {
        hardwareSvcCodec: this.hardwareSvcCodec,
        prefs: this.buildDiagnosticsPrefs(),
      });
    }

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
        // Muting must not close the microphone. Push-to-talk drives this path on
        // every key press and release, and stopping the track meant each unmute
        // re-ran getUserMedia, rebuilt the AudioContext graph, re-registered two
        // audioWorklets and recompiled the RNNoise WASM — 200-600ms, which is the
        // first syllable of whatever the user was saying. The track is muted at
        // the sender either way, so nothing leaves the machine while it is off.
        stopMicTrackOnMute: false,
      },
    };

    // Hold the room in a local. `this.room` is mutable and read again after two
    // awaits below; a concurrent teardown would otherwise turn those reads into
    // a null dereference.
    const room = new Room(options);
    this.room = room;
    this.remoteMediaHandler = new RemoteMediaHandler(room, (identity) =>
      this.watchedScreenIdentities.has(identity),
    );

    // Re-seed the handler with the user's actual preferences.
    //
    // connect() builds a brand-new RemoteMediaHandler on every reconnect, and
    // only the output device used to be re-applied — deafen, master volume and
    // every per-participant volume/mute reset to defaults. So a user who had
    // deafened, or dropped the master volume, or muted one loud participant,
    // silently got the whole room back at 100% one second after any socket
    // blip, with the UI still showing the old state. Ordered before
    // registerEvents so the first subscribe pass sees the right deafen flag.
    this.remoteMediaHandler.setMasterVolume(
      this.audioProcessingPreferences.masterVolume ??
        DEFAULT_AUDIO_PROCESSING_PREFERENCES.masterVolume,
    );
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
      () => this.applyMicrophoneState(),
      (identity) => this.watchedScreenIdentities.has(identity),
      {
        onData: (payload, senderIdentity) =>
          this.handleWatchStateData(payload, senderIdentity),
        onPeerConnected: () => this.publishWatchState(),
        onPeerDisconnected: (identity) => {
          if (this.watchStateByViewer.delete(identity)) {
            this.emitScreenWatchers();
          }
        },
      },
      (identity, source, paused) =>
        this.handleTrackStreamState(identity, source, paused),
    );

    this.roomEventManager.registerEvents();
    this.startAudioMonitoring();

    this.limitedTicks = 0;
    this.limitationNotified = false;
    this.softwareSvcTicks = 0;
    this.statsCollector = new MediaStatsCollector(room, (snapshot) => {
      this.callbacks.onMediaStats?.(snapshot);
      mediaDiagnostics.recordStats(snapshot);
      this.evaluateQualityLimitation(snapshot);
      this.evaluateScreenEncoderCodec(snapshot);
    });

    if (this.remoteMediaHandler && this.audioProcessingPreferences.selectedAudioOutputDeviceId) {
      void this.remoteMediaHandler.setAudioOutputDevice(this.audioProcessingPreferences.selectedAudioOutputDeviceId);
    }

    try {
      this.callbacks.onConnectionStateChanged?.("connecting");
      // autoSubscribe and connectTimeout are ConnectOptions
      await room.connect(url, token, {
        autoSubscribe: false,
        ...(iceServers && iceServers.length > 0
          ? { rtcConfig: { iceServers } }
          : {}),
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

      // Nobody in the room gets a ParticipantConnected for themselves, so
      // this is the one announcement that has to come from this side. It
      // matters on a reconnect, where the watch set survived the drop and the
      // people still in the room have long since forgotten about it.
      this.publishWatchState();
      this.emitScreenWatchers();

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
    // Watching is per-visit, and this set outlives the room: the session object
    // is created once per app mount and reused for every lobby and call after
    // it. The renderer's mirror of it is cleared on every room change, so a
    // leftover identity here was invisible — the roster showed "Yayını İzle"
    // while subscribeToExistingTracks had already resubscribed that person's
    // share on the next join, and its audio played into a stream nobody had
    // opened. Only this deliberate teardown clears it; an unexpected drop goes
    // through teardownRoomState, which keeps it so a reconnect can restore what
    // the user was actually watching.
    this.watchedScreenIdentities.clear();
    this.watchStateByViewer.clear();
    this.lastEmittedWatchers = {};
    this.callbacks.onScreenWatchersChanged?.({});
    this.clearPausedTracks();
    this.stopAudioMonitoring();
    this.statsCollector?.stop();
    this.statsCollector = null;

    // 1. Mute the microphone before tearing the room down, so nothing is still
    // going out while the socket closes — but do not wait on it indefinitely.
    // This call joins the serialised microphone queue, so anything already in
    // that queue used to hold the whole leave with the user still audible and
    // still on the roster. microphoneController.dispose() below stops the track
    // regardless; this is politeness, not the mechanism.
    if (room) {
      const participant = room.localParticipant;
      try {
        await Promise.race([
          this.microphoneController.applyMicrophoneState({
            enabled: false,
            participant,
            preferences: this.buildMicrophonePreferences(),
            publishOptions: this.buildMicrophonePublishOptions(),
          }),
          new Promise<void>((resolve) =>
            setTimeout(resolve, DISCONNECT_MIC_MUTE_BUDGET_MS),
          ),
        ]);
      } catch (err) {
        console.warn("[LiveKitMediaSession] Failed to mute mic before disconnect:", err);
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

    // 2. Cleanup local audio monitoring (source node, analyser)
    await this.updateLocalAudioSource(null);

    this.room = null;

    if (this.remoteMediaHandler) {
      this.remoteMediaHandler.dispose();
      this.remoteMediaHandler = null;
    }

    // Not dispose(): that closes the AudioContext, and the worklet registration
    // cache is keyed on it, so every room switch paid for two addModule calls
    // and a WASM compile again. The session's own teardown still disposes.
    await this.microphoneController.releaseForRoomChange();
    this.mediaMap = {};
    this.streamCache.clear();
    this.callbacks.onRemoteStreamsChanged?.({});
    void mediaDiagnostics.endSession();

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

  /**
   * Prepare the microphone chain before there is a room to publish into.
   *
   * Called once when the session is created, so the first join does not pay for
   * the AudioContext, the worklet loads and the RNNoise compile on its critical
   * path. Safe to call repeatedly.
   */
  public warmUpMicrophoneChain(): Promise<void> {
    return this.microphoneController.warmUp(
      this.audioProcessingPreferences.enhancedNoiseSuppressionEnabled,
    );
  }

  public async setCameraEnabled(
    enabled: boolean,
    stream: MediaStream | null = null,
    quality: VideoPublishQuality | null = null,
  ): Promise<void> {
    this.desiredCameraEnabled = enabled;
    this.desiredCameraStream = stream;
    if (quality) this.desiredCameraQuality = quality;
    try {
      await this.applyCameraState();
    } catch (error) {
      // Same trap as replaceScreenStreamInternal, one level up: these fields
      // have to be written before applyCameraState because they are its input,
      // so a publish that rejects leaves them describing a capture the caller
      // is about to stop. restorePublishingState would then republish an ended
      // track. Only roll back if nothing newer has claimed the slot.
      if (enabled && this.desiredCameraStream === stream) {
        this.desiredCameraEnabled = false;
        this.desiredCameraStream = null;
      }
      throw error;
    }
  }

  public async setScreenEnabled(
    enabled: boolean,
    stream: MediaStream | null = null,
    mode: ScreenShareMode = "slides",
    quality: VideoPublishQuality | null = null,
  ): Promise<void> {
    if (!enabled || stream !== this.desiredScreenStream) {
      this.screenCodecFallback = null;
      this.softwareSvcTicks = 0;
    }
    this.desiredScreenEnabled = enabled;
    this.desiredScreenStream = stream;
    this.desiredScreenMode = mode;
    if (quality) this.desiredScreenQuality = quality;
    try {
      await this.applyScreenState();
    } catch (error) {
      // A failed publish is not a share: the caller stops the capture in its
      // catch, and leaving desiredScreenEnabled true with a stream whose tracks
      // are ended made the next reconnect republish a dead track.
      if (enabled && this.desiredScreenStream === stream) {
        this.desiredScreenEnabled = false;
        this.desiredScreenStream = null;
      }
      throw error;
    }
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
      // One gain stage, inside the microphone processor chain. The meter reads
      // the published track, so it already sees this change — applying it a
      // second time on the way to the analyser is what made the local level bar
      // and the local speaking gate disagree with every other client.
      this.microphoneController.setMicrophoneGain(prefs.microphoneVolume);
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
        // Screen shares restore whatever the user had chosen to watch before
        // the reconnect, rather than resubscribing everyone by default.
        void publication.setSubscribed(
          shouldSubscribePublication({
            kind: publication.kind,
            source: publication.source,
            deafened,
            watchingScreen: this.watchedScreenIdentities.has(
              participant.identity,
            ),
          }),
        );
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
    // Tell the room, then recompute locally. Both are needed: the publisher
    // learns about this viewer from the broadcast, and this viewer's own tile
    // has to count itself without waiting for its own packet to come back.
    this.publishWatchState();
    this.emitScreenWatchers();
  }

  /**
   * Announces the whole set of shares this client is watching.
   *
   * Reliable rather than lossy: this is state, not a sample, and a dropped
   * frame would leave somebody's audience wrong until the next toggle. Fired
   * on every change and once more whenever anybody joins, because the data
   * channel delivers nothing to a participant who was not there yet.
   */
  private publishWatchState(): void {
    const room = this.room;
    if (!room || room.state !== ConnectionState.Connected) {
      return;
    }

    void room.localParticipant
      .publishData(encodeWatchState(this.watchedScreenIdentities), {
        reliable: true,
      })
      .catch((error: unknown) => {
        // Not fatal and not worth a user-facing warning: the only casualty
        // is a viewer count that is one person short until the next change.
        logLiveKitDebug("stream-manager", "watch-state-publish-failed", {
          error: String(error),
        });
      });
  }

  /** A data frame from the room; anything that is not ours is ignored. */
  private handleWatchStateData(
    payload: Uint8Array,
    senderIdentity: string | undefined,
  ): void {
    if (!senderIdentity) {
      // Server-originated data has no participant. Nothing here sends any.
      return;
    }

    const targets = decodeWatchState(payload);
    if (targets === null) {
      return;
    }

    this.watchStateByViewer.set(senderIdentity, targets);
    this.emitScreenWatchers();
  }

  private handleTrackStreamState(
    identity: string,
    source: Track.Source,
    paused: boolean,
  ): void {
    let kind: PausedTrackKind;
    if (source === Track.Source.ScreenShare) {
      kind = "screen";
    } else if (source === Track.Source.Camera) {
      kind = "camera";
    } else {
      return;
    }

    const key = pausedTrackKey(identity, kind);
    if (paused === this.pausedTracks.has(key)) {
      return;
    }

    if (paused) {
      this.pausedTracks.add(key);
      logLiveKitDebug("stream-manager", "track-stream-paused", {
        identity,
        kind,
      });
    } else {
      this.pausedTracks.delete(key);
      logLiveKitDebug("stream-manager", "track-stream-resumed", {
        identity,
        kind,
      });
    }

    this.emitPausedTracks();
  }

  private emitPausedTracks(): void {
    const paused: Record<string, boolean> = {};
    for (const key of this.pausedTracks) {
      paused[key] = true;
    }
    this.callbacks.onPausedTracksChanged?.(paused);
  }

  private clearPausedTracks(): void {
    if (this.pausedTracks.size === 0) {
      return;
    }
    this.pausedTracks.clear();
    this.callbacks.onPausedTracksChanged?.({});
  }

  /** Recomputes the audiences and reports them if they moved. */
  private emitScreenWatchers(): void {
    const next = buildWatcherMap(
      this.watchStateByViewer,
      this.room?.localParticipant.identity ?? "",
      this.watchedScreenIdentities,
    );

    if (watcherMapsEqual(next, this.lastEmittedWatchers)) {
      return;
    }

    this.lastEmittedWatchers = next;
    this.callbacks.onScreenWatchersChanged?.(next);
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

    if (this.desiredScreenEnabled && this.encoderOverloadHandler) {
      this.encoderOverloadHandler(
        limitation.kind === "cpu" ? "cpu" : "bandwidth",
      );
      return;
    }

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

  private evaluateScreenEncoderCodec(snapshot: MediaStatsSnapshot): void {
    if (
      !this.desiredScreenEnabled ||
      this.screenCodecFallback ||
      this.codecFallbackInFlight
    ) {
      return;
    }

    const codec = this.resolveScreenCodec();
    if (codec !== "av1" && codec !== "vp9") {
      return;
    }

    const screen = snapshot.outbound.find(
      (entry) =>
        entry.kind === "video" &&
        entry.trackKey === `local:${Track.Source.ScreenShare}`,
    );

    if (!screen || screen.hardwareEncoder !== false) {
      this.softwareSvcTicks = 0;
      return;
    }

    this.softwareSvcTicks += 1;
    if (this.softwareSvcTicks < SOFTWARE_SVC_TICKS) {
      return;
    }

    this.softwareSvcTicks = 0;
    this.screenCodecFallback = this.resolvedVideoCodec;
    this.codecFallbackInFlight = true;

    logLiveKitDebug("stream-manager", "screen-codec-fallback", {
      from: codec,
      to: this.screenCodecFallback,
      implementation: screen.encoderImplementation,
    });
    this.callbacks.onWarning?.(
      "Donanım kodlayıcı bu video biçimini kullanamadı, yayın H.264'e geçiriliyor.",
    );

    void this.enqueueVideo(async () => {
      try {
        await this.unpublishScreenTracks();
        await this.applyScreenStateInternal();
      } catch (error) {
        logLiveKitDebug("stream-manager", "screen-codec-fallback-failed", {
          error,
        });
      } finally {
        this.codecFallbackInFlight = false;
      }
    });
  }

  public setEncoderOverloadHandler(
    handler: ((reason: "cpu" | "bandwidth") => void) | null,
  ): void {
    this.encoderOverloadHandler = handler;
  }

  public resetEncoderOverloadNotice(): void {
    this.limitedTicks = 0;
    this.limitationNotified = false;
  }

  private async unpublishScreenTracks(): Promise<void> {
    const participant = this.room?.localParticipant;
    if (!participant) {
      return;
    }
    const publications = Array.from(participant.trackPublications.values()).filter(
      (publication) =>
        publication.source === Track.Source.ScreenShare ||
        publication.source === Track.Source.ScreenShareAudio,
    );
    for (const publication of publications) {
      if (publication.track) {
        await participant.unpublishTrack(publication.track);
      }
    }
  }

  private resolveScreenCodec(): VideoCodec {
    if (
      this.videoPublishPreferences.codec !== "auto" ||
      !this.videoPublishPreferences.hardwareAcceleration
    ) {
      return this.resolvedVideoCodec;
    }

    return (
      this.screenCodecFallback ??
      this.hardwareSvcCodec ??
      this.resolvedVideoCodec
    );
  }

  public warmUpVideoEncoders(): Promise<void> {
    if (this.hardwareSvcProbe) {
      return this.hardwareSvcProbe;
    }

    this.hardwareSvcProbe = resolveHardwareSvcCodec()
      .then((codec) => {
        this.hardwareSvcCodec = codec;
        mediaDiagnostics.setClientContext({ hardwareSvcCodec: codec });
        logLiveKitDebug("stream-manager", "hardware-svc-probe", {
          codec: codec ?? "none",
        });
      })
      .catch(() => {
        this.hardwareSvcCodec = null;
      });

    return this.hardwareSvcProbe;
  }

  private buildMicrophonePreferences(
    source: LiveKitAudioProcessingPreferences = this.audioProcessingPreferences,
  ): MicrophoneProcessingPreferences {
    return {
      enhancedNoiseSuppressionEnabled: source.enhancedNoiseSuppressionEnabled,
      echoCancellationEnabled: source.echoCancellationEnabled,
      noiseSuppressionPreset: source.noiseSuppressionPreset,
      selectedAudioInputDeviceId: source.selectedAudioInputDeviceId,
      microphoneVolume: source.microphoneVolume,
    };
  }

  private buildDiagnosticsPrefs() {
    const audio = this.audioProcessingPreferences;
    return {
      videoCodec: this.videoPublishPreferences.codec,
      hardwareAcceleration: this.videoPublishPreferences.hardwareAcceleration,
      enhancedNoiseSuppression: audio.enhancedNoiseSuppressionEnabled,
      noiseSuppressionPreset: audio.noiseSuppressionPreset,
      echoCancellation: audio.echoCancellationEnabled,
      microphoneVolumePct: audio.microphoneVolume,
      masterVolumePct: audio.masterVolume,
    };
  }

  private buildMicrophonePublishOptions(): TrackPublishOptions {
    return {
      dtx: true,
      red: true,
      audioPreset: { maxBitrate: MICROPHONE_BITRATE_BPS },
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
   * Reads back what the browser is really encoding and complains if it does not
   * match what we asked for.
   *
   * The app computed a correct encoding target for a long time while LiveKit
   * quietly discarded it — a screen share published with `videoEncoding` had it
   * replaced by the library's `screenShareEncoding` default (1080p **15fps** at
   * 2.5 Mbps), and nothing anywhere noticed. `getParameters()` is the only place
   * where the option merge, the SDP and the browser have all had their say, so
   * it is the only honest check that publish options survived the trip.
   */
  private verifyPublishedEncodings(
    label: string,
    publication: LocalTrackPublication,
    target: VideoPublishTarget,
  ): void {
    const sender = publication.track?.sender;
    if (!sender) {
      return;
    }

    let encodings: RTCRtpEncodingParameters[];
    let negotiatedCodec: { mimeType: string; sdpFmtpLine?: string } | null =
      null;
    try {
      const parameters = sender.getParameters();
      encodings = parameters.encodings ?? [];
      const codec = parameters.codecs?.[0];
      negotiatedCodec = codec
        ? { mimeType: codec.mimeType, sdpFmtpLine: codec.sdpFmtpLine }
        : null;
    } catch {
      // Sender can be torn down between publish and readback.
      return;
    }

    const mismatch = describeEncodingMismatch(target, encodings);

    logLiveKitDebug("stream-manager", `publish-${label}-encodings`, {
      requested: {
        maxFramerate: target.maxFramerate,
        maxBitrate: target.maxBitrateBps,
      },
      negotiatedCodec,
      actual: encodings.map((encoding) => ({
        rid: encoding.rid ?? null,
        maxBitrate: encoding.maxBitrate ?? null,
        maxFramerate: encoding.maxFramerate ?? null,
        scaleResolutionDownBy: encoding.scaleResolutionDownBy ?? null,
      })),
      mismatch,
    });

    if (mismatch) {
      console.warn(
        `[LiveKitMediaSession] ${label} publish did not honour the requested encoding: ${mismatch}`,
      );
    }
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

  /**
   * Re-applies an encoding ladder to a sender that is already live.
   *
   * Publish options are read once, when the track is published, so changing the
   * quality of a running share used to mean republishing it — which every
   * viewer sees as the stream going black while the SFU hands out a new track.
   * The plan's layers are ordered lowest-first with the primary encoding last
   * (the convention `describeEncodingMismatch` reads), so they line up with the
   * sender's encodings from the end, whatever subset the browser kept.
   */
  private async applyLiveVideoEncodings(
    publication: LocalTrackPublication,
    plan: VideoPublishPlan,
    label: string,
  ): Promise<void> {
    const sender = publication.track?.sender;
    if (!sender) {
      return;
    }

    const ladder = [
      ...(plan.screenShareSimulcastLayers ?? []).map((preset) => preset.encoding),
      plan.screenShareEncoding ?? plan.videoEncoding,
    ];

    try {
      const parameters = sender.getParameters();
      const encodings = parameters.encodings ?? [];
      const offset = ladder.length - encodings.length;

      encodings.forEach((encoding, index) => {
        const spec = ladder[offset + index];
        if (!spec) {
          return;
        }
        encoding.maxBitrate = spec.maxBitrate;
        encoding.maxFramerate = spec.maxFramerate;
      });

      await sender.setParameters(parameters);
    } catch (error) {
      console.warn(
        `[LiveKitMediaSession] ${label} live encoding update failed:`,
        error,
      );
    }
  }

  private async replaceScreenStreamInternal(
    stream: MediaStream,
    mode: ScreenShareMode,
    quality: VideoPublishQuality | null,
  ): Promise<boolean> {
    const participant = this.room?.localParticipant;
    const publication = participant?.getTrackPublication(
      Track.Source.ScreenShare,
    );
    const publishedTrack = publication?.track;
    const nextTrack = stream.getVideoTracks()[0];

    // desiredScreenEnabled is cleared synchronously by unpublishScreen, while
    // the unpublish itself is queued behind us on the video queue. Without this
    // check a swap that was already running when the user hit stop would happily
    // replace the track on a sender that is about to be torn down, and report
    // success for a share nobody is meant to be broadcasting any more.
    if (!this.desiredScreenEnabled || !publication || !publishedTrack || !nextTrack) {
      return false;
    }

    const contentMode: VideoContentMode = mode === "motion" ? "motion" : "detail";
    try {
      nextTrack.contentHint = contentMode;
    } catch {
      // no-op
    }

    // userProvidedTrack: the capture is owned by the caller, which stops the
    // outgoing track itself once the swap has landed.
    await publishedTrack.replaceTrack(nextTrack, true);

    // The desired* fields are what restorePublishingState republishes from, so
    // they have to describe the new capture — otherwise a reconnect a second
    // later silently puts the old screen back.
    //
    // Written only after the replace resolved: when it rejects (sender torn
    // down mid-reconnect) the caller stops the new capture and keeps sharing
    // the old one, and these fields used to already point at the stream whose
    // only video track was just stopped. The next blip republished that ended
    // track and viewers got a permanently black tile.
    this.desiredScreenStream = stream;
    this.desiredScreenMode = mode;
    if (quality) this.desiredScreenQuality = quality;

    const codec = this.resolveScreenCodec();
    const target = this.resolveScreenTarget(nextTrack);
    const plan = buildVideoPublishPlan({
      target,
      codec,
      contentMode,
      isScreenShare: true,
    });

    await this.applyLiveVideoEncodings(publication, plan, "screen");

    logLiveKitDebug("stream-manager", "replace-screen", {
      mode,
      contentHint: nextTrack.contentHint,
      ...target,
      codec: plan.videoCodec,
      layers: plan.screenShareSimulcastLayers?.length ?? 0,
    });

    this.verifyPublishedEncodings(
      "screen-replace",
      publication,
      resolveCodecTarget(target, codec),
    );

    return true;
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
        isScreenShare: false,
        // One layer fewer while a share is live: six concurrent encoder sessions
        // is where a consumer GPU gives up and both streams go soft.
        isSharingScreen: this.desiredScreenEnabled,
      });

      logLiveKitDebug("stream-manager", "publish-camera", {
        contentHint: videoTrack.contentHint,
        ...target,
        codec: plan.videoCodec,
        simulcast: plan.simulcast,
        layers: plan.videoSimulcastLayers?.length ?? 0,
        scalabilityMode: plan.scalabilityMode ?? null,
      });

      const publication = await participant.publishTrack(videoTrack, {
        name: "camera",
        source: Track.Source.Camera,
        ...plan,
      });

      this.verifyPublishedEncodings(
        "camera",
        publication,
        resolveCodecTarget(target, this.resolvedVideoCodec),
      );
    } else {
      // No stream to publish. This used to fall through to
      // setCameraEnabled(true), which captures with publishDefaults only —
      // ignoring the ladder buildVideoPublishPlan exists to supply — so a
      // reconnect silently downgraded the publish. Capture belongs to
      // use-camera-controls; drop the intent instead of inventing one.
      logLiveKitDebug("stream-manager", "camera-desired-without-stream", {});
      this.desiredCameraEnabled = false;
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

      const codec = this.resolveScreenCodec();
      const target = this.resolveScreenTarget(screenTrack);
      const plan = buildVideoPublishPlan({
        target,
        codec,
        contentMode,
        isScreenShare: true,
      });

      logLiveKitDebug("stream-manager", "publish-screen", {
        mode: this.desiredScreenMode,
        contentHint: screenTrack.contentHint,
        ...target,
        codec: plan.videoCodec,
        simulcast: plan.simulcast,
        layers: plan.screenShareSimulcastLayers?.length ?? 0,
        scalabilityMode: plan.scalabilityMode ?? null,
        codecFallback: this.screenCodecFallback ?? null,
      });

      const publication = await participant.publishTrack(screenTrack, {
        name: "screen",
        source: Track.Source.ScreenShare,
        ...plan,
      });

      this.verifyPublishedEncodings(
        "screen",
        publication,
        resolveCodecTarget(target, codec),
      );

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
          await participant.publishTrack(
            audioTrack,
            SCREEN_AUDIO_PUBLISH_OPTIONS,
          );
          logLiveKitDebug("stream-manager", "screen-audio-published-success", {
            trackId: audioTrack.id,
          });
        } catch (err) {
          console.error("[LiveKitMediaSession] Screen audio publish failed:", err);
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
      // Same as the camera branch above, and worse: setScreenShareEnabled(true)
      // calls getDisplayMedia, so this popped an OS source picker in the middle
      // of a call, and published at LiveKit's h1080fps15 default — the exact
      // profile video-profiles.ts documents as the bug it was written to fix.
      logLiveKitDebug("stream-manager", "screen-desired-without-stream", {});
      this.desiredScreenEnabled = false;
    }
  }

  /**
   * "The next disconnect is one we are about to cause."
   *
   * A moderator moving somebody between rooms evicts their old media session at
   * the SFU, and that arrives here as PARTICIPANT_REMOVED — indistinguishable
   * from being kicked, so the person being moved was told "Sesli odadan
   * çıkarıldınız." a second before landing in the new room. The join for the new
   * room is already on its way when this is called, so the old room's teardown
   * needs no explanation and no reconnect.
   *
   * Time-bounded rather than a plain flag: if the follow-up join never happens,
   * an ordinary drop a minute later must still be reported as one.
   */
  public expectRoomChange(): void {
    this.roomChangeExpectedUntil = Date.now() + 15_000;
  }

  private handleDisconnected(reason?: DisconnectReason) {
    if (this.manualDisconnect || this.replacingRoom) return;

    if (Date.now() < this.roomChangeExpectedUntil) {
      this.roomChangeExpectedUntil = 0;
      this.teardownRoomState();
      // "closed", not "disconnected": the latter is what schedules the rejoin
      // chain, and rejoining is precisely what must not happen to the room the
      // user was just carried out of.
      this.callbacks.onConnectionStateChanged?.("closed");
      return;
    }

    // The reason used to be ignored, so a deliberate removal and a flaky uplink
    // took the same path: tear down, tell the app, and the app immediately
    // rejoined. For a removal that is a fight with the server — most sharply
    // with DUPLICATE_IDENTITY, where the rejoin IS what caused the eviction, so
    // reconnecting reproduces the condition and the two loop.
    //
    // These four are decisions, not failures. Report them as a plain
    // disconnect and let the user act.
    const isFinal =
      reason === DisconnectReason.DUPLICATE_IDENTITY ||
      reason === DisconnectReason.PARTICIPANT_REMOVED ||
      reason === DisconnectReason.ROOM_DELETED ||
      reason === DisconnectReason.CLIENT_INITIATED;

    // Say WHICH decision. "the connection ended" with no reason is the kind of
    // message that gets reported as a random drop — which is how this whole
    // class of bug reached the user in the first place. CLIENT_INITIATED is
    // deliberately silent: we asked for it.
    if (isFinal) {
      const explanation =
        reason === DisconnectReason.DUPLICATE_IDENTITY
          ? "Bu hesap başka bir cihazda sese katıldı, bu bağlantı kapatıldı."
          : reason === DisconnectReason.PARTICIPANT_REMOVED
            ? "Sesli odadan çıkarıldınız."
            : reason === DisconnectReason.ROOM_DELETED
              ? "Sesli oda kapatıldı."
              : null;

      if (explanation) {
        this.callbacks.onWarning?.(explanation);
      }
    }

    // Unexpected drop: discard the dead room/handlers so the app-level reconnect
    // (performPostJoinSynchronization -> connect with a fresh token) can rebuild.
    this.teardownRoomState();
    this.callbacks.onConnectionStateChanged?.(
      isFinal ? "closed" : "disconnected",
    );
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
    // What other people were watching belonged to the room that just went
    // away. The local watch set deliberately survives (a reconnect restores
    // the subscriptions), but nobody else's does: a viewer who left during
    // the outage would otherwise stay in the count forever.
    this.watchStateByViewer.clear();
    this.lastEmittedWatchers = {};
    this.clearPausedTracks();
    void this.updateLocalAudioSource(null);
    this.callbacks.onRemoteStreamsChanged?.({});
    this.callbacks.onScreenWatchersChanged?.({});
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

  /**
   * Swaps the live screen share's video track in place — a different monitor, a
   * different resolution, a different framerate — without unpublishing.
   * The sender and the track SID survive, so viewers see no gap.
   *
   * Returns false when there is nothing to replace — no publication, or the
   * share has already been stopped. Callers must treat that as "abandon the
   * swap and stop the capture you just took", NOT as "publish it instead":
   * falling back to a publish here is how a share the user had stopped ended up
   * live on the SFU again with the UI insisting it was off.
   */
  public replaceScreenStream(
    stream: MediaStream,
    mode: ScreenShareMode = "slides",
    quality: VideoPublishQuality | null = null,
  ): Promise<boolean> {
    return this.enqueueVideo(() =>
      this.replaceScreenStreamInternal(stream, mode, quality),
    );
  }

  /**
   * Adds or removes the screen share's audio track while the video keeps
   * running. Pass null to go silent.
   *
   * Audio used to be fixed at capture time: the only way to add it to a running
   * share was to stop and restart the whole thing, which drops the video for
   * everyone watching. The video publication is untouched here.
   *
   * Goes through the video queue because it mutates desiredScreenStream, which
   * a source/quality swap reads and rebuilds — the two racing would either
   * publish a stopped track or lose the audio the swap was carrying over.
   *
   * Returns false when there is no live share to attach anything to.
   */
  public setScreenAudioTrack(track: MediaStreamTrack | null): Promise<boolean> {
    return this.enqueueVideo(() => this.setScreenAudioTrackInternal(track));
  }

  private async setScreenAudioTrackInternal(
    track: MediaStreamTrack | null,
  ): Promise<boolean> {
    const participant = this.room?.localParticipant;
    const stream = this.desiredScreenStream;
    if (!participant || !stream || !this.desiredScreenEnabled) {
      return false;
    }

    const published = Array.from(participant.trackPublications.values()).filter(
      (publication) => publication.source === Track.Source.ScreenShareAudio,
    );
    for (const publication of published) {
      if (publication.track) {
        await participant.unpublishTrack(publication.track);
      }
    }

    // The desired stream is the reconnect's source of truth, so the old track
    // has to leave it too — otherwise a reconnect republishes audio the user
    // just switched off. Stopped as well: for the loopback path the track's
    // "ended" listener is what shuts the native WASAPI capture down.
    for (const existing of stream.getAudioTracks()) {
      stream.removeTrack(existing);
      existing.stop();
    }

    if (!track) {
      logLiveKitDebug("stream-manager", "screen-audio-removed", {});
      return true;
    }

    stream.addTrack(track);
    await participant.publishTrack(track, SCREEN_AUDIO_PUBLISH_OPTIONS);
    logLiveKitDebug("stream-manager", "screen-audio-added", {
      trackId: track.id,
    });
    return true;
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

