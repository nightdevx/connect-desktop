import {
  clampEmoteVolumePercent,
  readEmoteVolumePercent,
} from "@/store/emote-volume";
import { type OscillatorTone, type SoundEffectOptions } from "./types";
import { CUE_PATTERNS } from "./cues";

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

/**
 * The table sounds: a card thrown, a tile put down, a shell landing.
 *
 * Deliberately NOT in cues.ts, and the reason is worth writing down. The UI cue
 * palette is a set of musical notifications: check-sound-cues.cjs holds it to a
 * pentatonic scale, a minimum tail on every note, and a distinctness rule across
 * the whole set, all so that two cues overlapping in a busy room stay consonant
 * and tellable apart. These are not notifications. A card sliding onto a pile is
 * a NOISE -- short, tuneless, and it must stop dead rather than ring, which is
 * the exact opposite of every rule that palette enforces.
 *
 * Synthesised for the same reason the emotes are: nothing to download, nothing
 * to cache, no CSP hole for a media host, no licence to honour, and no asset in
 * the installer. A stylised knock is the right side of the fidelity trade for a
 * sound that fires several times a minute.
 *
 * Quiet on purpose. These fire on every move at the table, including other
 * people's; anything at emote level would be unbearable inside twenty minutes.
 */
const MINIGAME_PATTERNS = {
  // A card landing: a short filtered rasp with a click on the end of it. Two
  // notes rather than one, because a single tone reads as a beep however dry it
  // is, and the slide-then-stop is what says "paper".
  cardThrow: [
    { frequency: 320, glideToFrequency: 210, glideMs: 42, durationMs: 46, gain: 0.05, type: "triangle", filterFrequency: 1500, overtoneGainRatio: 0.06, attackMs: 3, releaseMs: 34, pauseAfterMs: 4 },
    { frequency: 900, durationMs: 16, gain: 0.036, type: "square", filterFrequency: 3400, overtoneGainRatio: 0.05, attackMs: 2, releaseMs: 26 },
  ],
  // Bone on wood. Low, woody, over almost before it starts -- an okey tile put
  // down on an istaka is a click, not a note.
  tileClack: [
    { frequency: 240, glideToFrequency: 168, glideMs: 26, durationMs: 30, gain: 0.058, type: "triangle", filterFrequency: 1100, overtoneGainRatio: 0.1, attackMs: 2, releaseMs: 46 },
  ],
  // A shell into open water: a dull low thud that falls away.
  splash: [
    { frequency: 300, glideToFrequency: 130, glideMs: 130, durationMs: 130, gain: 0.05, type: "sine", filterFrequency: 800, overtoneGainRatio: 0.08, attackMs: 4, releaseMs: 180 },
  ],
  // A shell into a hull. Starts on the same thud so the pair sound like the same
  // gun, then adds the crack the miss does not have.
  blast: [
    { frequency: 190, glideToFrequency: 70, glideMs: 150, durationMs: 150, gain: 0.075, type: "sawtooth", filterFrequency: 620, overtoneGainRatio: 0.3, attackMs: 2, releaseMs: 260, pauseAfterMs: 0 },
    { frequency: 1200, glideToFrequency: 480, glideMs: 90, durationMs: 60, gain: 0.05, type: "square", filterFrequency: 2600, overtoneGainRatio: 0.2, attackMs: 2, releaseMs: 150 },
  ],
} satisfies Record<string, OscillatorTone[]>;

export type MinigameCue = keyof typeof MINIGAME_PATTERNS;

// How far ahead of the audio clock a cue is scheduled. Small enough that
// nobody perceives it, large enough that the ramps are never behind the audio
// thread by the time it reads them.
const SCHEDULE_LEAD_SECONDS = 0.02;

// Two of the same cue inside this window are one event as far as a listener is
// concerned. A roster snapshot arrives about once a second and can carry three
// arrivals in it.
const COALESCE_WINDOW_MS = 220;

class SoundEffectManager {
  private audioContext: AudioContext | null = null;
  /** Last wall-clock time each cue key was played, for coalescing bursts. */
  private readonly lastPlayedAtByKey = new Map<string, number>();
  /** Whether the output device has been opened. See prime(). */
  private isWarm = false;
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

