import {
  clampEmoteVolumePercent,
  readEmoteVolumePercent,
} from "@/store/emote-volume";
import { type OscillatorTone, type SoundEffectOptions } from "./types";

// One pattern per emote id. Keys mirror the closed set the backend enforces
// (internal/lobby/emote.go); an id missing from here plays nothing rather than
// falling back to some other sound.
const EMOTE_PATTERNS: Record<string, OscillatorTone[]> = {
  // Three dry, bright bursts. Short and heavily filtered upward so they read as
  // percussive rather than tonal.
  clap: [
    { frequency: 1650, durationMs: 34, gain: 0.05, type: "square", filterFrequency: 5200, pauseAfterMs: 46 },
    { frequency: 1520, durationMs: 32, gain: 0.045, type: "square", filterFrequency: 5000, pauseAfterMs: 52 },
    { frequency: 1740, durationMs: 38, gain: 0.048, type: "square", filterFrequency: 5400 },
  ],
  // Four falling blips: the cadence is what makes it read as laughter, not the
  // timbre.
  laugh: [
    { frequency: 720, glideToFrequency: 620, durationMs: 62, gain: 0.042, type: "triangle", filterFrequency: 2400, pauseAfterMs: 30 },
    { frequency: 660, glideToFrequency: 560, durationMs: 58, gain: 0.04, type: "triangle", filterFrequency: 2300, pauseAfterMs: 30 },
    { frequency: 600, glideToFrequency: 500, durationMs: 56, gain: 0.038, type: "triangle", filterFrequency: 2200, pauseAfterMs: 30 },
    { frequency: 540, glideToFrequency: 440, durationMs: 70, gain: 0.036, type: "triangle", filterFrequency: 2100 },
  ],
  // Rimshot: two low thumps and a bright snap.
  drum: [
    { frequency: 180, glideToFrequency: 96, durationMs: 92, gain: 0.06, type: "sine", filterFrequency: 700, pauseAfterMs: 60 },
    { frequency: 180, glideToFrequency: 96, durationMs: 92, gain: 0.055, type: "sine", filterFrequency: 700, pauseAfterMs: 44 },
    { frequency: 1400, durationMs: 46, gain: 0.05, type: "square", filterFrequency: 4800 },
  ],
  // Two sustained sawtooth blasts a fifth apart, each bending up at the start.
  airhorn: [
    { frequency: 340, glideToFrequency: 420, glideMs: 90, durationMs: 300, gain: 0.055, type: "sawtooth", filterFrequency: 2600, overtoneGainRatio: 0.3, pauseAfterMs: 70 },
    { frequency: 340, glideToFrequency: 440, glideMs: 90, durationMs: 420, gain: 0.058, type: "sawtooth", filterFrequency: 2800, overtoneGainRatio: 0.3 },
  ],
  // Up, then a longer settle down.
  wow: [
    { frequency: 420, glideToFrequency: 880, durationMs: 180, gain: 0.045, type: "triangle", filterFrequency: 2600, pauseAfterMs: 10 },
    { frequency: 880, glideToFrequency: 620, durationMs: 260, gain: 0.04, type: "sine", filterFrequency: 2200 },
  ],
  // The four-note descent, each step bending down into the next.
  sad: [
    { frequency: 392, glideToFrequency: 370, durationMs: 190, gain: 0.045, type: "sawtooth", filterFrequency: 1300, pauseAfterMs: 20 },
    { frequency: 349, glideToFrequency: 330, durationMs: 190, gain: 0.044, type: "sawtooth", filterFrequency: 1250, pauseAfterMs: 20 },
    { frequency: 311, glideToFrequency: 294, durationMs: 200, gain: 0.043, type: "sawtooth", filterFrequency: 1200, pauseAfterMs: 20 },
    { frequency: 262, glideToFrequency: 180, durationMs: 420, gain: 0.046, type: "sawtooth", filterFrequency: 1100 },
  ],
};

