import {
  Participant,
  Room,
  Track,
  RemoteTrackPublication,
  RemoteTrack,
  RemoteParticipant,
} from "livekit-client";
import { logLiveKitDebug } from "@/services/debug-log";
import { isMusicBotIdentity } from "@shared/music";
import { readRmsLevel } from "./speaking";
import { needsMasterLimiter, shouldSubscribePublication } from "./constants";

// Remote playback runs through a single WebAudio bus:
//
//   per-track source -> [voice mono fold] -> [per-voice compressor]
//                    -> per-track gain -> master gain -> [master limiter]
//                    -> context.destination
//                    \-> analyser (mic only, speaking indicator)
//
// Both dynamics stages are on the path only while they are wanted. A
// DynamicsCompressorNode delays everything through it by its 6 ms look-ahead,
// and the two in series cost 12 ms on every word. The per-voice compressor
// follows the "Ses seviyelerini dengele" setting; the master limiter is switched
// in by needsMasterLimiter, when something can push the mix past full scale.
//
// The mono fold is a ChannelSplitter/ChannelMerger pair that copies channel 0
// of the source onto BOTH output channels. It is there because the channel
// layout a remote track reports is not trustworthy at the moment it is
// subscribed. TrackSubscribed fires as soon as the transceiver exists, which
// for somebody who joins a room that is already running is BEFORE a single RTP
// packet has arrived, so the MediaStreamAudioSourceNode is built against a
// format nobody has seen yet — Blink defaults that node to stereo. A mono voice
// landing in a two-channel node fills the left channel and leaves the right one
// silent, and everything downstream carries that layout faithfully to the
// speakers: the newcomer is heard in one ear only, by everybody who was already
// in the room, until something re-subscribes and the node is rebuilt against a
// format that is by then known. That was the "leave and rejoin fixes it" bug.
//
// Folding channel 0 out to both sides is correct either way round: a voice
// track is mono by construction — the capture asks for channelCount 1 and the
// microphone processor publishes one channel — so channel 1 is never anything
// but a duplicate or silence. Screen share and the music bot are genuinely
// stereo and are deliberately left alone.
//
// The per-track gain sits AFTER the compressor, and that order is what makes
// the per-person volume slider mean anything. A compressor's gain reduction
// depends on how loud its input is, so with the gain in front of it, turning
// somebody down ALSO stopped the compressor compressing them — and it handed a
// chunk of the attenuation straight back. Dragging a loud talker to 5% bought
// about 13 dB instead of 26, which is what "I turned them all the way down and
// they are still too loud" was. Levelling first and applying the listener's
// choice to the result makes the slider absolute: 5% is 5%, whoever is talking.
//
// The previous implementation gave every participant a bare HTMLAudioElement
// and set `el.volume`. That caps at 1.0, so the 0-200% master and per-user
// volume sliders silently did nothing above 100% — the value was clamped away.
// A GainNode has no such ceiling, and the shared limiter is what makes boosting
// safe instead of just clipping.

type InputKind = "mic" | "screen";

interface BusInput {
  identity: string;
  kind: InputKind;
  sourceNode: MediaStreamAudioSourceNode;
  // ChannelSplitter + ChannelMerger, voice only. Empty for stereo inputs.
  monoFoldNodes: AudioNode[];
  // Where the chain continues from: the fold's merger for a voice, the source
  // for a stereo input.
  head: AudioNode;
  gainNode: GainNode;
  // Voice only. Built for every voice, on the path only while levelling is on.
  compressorNode: DynamicsCompressorNode | null;
  // Chromium does not pull audio from a remote MediaStreamTrack unless it is
  // also attached to a media element. This one is muted and exists purely to
  // keep the WebAudio graph fed, and it feeds it at the clock of whichever
  // device it plays on, so it is kept on the bus's device.
  pumpElement: HTMLAudioElement;
  // Voice only — a screen share's audio is not its owner talking, and counting
  // it would light somebody's ring for the whole length of a video.
  //
  // Tapped off the mono fold, BEFORE gainNode, on purpose: turning one person down
  // to 20% or muting them locally must not change whether they are shown as
  // speaking. They are still talking; the roster says so, and a separate icon
  // says you muted them.
  analyserNode: AnalyserNode | null;
  levelBuffer: Uint8Array<ArrayBuffer> | null;
}