  /**
   * Opens the output device before anything needs to be heard through it.
   *
   * The first cue of a session used to pay for all of this at the moment it was
   * supposed to be heard: constructing the context, waiting for WASAPI to hand
   * over an endpoint, building the compressor and the master gain. That is tens
   * to hundreds of milliseconds, and it lands on the one sound that is supposed
   * to confirm something just happened — so the first join chime arrived late,
   * clipped, or not at all.
   *
   * Idempotent and cheap after the first call, so callers can prime on mount,
   * on the first click, and on entering a room without thinking about it.
   */
  public prime(): void {
    if (!this.enabled) {
      return;
    }

    const context = this.getAudioContext();
    if (!context) {
      return;
    }

    void context.resume().catch(() => undefined);

    if (this.isWarm) {
      return;
    }
    this.isWarm = true;

    // Build the shared graph now rather than inside the first cue.
    this.getOutputNode(context);

    // One silent sample. A context can be "running" while the platform has not
    // actually opened an endpoint yet; the first buffer it is asked to render
    // is what forces that, and doing it here means the first real cue finds the
    // device already awake.
    try {
      const silence = context.createBufferSource();
      silence.buffer = context.createBuffer(1, 1, context.sampleRate);
      silence.connect(context.destination);
      silence.start();
    } catch {
      // A context that refuses this is one that was closed under us; the next
      // cue rebuilds everything anyway.
    }
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

    // latencyHint "interactive" asks the platform for the smallest buffer it
    // will give us. The default is the same on Chromium today, but this is a
    // notification path — being explicit costs nothing and the default is not
    // promised.
    this.audioContext = new Ctx({ latencyHint: "interactive" });

    // A context does not only start suspended, it can GO suspended: switching
    // the default output device, an exclusive-mode app taking the endpoint,
    // the machine sleeping. Nothing resumed it afterwards, so the cues went
    // quiet or arrived late for the rest of the session and the only fix was a
    // restart. Now the context puts itself back.
    this.audioContext.addEventListener("statechange", () => {
      if (this.audioContext?.state === "suspended" && this.enabled) {
        void this.audioContext.resume().catch(() => undefined);
      }
    });

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
    /**
     * Which cue this is. Two of the same inside COALESCE_WINDOW_MS play once:
     * a roster snapshot that brings three people in at once used to start three
     * identical chimes on the same millisecond, which is not three chimes, it
     * is one smeared noise with the compressor pumping under it.
     */
    key?: string,
  ): void {
    const context = this.getAudioContext();
    if (!this.enabled || !context || pattern.length === 0) {
      return;
    }

    const wallClock = Date.now();
    if (key) {
      const lastPlayedAt = this.lastPlayedAtByKey.get(key) ?? 0;
      if (wallClock - lastPlayedAt < COALESCE_WINDOW_MS) {
        return;
      }
      this.lastPlayedAtByKey.set(key, wallClock);
    }

    // A suspended context has a stopped clock, so scheduling against it lands
    // every ramp in the past and the cue arrives clipped, late, or not at all.
    // Resume first and schedule in the callback; the await is a frame or two
    // when the device is already warm, which is what prime() is for.
    if (context.state !== "running") {
      void context
        .resume()
        .then(() => this.schedulePattern(context, pattern, destination))
        .catch(() => undefined);
      return;
    }

    this.schedulePattern(context, pattern, destination);
  }