class SoundEffectManager {
  private audioContext: AudioContext | null = null;
  // Decoded uploads, by emote id. An emote is pressed repeatedly by design.
  private readonly sampleCache = new Map<string, AudioBuffer>();
  private outputNode: AudioNode | null = null;
  // Emotes only. The UI cues -- join, leave, mic toggle -- deliberately do NOT
  // pass through it: they are this user's own feedback about their own actions,
  // and somebody turning the soundboard down is turning down other people's
  // noise, not the confirmation that their microphone opened.
  private emoteGainNode: GainNode | null = null;
  // Read at construction, so the first emote of a session already plays at the
  // volume the user chose rather than at 100% until something sets it.
  private emoteVolumePercent = readEmoteVolumePercent();
  private enabled = true;

  public configure(options: SoundEffectOptions): void {
    this.enabled = options.enabled;
  }

  /**
   * How loud other people's soundboard is, 0-200%.
   *
   * Applied to the live node when there is one, so a drag on the slider is
   * audible on the next press without rebuilding the graph.
   */
  public setEmoteVolumePercent(percent: number): void {
    this.emoteVolumePercent = clampEmoteVolumePercent(percent);

    if (this.emoteGainNode && this.audioContext) {
      this.emoteGainNode.gain.setValueAtTime(
        this.emoteVolumePercent / 100,
        this.audioContext.currentTime,
      );
    }
  }

  /** The node every emote is routed through, built on first use. */
  private getEmoteOutputNode(context: AudioContext): AudioNode {
    if (this.emoteGainNode) {
      return this.emoteGainNode;
    }

    const gain = context.createGain();
    gain.gain.setValueAtTime(
      this.emoteVolumePercent / 100,
      context.currentTime,
    );
    gain.connect(this.getOutputNode(context));
    this.emoteGainNode = gain;
    return gain;
  }

  public prime(): void {
    if (!this.enabled) {
      return;
    }

    const context = this.getAudioContext();
    if (!context) {
      return;
    }

    void context.resume().catch(() => undefined);
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (this.audioContext) {
      return this.audioContext;
    }

    const Ctx = window.AudioContext || window.webkitAudioContext;

    if (!Ctx) {
      return null;
    }

    this.audioContext = new Ctx();
    return this.audioContext;
  }