const GAIN_RAMP_SECONDS = 0.015;
const MUTE_RAMP_SECONDS = 0.005;
const SILENCE_SETTLE_SECONDS = 0.05;

const PLAYBACK_SAMPLE_RATE = 48000;

const VOICE_COMPRESSOR = {
  threshold: -16,
  knee: 10,
  ratio: 3,
  attack: 0.02,
  release: 0.2,
};

const MASTER_LIMITER = {
  threshold: -6,
  knee: 8,
  ratio: 8,
  attack: 0.003,
  release: 0.08,
};

const inputKey = (identity: string, kind: InputKind): string => {
  return `${identity}:${kind}`;
};

const percentToGain = (percent: number): number => {
  if (!Number.isFinite(percent)) {
    return 1;
  }
  return Math.max(0, percent) / 100;
};

// A human talking: mono by construction, and the only input that wants both
// levelling and the mono fold. Screen audio and the music bot are stereo.
const isVoiceInput = (identity: string, kind: InputKind): boolean => {
  return kind === "mic" && !isMusicBotIdentity(identity);
};

type SinkId = string | { type: "none" };

// AudioContext.setSinkId is missing from TypeScript's DOM lib, and both it and
// the media element's may be absent at runtime; the two take the same ids.
const setSink = async (target: object, sinkId: SinkId): Promise<void> => {
  const sinkTarget = target as {
    setSinkId?: (sinkId: SinkId) => Promise<void>;
  };
  if (typeof sinkTarget.setSinkId === "function") {
    await sinkTarget.setSinkId(sinkId);
  }
};

// disconnect(destination) throws when the two are not connected.
const disconnectFrom = (node: AudioNode, destination: AudioNode): void => {
  try {
    node.disconnect(destination);
  } catch {
    // not connected
  }
};

export class RemoteMediaHandler {
  private readonly participantVolumes = new Map<string, number>();
  private readonly participantMutes = new Map<string, boolean>();
  private readonly screenAudioVolumes = new Map<string, number>();
  private readonly screenAudioMutes = new Map<string, boolean>();

  private readonly inputs = new Map<string, BusInput>();

  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private limiterNode: DynamicsCompressorNode | null = null;
  private limiterInPath = false;

  private currentOutputDeviceId: string | null = null;
  private reopeningOutput = false;
  private isDeafened = false;
  private masterVolume = 1.0;
  private voiceLevelling = true;

  public constructor(
    private readonly room: Room,
    // Screen shares are opt-in, so re-subscribing after a deafen has to know
    // which of them this user actually asked to watch. Without it, un-deafening
    // pulled every screen share's audio in the room.
    private readonly isWatchingScreen: (identity: string) => boolean,
  ) {}

  // ---- Bus lifecycle ----

  private ensureBus(): {
    context: AudioContext;
    masterGain: GainNode;
  } | null {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return null;
    }

    if (this.audioContext && this.masterGainNode) {
      if (this.audioContext.state === "suspended") {
        void this.audioContext.resume().catch(() => undefined);
      }
      return { context: this.audioContext, masterGain: this.masterGainNode };
    }

    try {
      const context = new AudioContext({
        latencyHint: "interactive",
        sampleRate: PLAYBACK_SAMPLE_RATE,
      });

      const masterGain = context.createGain();
      masterGain.gain.value = this.isDeafened ? 0 : this.masterVolume;

      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = MASTER_LIMITER.threshold;
      limiter.knee.value = MASTER_LIMITER.knee;
      limiter.ratio.value = MASTER_LIMITER.ratio;
      limiter.attack.value = MASTER_LIMITER.attack;
      limiter.release.value = MASTER_LIMITER.release;

      limiter.connect(context.destination);
      masterGain.connect(context.destination);

      this.audioContext = context;
      this.masterGainNode = masterGain;
      this.limiterNode = limiter;
      this.limiterInPath = false;
      this.updateLimiterRoute();

      context.addEventListener("error", () => {
        void this.reopenOutputDevice();
      });
      void this.applyOutputDevice();
      if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
      }

