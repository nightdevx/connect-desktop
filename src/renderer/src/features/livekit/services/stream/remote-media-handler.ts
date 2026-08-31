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
import { shouldSubscribePublication } from "./constants";

// Remote playback runs through a single WebAudio bus:
//
//   per-track source -> per-track gain -> [per-voice compressor] -> master gain
//                    -> master limiter -> context.destination
//                    \-> analyser (mic only, speaking indicator)
//
// The previous implementation gave every participant a bare HTMLAudioElement
// and set `el.volume`. That caps at 1.0, so the 0-200% master and per-user
// volume sliders silently did nothing above 100% — the value was clamped away.
// A GainNode has no such ceiling, and the shared limiter is what makes boosting
// safe instead of just clipping.

type InputKind = "mic" | "screen";

interface BusInput {
  sourceNode: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  compressorNode: DynamicsCompressorNode | null;
  // Chromium does not pull audio from a remote MediaStreamTrack unless it is
  // also attached to a media element. This one is muted and exists purely to
  // keep the WebAudio graph fed.
  pumpElement: HTMLAudioElement;
  // Voice only — a screen share's audio is not its owner talking, and counting
  // it would light somebody's ring for the whole length of a video.
  //
  // Tapped off sourceNode, BEFORE gainNode, on purpose: turning one person down
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
  threshold: -18,
  knee: 6,
  ratio: 4,
  attack: 0.005,
  release: 0.15,
};

const MASTER_LIMITER = {
  threshold: -1,
  knee: 0,
  ratio: 20,
  attack: 0.003,
  release: 0.25,
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

const shouldLevelInput = (identity: string, kind: InputKind): boolean => {
  return kind === "mic" && !isMusicBotIdentity(identity);
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

  private currentOutputDeviceId: string | null = null;
  private isDeafened = false;
  private masterVolume = 1.0;

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

      masterGain.connect(limiter);
      limiter.connect(context.destination);

      this.audioContext = context;
      this.masterGainNode = masterGain;
      this.limiterNode = limiter;

      void this.applyContextSinkId(context);
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
      pumpElement.style.display = "none";
      pumpElement.srcObject = stream;
      document.body.appendChild(pumpElement);
      void pumpElement.play().catch(() => undefined);

      const sourceNode = bus.context.createMediaStreamSource(stream);
      const gainNode = bus.context.createGain();
      gainNode.gain.value = this.resolveInputGain(participant.identity, kind);

      sourceNode.connect(gainNode);

      let compressorNode: DynamicsCompressorNode | null = null;
      if (shouldLevelInput(participant.identity, kind)) {
        compressorNode = bus.context.createDynamicsCompressor();
        compressorNode.threshold.value = VOICE_COMPRESSOR.threshold;
        compressorNode.knee.value = VOICE_COMPRESSOR.knee;
        compressorNode.ratio.value = VOICE_COMPRESSOR.ratio;
        compressorNode.attack.value = VOICE_COMPRESSOR.attack;
        compressorNode.release.value = VOICE_COMPRESSOR.release;
        gainNode.connect(compressorNode);
        compressorNode.connect(bus.masterGain);
      } else {
        gainNode.connect(bus.masterGain);
      }

      let analyserNode: AnalyserNode | null = null;
      let levelBuffer: Uint8Array<ArrayBuffer> | null = null;
      if (kind === "mic") {
        analyserNode = bus.context.createAnalyser();
        // Same window as the local meter. 256 samples is ~5ms at 48kHz, short
        // enough that the RMS follows syllables rather than averaging them away.
        analyserNode.fftSize = 256;
        sourceNode.connect(analyserNode);
        levelBuffer = new Uint8Array(new ArrayBuffer(analyserNode.fftSize));
      }

      this.inputs.set(key, {
        sourceNode,
        gainNode,
        compressorNode,
        pumpElement,
        analyserNode,
        levelBuffer,
      });

      logLiveKitDebug("remote-media", "audio-attached", {
        identity: participant.identity,
        kind,
        gain: gainNode.gain.value,
        levelled: compressorNode !== null,
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
      input.gainNode.disconnect();
      input.compressorNode?.disconnect();
      input.analyserNode?.disconnect();
    } catch {
      // no-op
    }
    input.pumpElement.pause();
    input.pumpElement.srcObject = null;
    input.pumpElement.remove();
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
    // 0-200 percent maps to 0-2x. The limiter downstream absorbs the peaks.
    this.masterVolume = percentToGain(masterVolume);
    if (this.masterGainNode && !this.isDeafened) {
      this.rampGain(
        this.masterGainNode.gain,
        this.masterVolume,
        GAIN_RAMP_SECONDS,
      );
    }
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

  private async applyContextSinkId(context: AudioContext): Promise<void> {
    if (this.currentOutputDeviceId === null) {
      return;
    }

    const sinkTarget = context as AudioContext & {
      setSinkId?: (sinkId: string) => Promise<void>;
    };
    if (typeof sinkTarget.setSinkId !== "function") {
      return;
    }

    try {
      await sinkTarget.setSinkId(this.currentOutputDeviceId);
    } catch (error) {
      logLiveKitDebug("remote-media", "set-sink-id-failed", {
        deviceId: this.currentOutputDeviceId,
        error,
      });
    }
  }

  public async setAudioOutputDevice(deviceId: string | null) {
    const nextDeviceId = deviceId || "";
    if (this.currentOutputDeviceId === nextDeviceId) {
      return;
    }

    this.currentOutputDeviceId = nextDeviceId;
    logLiveKitDebug("remote-media", "switching-output-device", {
      deviceId: nextDeviceId,
    });

    if (this.audioContext) {
      await this.applyContextSinkId(this.audioContext);
    }
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