  private getOutputNode(context: AudioContext): AudioNode {
    if (this.outputNode) {
      return this.outputNode;
    }

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, context.currentTime);
    compressor.knee.setValueAtTime(22, context.currentTime);
    compressor.ratio.setValueAtTime(3.2, context.currentTime);
    compressor.attack.setValueAtTime(0.004, context.currentTime);
    compressor.release.setValueAtTime(0.16, context.currentTime);

    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.48, context.currentTime);

    compressor.connect(masterGain);
    masterGain.connect(context.destination);
    this.outputNode = compressor;
    return compressor;
  }

  private playPattern(
    pattern: OscillatorTone[],
    /** Emotes route through the soundboard gain; UI cues do not. */
    destination: "cue" | "emote" = "cue",
  ): void {
    const context = this.getAudioContext();
    if (!this.enabled || !context || pattern.length === 0) {
      return;
    }

    const outputNode =
      destination === "emote"
        ? this.getEmoteOutputNode(context)
        : this.getOutputNode(context);
    void context.resume().catch(() => undefined);

    const now = context.currentTime;
    let cursor = now;

    for (const tone of pattern) {
      const oscillatorMain = context.createOscillator();
      const oscillatorOvertone = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();

      oscillatorMain.type = tone.type ?? "sine";
      oscillatorMain.frequency.setValueAtTime(tone.frequency, cursor);
      oscillatorOvertone.type = "sine";
      oscillatorOvertone.frequency.setValueAtTime(
        tone.overtoneFrequency ?? tone.frequency * 2,
        cursor,
      );

      if (
        typeof tone.glideToFrequency === "number" &&
        Number.isFinite(tone.glideToFrequency)
      ) {
        oscillatorMain.frequency.exponentialRampToValueAtTime(
          Math.max(1, tone.glideToFrequency),
          cursor +
            Math.max(0.01, (tone.glideMs ?? tone.durationMs * 0.65) / 1000),
        );

        oscillatorOvertone.frequency.exponentialRampToValueAtTime(
          Math.max(1, (tone.overtoneFrequency ?? tone.frequency * 2) * 0.95),
          cursor +
            Math.max(0.01, (tone.glideMs ?? tone.durationMs * 0.65) / 1000),
        );
      }

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(tone.filterFrequency ?? 1500, cursor);
      filter.Q.setValueAtTime(0.5, cursor);

      gain.gain.setValueAtTime(0.0001, cursor);
      const attackSeconds = Math.min(0.026, (tone.durationMs / 1000) * 0.3);
      const sustainEndAt = cursor + tone.durationMs / 1000;
      const releaseStartAt = Math.max(
        cursor + attackSeconds + 0.016,
        sustainEndAt - 0.03,
      );

      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, tone.gain),
        cursor + attackSeconds,
      );
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, tone.gain * 0.68),
        releaseStartAt,
      );

      const endAt = sustainEndAt;
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      const overtoneGain = context.createGain();
      overtoneGain.gain.setValueAtTime(
        Math.max(0.0001, tone.gain * (tone.overtoneGainRatio ?? 0.16)),
        cursor,
      );

      oscillatorMain.connect(filter);
      oscillatorOvertone.connect(overtoneGain);
      overtoneGain.connect(filter);
      filter.connect(gain);
      gain.connect(outputNode);
      oscillatorMain.start(cursor);
      oscillatorOvertone.start(cursor);
      oscillatorMain.stop(endAt + 0.04);
      oscillatorOvertone.stop(endAt + 0.04);

      cursor = endAt + (tone.pauseAfterMs ?? 22) / 1000;
    }
  }

  public playMemberJoined(): void {
    this.playPattern([
      {
        frequency: 494,
        glideToFrequency: 554,
        durationMs: 88,
        gain: 0.02,
        type: "sine",
        filterFrequency: 1420,
        overtoneGainRatio: 0.12,
      },
      {
        frequency: 659,
        glideToFrequency: 740,
        durationMs: 102,
        gain: 0.022,
        type: "triangle",
        filterFrequency: 1680,
        overtoneGainRatio: 0.1,
      },
    ]);
  }

  public playMemberLeft(): void {
    this.playPattern([
      {
        frequency: 587,
        glideToFrequency: 520,
        durationMs: 86,
        gain: 0.019,
        type: "triangle",
        filterFrequency: 1380,
      },
      {
        frequency: 440,
        glideToFrequency: 370,
        durationMs: 112,
        gain: 0.021,
        type: "sine",
        filterFrequency: 1280,
      },
    ]);
  }

  public playCameraEnabled(): void {
    this.playPattern([
      {
        frequency: 740,
        glideToFrequency: 820,
        durationMs: 78,
        gain: 0.018,
        type: "sine",
        filterFrequency: 1900,
        overtoneGainRatio: 0.08,
      },
      {
        frequency: 932,
        glideToFrequency: 988,
        durationMs: 90,
        gain: 0.019,
        type: "triangle",
        filterFrequency: 2100,
        overtoneGainRatio: 0.07,
      },
    ]);
  }

  public playScreenEnabled(): void {
    this.playPattern([
      {
        frequency: 392,
        glideToFrequency: 430,
        durationMs: 92,
        gain: 0.02,
        type: "triangle",
        filterFrequency: 1320,
      },
      {
        frequency: 523,
        glideToFrequency: 580,
        durationMs: 108,
        gain: 0.021,
        type: "sine",
        filterFrequency: 1480,
      },
    ]);
  }

  public playMicToggle(enabled: boolean): void {
    if (enabled) {
      this.playPattern([
        {
          frequency: 680,
          glideToFrequency: 740,
          durationMs: 86,
          gain: 0.02,
          type: "triangle",
          filterFrequency: 1720,
          overtoneGainRatio: 0.08,
        },
      ]);
      return;
    }

    this.playPattern([
      {
        frequency: 440,
        glideToFrequency: 360,
        durationMs: 105,
        gain: 0.02,
        type: "sine",
        filterFrequency: 1240,
      },
    ]);
  }

  /**
   * Sound emotes.
   *
   * Synthesised here rather than shipped as audio files: the wire only carries
   * an id, so there is nothing to download, nothing to cache, no CSP hole for a
   * media host, and no way for a sender to make the room play arbitrary audio.
   * The trade is fidelity — these are stylised, not sampled — which for a
   * reaction noise is the right side of the trade.
   *
   * Louder than the join/leave cues (which are ambient and must not interrupt):
   * an emote is the point of the moment, so it sits above the conversation
   * without clipping it. Everything still runs through the shared compressor.
   */
  public playEmote(emote: string): void {
    const pattern = EMOTE_PATTERNS[emote];
    if (!pattern) {
      // An id this build does not know: a newer client sent it, or the set grew
      // server-side. Silence beats a wrong noise.
      return;
    }
    this.playPattern(pattern, "emote");
  }

  /**
   * An uploaded emote, decoded from its data URL.
   *
   * Through the same compressor and master gain as the synthesised set, which
   * is the whole reason this does not just call `new Audio(dataUrl).play()`:
   * an uploaded clip is whatever loudness its uploader exported at, and an
   * element-based path bypasses the limiter that keeps every other cue from
   * clipping the conversation. Decoded buffers are cached, so the second press
   * of the same emote costs nothing.
   */
  public async playSample(emoteId: string, dataUrl: string): Promise<void> {
    const context = this.getAudioContext();
    if (!this.enabled || !context) {
      return;
    }

    try {
      let buffer = this.sampleCache.get(emoteId);
      if (!buffer) {
        // Decoded off the base64 payload directly. fetch() on a data: URL works
        // but goes through the network stack for bytes already in memory.
        const bytes = decodeBase64DataURL(dataUrl);
        if (!bytes) {
          return;
        }
        buffer = await context.decodeAudioData(bytes);
        this.sampleCache.set(emoteId, buffer);
      }

      if (context.state === "suspended") {
        void context.resume();
      }

      const source = context.createBufferSource();
      source.buffer = buffer;

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.85, context.currentTime);

      source.connect(gain);
      gain.connect(this.getEmoteOutputNode(context));
      source.start();
    } catch {
      // A clip this build cannot decode is silence, not an error dialog. The
      // server already refused anything that is not one of the audio types
      // Chromium ships with, so this is the "corrupt file" case.
    }
  }

  /** Dropped when an emote is deleted, so a re-uploaded id cannot play the old
   *  sound out of the cache. */
  public forgetSample(emoteId: string): void {
    this.sampleCache.delete(emoteId);
  }

  public playHeadphoneToggle(enabled: boolean): void {
    if (enabled) {
      this.playPattern([
        {
          frequency: 554,
          glideToFrequency: 620,
          durationMs: 86,
          gain: 0.019,
          type: "triangle",
          filterFrequency: 1540,
          overtoneGainRatio: 0.08,
        },
      ]);
      return;
    }

    this.playPattern([
      {
        frequency: 392,
        glideToFrequency: 320,
        durationMs: 108,
        gain: 0.02,
        type: "sine",
        filterFrequency: 1180,
      },
    ]);
  }
}

export const soundEffectManager = new SoundEffectManager();

/** base64 payload of a data: URL as raw bytes. Returns null for anything that
 *  is not one — the server validates the shape, this is the client-side guard
 *  for a payload that arrived from an older or newer build. */
const decodeBase64DataURL = (dataUrl: string): ArrayBuffer | null => {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) {
    return null;
  }

  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  } catch {
    return null;
  }
};