      logLiveKitDebug("remote-media", "bus-created", {
        sampleRate: context.sampleRate,
      });

      return { context, masterGain };
    } catch (error) {
      logLiveKitDebug("remote-media", "bus-create-failed", { error });
      return null;
    }
  }

  private rampGain(
    param: AudioParam,
    value: number,
    timeConstant: number,
  ): void {
    const context = this.audioContext;
    if (!context) {
      param.value = value;
      return;
    }

    try {
      param.cancelScheduledValues(context.currentTime);
      param.setTargetAtTime(value, context.currentTime, timeConstant);
      if (value === 0) {
        param.setValueAtTime(0, context.currentTime + SILENCE_SETTLE_SECONDS);
      }
    } catch {
      param.value = value;
    }
  }

  // ---- Track attach / detach ----

  public handleTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    updateMedia: () => void,
  ) {
    if (track.kind === Track.Kind.Audio) {
      const kind: InputKind =
        publication.source === Track.Source.ScreenShareAudio ? "screen" : "mic";
      this.attachAudioTrack(track, participant, kind);
    }
    updateMedia();
  }

  public handleTrackUnsubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    updateMedia: () => void,
  ) {
    if (track.kind === Track.Kind.Audio) {
      const kind: InputKind =
        publication.source === Track.Source.ScreenShareAudio ? "screen" : "mic";
      this.detachAudioTrack(participant.identity, kind);
    }
    updateMedia();
  }

  private attachAudioTrack(
    track: RemoteTrack,
    participant: Participant,
    kind: InputKind,
  ): void {
    const key = inputKey(participant.identity, kind);
    // The same track twice is one attach. The join hands over tracks that
    // subscribed while the room was still connecting (adoptSubscribedTracks),
    // and livekit-client may also have announced one of them by then.
    const existing = this.inputs.get(key);
    if (
      existing &&
      track.mediaStreamTrack &&
      existing.sourceNode.mediaStream.getAudioTracks()[0] === track.mediaStreamTrack
    ) {
      return;
    }
    this.detachAudioTrack(participant.identity, kind);

    const bus = this.ensureBus();
    if (!bus || !track.mediaStreamTrack) {
      return;
    }

    try {
      const stream = new MediaStream([track.mediaStreamTrack]);

      const pumpElement = document.createElement("audio");
      pumpElement.id = `remote-audio-pump-${key}`;
      pumpElement.autoplay = true;
      pumpElement.muted = true;
      pumpElement.volume = 0;
      pumpElement.style.display = "none";
      pumpElement.srcObject = stream;
      if (this.currentOutputDeviceId !== null) {
        void this.setSinkLogged(pumpElement, this.currentOutputDeviceId);
      }
      document.body.appendChild(pumpElement);
      void pumpElement.play().catch(() => undefined);

      const sourceNode = bus.context.createMediaStreamSource(stream);
      const isVoice = isVoiceInput(participant.identity, kind);

      // Channel 0 to both outputs. The splitter's interpretation is "discrete",
      // so a source that really is mono lands on output 0 and output 1 stays
      // silent — which is the only channel this reads. One edge therefore covers
      // both the healthy layout and the wrong one, at full level; a downmix
      // would have cost 6 dB on whichever of the two turned up.
      const monoFoldNodes: AudioNode[] = [];
      let head: AudioNode = sourceNode;
      if (isVoice) {
        const splitterNode = bus.context.createChannelSplitter(2);
        const mergerNode = bus.context.createChannelMerger(2);
        sourceNode.connect(splitterNode);
        splitterNode.connect(mergerNode, 0, 0);
        splitterNode.connect(mergerNode, 0, 1);
        monoFoldNodes.push(splitterNode, mergerNode);
        head = mergerNode;
      }

      const gainNode = bus.context.createGain();
      gainNode.gain.value = this.resolveInputGain(participant.identity, kind);

      let compressorNode: DynamicsCompressorNode | null = null;
      if (isVoice) {
        compressorNode = bus.context.createDynamicsCompressor();
        compressorNode.threshold.value = VOICE_COMPRESSOR.threshold;
        compressorNode.knee.value = VOICE_COMPRESSOR.knee;
        compressorNode.ratio.value = VOICE_COMPRESSOR.ratio;
        compressorNode.attack.value = VOICE_COMPRESSOR.attack;
        compressorNode.release.value = VOICE_COMPRESSOR.release;
        compressorNode.connect(gainNode);
      } else {
        head.connect(gainNode);
      }
      gainNode.connect(bus.masterGain);

      let analyserNode: AnalyserNode | null = null;
      let levelBuffer: Uint8Array<ArrayBuffer> | null = null;
      if (kind === "mic") {
        analyserNode = bus.context.createAnalyser();
        // Same window as the local meter. 256 samples is ~5ms at 48kHz, short
        // enough that the RMS follows syllables rather than averaging them away.
        analyserNode.fftSize = 256;
        head.connect(analyserNode);
        levelBuffer = new Uint8Array(new ArrayBuffer(analyserNode.fftSize));
      }

      const input: BusInput = {
        identity: participant.identity,
        kind,
        sourceNode,
        monoFoldNodes,
        head,
        gainNode,
        compressorNode,
        pumpElement,
        analyserNode,
        levelBuffer,
      };
      this.routeVoice(input);
      this.inputs.set(key, input);
      this.updateLimiterRoute();

      logLiveKitDebug("remote-media", "audio-attached", {
        identity: participant.identity,
        kind,
        gain: gainNode.gain.value,
        levelled: compressorNode !== null && this.voiceLevelling,
        monoFolded: monoFoldNodes.length > 0,
      });
    } catch (error) {
      logLiveKitDebug("remote-media", "audio-attach-failed", {
        identity: participant.identity,
        kind,
        error,
      });
    }
  }

  private detachAudioTrack(identity: string, kind: InputKind): void {
    const key = inputKey(identity, kind);
    const input = this.inputs.get(key);
    if (!input) {
      return;
    }

    this.inputs.delete(key);
    try {
      input.sourceNode.disconnect();
      for (const node of input.monoFoldNodes) {
        node.disconnect();
      }
      input.gainNode.disconnect();
      input.compressorNode?.disconnect();
      input.analyserNode?.disconnect();
    } catch {
      // no-op
    }
    input.pumpElement.pause();
    input.pumpElement.srcObject = null;
    input.pumpElement.remove();
    this.updateLimiterRoute();
  }

  // ---- Dynamics routing ----

  /**
   * "Ses seviyelerini dengele": every voice's compressor on the path, or
   * around it. Live; a stereo input never has one.
   */
  public setVoiceLevelling(enabled: boolean): void {
    if (enabled === this.voiceLevelling) {
      return;
    }
    this.voiceLevelling = enabled;
    for (const input of this.inputs.values()) {
      this.routeVoice(input);
    }
    logLiveKitDebug("remote-media", "voice-levelling", { enabled });
  }

  private routeVoice(input: BusInput): void {
    const { head, compressorNode, gainNode } = input;
    if (!compressorNode) {
      return;
    }
    disconnectFrom(head, compressorNode);
    disconnectFrom(head, gainNode);
    if (this.voiceLevelling) {
      head.connect(compressorNode);
    } else {
      head.connect(gainNode);
    }
  }

  private updateLimiterRoute(): void {
    const context = this.audioContext;
    const masterGain = this.masterGainNode;
    const limiter = this.limiterNode;
    if (!context || !masterGain || !limiter) {
      return;
    }

    const wanted = needsMasterLimiter(
      this.masterVolume,
      Array.from(this.inputs.values(), (input) => ({
        voice: input.compressorNode !== null,
        gain: this.resolveInputGain(input.identity, input.kind),
      })),
    );
    if (wanted === this.limiterInPath) {
      return;
    }

    masterGain.disconnect();
    masterGain.connect(wanted ? limiter : context.destination);
    this.limiterInPath = wanted;
    logLiveKitDebug("remote-media", "master-limiter", { inPath: wanted });
  }

  /**
   * What playback adds after the jitter buffer: the AudioContext's own
   * buffering to the device, and how many dynamics stages, each with a 6 ms
   * look-ahead, a voice passes through. Null output before the bus exists.
   */
  public playoutLatency(): { outputMs: number | null; dynamicsStages: number } {
    const context = this.audioContext;
    return {
      outputMs: context ? ((context.baseLatency ?? 0) + (context.outputLatency ?? 0)) * 1000 : null,
      dynamicsStages: (this.voiceLevelling ? 1 : 0) + (this.limiterInPath ? 1 : 0),
    };
  }

  // ---- Speaking level ----

  /**
   * How loud this person's voice is right now, or null when this client is not
   * receiving it — deafened, or not subscribed yet. null means "no opinion", and
   * the caller falls back to the server's active-speaker flag; it must NOT be
   * read as silence, or deafening yourself would put out everybody's ring.
   */
  public readMicLevel(identity: string): number | null {
    const input = this.inputs.get(inputKey(identity, "mic"));
    if (!input?.analyserNode || !input.levelBuffer) {
      return null;
    }
    return readRmsLevel(input.analyserNode, input.levelBuffer);
  }

  // ---- Volume ----

  private resolveInputGain(identity: string, kind: InputKind): number {
    if (kind === "screen") {
      const muted = this.screenAudioMutes.get(identity) ?? false;
      return muted ? 0 : (this.screenAudioVolumes.get(identity) ?? 1);
    }
    const muted = this.participantMutes.get(identity) ?? false;
    return muted ? 0 : (this.participantVolumes.get(identity) ?? 1);
  }

  private applyInputGain(identity: string, kind: InputKind): void {
    const input = this.inputs.get(inputKey(identity, kind));
    if (!input) {
      return;
    }
    const value = this.resolveInputGain(identity, kind);
    this.rampGain(
      input.gainNode.gain,
      value,
      value === 0 ? MUTE_RAMP_SECONDS : GAIN_RAMP_SECONDS,
    );
    this.updateLimiterRoute();
  }

  public setParticipantVolume(identity: string, volume: number) {
    this.participantVolumes.set(identity, Math.max(0, volume));
    this.applyInputGain(identity, "mic");
  }

  public setParticipantMuted(identity: string, muted: boolean) {
    this.participantMutes.set(identity, muted);
    this.applyInputGain(identity, "mic");
  }

  public setScreenAudioVolume(identity: string, volumePercent: number) {
    this.screenAudioVolumes.set(identity, percentToGain(volumePercent));
    this.applyInputGain(identity, "screen");
  }

  public setScreenAudioMuted(identity: string, muted: boolean) {
    this.screenAudioMutes.set(identity, muted);
    this.applyInputGain(identity, "screen");
  }

  public hasScreenAudio(identity: string): boolean {
    return this.inputs.has(inputKey(identity, "screen"));
  }

  public setMasterVolume(masterVolume: number) {
    // 0-200 percent maps to 0-2x. Above 1x the limiter is switched in to absorb
    // the peaks.
    this.masterVolume = percentToGain(masterVolume);
    if (this.masterGainNode && !this.isDeafened) {
      this.rampGain(
        this.masterGainNode.gain,
        this.masterVolume,
        GAIN_RAMP_SECONDS,
      );
    }
    this.updateLimiterRoute();
  }

  // ---- Deafen ----

  /**
   * Deafen now unsubscribes the remote audio tracks instead of just zeroing the
   * volume. Silent-but-subscribed still pulled every participant's audio over
   * the wire and still paid for decoding it.
   *
   * The master gain is cut synchronously so the user hears silence immediately;
   * unsubscription is what makes it stop costing bandwidth a moment later.
   *
   * Un-deafening restores only what this user is entitled to hear. It used to
   * subscribe every audio publication unconditionally, which handed back the
   * screen-share audio of streams nobody had opened — and because the audio
   * controls re-assert deafen state on every microphone toggle, that ran far
   * more often than an actual deafen.
   */
  public setDeafened(deafened: boolean) {
    if (deafened === this.isDeafened) {
      return;
    }
    this.isDeafened = deafened;

    if (this.masterGainNode) {
      this.rampGain(
        this.masterGainNode.gain,
        deafened ? 0 : this.masterVolume,
        MUTE_RAMP_SECONDS,
      );
    }

    for (const participant of this.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind !== Track.Kind.Audio) {
          continue;
        }
        const wanted = shouldSubscribePublication({
          kind: publication.kind,
          source: publication.source,
          deafened,
          watchingScreen: this.isWatchingScreen(participant.identity),
        });
        if (publication.isSubscribed === wanted) {
          continue;
        }
        try {
          publication.setSubscribed(wanted);
        } catch (error) {
          logLiveKitDebug("remote-media", "deafen-subscription-failed", {
            identity: participant.identity,
            error,
          });
        }
      }
    }

    logLiveKitDebug("remote-media", "deafen-changed", { deafened });
  }

  public isDeafenedNow(): boolean {
    return this.isDeafened;
  }

  // ---- Audio output device ----

  private async setSinkLogged(target: object, sinkId: string): Promise<void> {
    try {
      await setSink(target, sinkId);
    } catch (error) {
      logLiveKitDebug("remote-media", "set-sink-id-failed", {
        deviceId: sinkId,
        error,
      });
    }
  }

  // The context and every pump element on one device. A pump element plays on
  // the default device unless it is told otherwise, and Chromium feeds the bus
  // from it at that device's clock. With the bus on another device the two
  // clocks drift apart in the FIFO between them, which is heard as a periodic
  // crackle or a slowly growing delay.
  private async applyOutputDevice(): Promise<void> {
    const deviceId = this.currentOutputDeviceId;
    if (deviceId === null) {
      return;
    }
    const targets: object[] = Array.from(
      this.inputs.values(),
      (input) => input.pumpElement,
    );
    if (this.audioContext) {
      targets.push(this.audioContext);
    }
    await Promise.all(
      targets.map((target) => this.setSinkLogged(target, deviceId)),
    );
  }

  /**
   * Where remote audio plays: a device id, or "" for the system default.
   * Chosen by the caller (stream-manager, through audio-devices.ts), which is
   * the one place that knows the user's selection and the device list.
   */
  public async setAudioOutputDevice(deviceId: string): Promise<void> {
    if (this.currentOutputDeviceId === deviceId) {
      return;
    }

    this.currentOutputDeviceId = deviceId;
    logLiveKitDebug("remote-media", "switching-output-device", { deviceId });
    await this.applyOutputDevice();
  }

  /**
   * The output device failed under a running context: unplugged, or its
   * driver reset. Chromium reports that as an "error" event and leaves the
   * context silent until it is pointed at a device again. setSinkId with the
   * id it already has is a no-op, so the context is parked on no device first.
   * A device that is gone for good falls back to the system default; the
   * stored selection is reset separately, by WorkspaceShell's device watch.
   */
  private async reopenOutputDevice(): Promise<void> {
    const context = this.audioContext;
    if (!context || this.reopeningOutput) {
      return;
    }
    this.reopeningOutput = true;
    const deviceId = this.currentOutputDeviceId ?? "";
    logLiveKitDebug("remote-media", "output-device-error", { deviceId });
    try {
      await setSink(context, { type: "none" });
      await setSink(context, deviceId);
    } catch (error) {
      logLiveKitDebug("remote-media", "set-sink-id-failed", { deviceId, error });
      this.currentOutputDeviceId = "";
      await this.setSinkLogged(context, "");
    } finally {
      this.reopeningOutput = false;
    }
    await this.applyOutputDevice();
  }

  // ---- Dispose ----

  public dispose() {
    for (const key of Array.from(this.inputs.keys())) {
      const separator = key.lastIndexOf(":");
      if (separator < 0) {
        continue;
      }
      this.detachAudioTrack(
        key.slice(0, separator),
        key.slice(separator + 1) as InputKind,
      );
    }

    try {
      this.masterGainNode?.disconnect();
      this.limiterNode?.disconnect();
    } catch {
      // no-op
    }
    this.masterGainNode = null;
    this.limiterNode = null;

    const context = this.audioContext;
    this.audioContext = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  }
}