  private schedulePattern(
    context: AudioContext,
    pattern: OscillatorTone[],
    destination: "cue" | "emote",
  ): void {
    if (!this.enabled || context.state === "closed") {
      return;
    }

    const outputNode =
      destination === "emote"
        ? this.getEmoteOutputNode(context)
        : this.getOutputNode(context);

    // Scheduled a hair ahead rather than at currentTime. An envelope that
    // starts in the past is applied from wherever the audio thread has already
    // got to, which is what turned the attack into a click and sometimes ate
    // the first note outright.
    const now = context.currentTime + SCHEDULE_LEAD_SECONDS;
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

      // Attack, body, tail.
      //
      // The tail is the whole difference between a notification and a beep.
      // Every cue used to end 30ms after its body with an exponential slammed
      // to silence, which is why they had to be kept so quiet to be bearable —
      // a sound that stops dead is harsh at any volume. Giving the cues a real
      // release lets them be two or three times louder AND softer at once, and
      // it costs one scheduled ramp.
      gain.gain.setValueAtTime(0.0001, cursor);
      const bodySeconds = tone.durationMs / 1000;
      // Unstated attack keeps the old proportional shape, so the percussive
      // emote patterns — which were tuned against it — are untouched by all of
      // this. The cues state theirs.
      const defaultAttackSeconds = Math.min(0.026, bodySeconds * 0.3);
      const attackSeconds = Math.max(
        0.003,
        Math.min(
          tone.attackMs === undefined
            ? defaultAttackSeconds
            : tone.attackMs / 1000,
          bodySeconds * 0.6,
        ),
      );
      const bodyEndAt = cursor + bodySeconds;
      const releaseSeconds = Math.max(0.012, (tone.releaseMs ?? 30) / 1000);
      const endAt = bodyEndAt + releaseSeconds;

      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, tone.gain),
        cursor + attackSeconds,
      );
      // A slight fall across the body, so a held note breathes instead of
      // sitting flat like a dial tone.
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, tone.gain * 0.68),
        bodyEndAt,
      );
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

      // From the END OF THE BODY, not the end of the tail: the next note starts
      // while this one is still ringing. Emote patterns are unaffected — their
      // tail is the 30ms default, so this is the same arithmetic they were
      // written against.
      cursor = bodyEndAt + (tone.pauseAfterMs ?? 22) / 1000;
    }
  }

  /** You walked into a room: the full three-note chime. */
  public playSelfJoinedLobby(): void {
    this.playPattern(CUE_PATTERNS.selfJoinedLobby, "cue", "selfJoinedLobby");
  }

  /** You walked out: the same three notes, the other way up. */
  public playSelfLeftLobby(): void {
    this.playPattern(CUE_PATTERNS.selfLeftLobby, "cue", "selfLeftLobby");
  }

  public playMemberJoined(): void {
    this.playPattern(CUE_PATTERNS.memberJoined, "cue", "memberJoined");
  }

  public playMemberLeft(): void {
    this.playPattern(CUE_PATTERNS.memberLeft, "cue", "memberLeft");
  }

  public playCameraEnabled(): void {
    this.playPattern(CUE_PATTERNS.cameraEnabled, "cue", "cameraEnabled");
  }

  public playScreenEnabled(): void {
    this.playPattern(CUE_PATTERNS.screenEnabled, "cue", "screenEnabled");
  }

  /** Somebody started watching a share you are broadcasting or watching. */
  public playStreamViewerJoined(): void {
    this.playPattern(CUE_PATTERNS.streamViewerJoined, "cue", "streamViewerJoined");
  }

  /** You started watching somebody else's share. */
  public playStreamWatchStarted(): void {
    this.playPattern(CUE_PATTERNS.streamWatchStarted, "cue", "streamWatchStarted");
  }

  public playMicToggle(enabled: boolean): void {
    this.playPattern(enabled ? CUE_PATTERNS.micOn : CUE_PATTERNS.micOff);
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

  /**
   * A sound from the table: a card thrown, a tile put down, a shell landing.
   *
   * Routed as a "cue" rather than through the soundboard gain, because this is
   * feedback about the game in front of you and not somebody else's noise.
   * Keyed, so a snapshot that lands two of the same event on the same
   * millisecond -- which the table hub does when a turn resolves several
   * things at once -- is one sound rather than a smeared double.
   */
  public playMinigameCue(cue: MinigameCue): void {
    this.playPattern(MINIGAME_PATTERNS[cue], "cue", `minigame:${cue}`);
  }

  public playHeadphoneToggle(enabled: boolean): void {
    this.playPattern(
      enabled ? CUE_PATTERNS.headphoneOn : CUE_PATTERNS.headphoneOff,
    );
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
