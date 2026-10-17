import {
  Track,
  type AudioProcessorOptions,
  type TrackProcessor,
} from "livekit-client";
import { logLiveKitDebug } from "@/services/debug-log";
import voiceWorkletPath from "./voice-worklet.js?url";
import rnnoiseWasmPath from "./assets/rnnoise.wasm?url";
import { type NoiseSuppressionPreset } from "./types";

// voice-worklet.js registers this name.
const VOICE_PROCESSOR = "connect-voice";

/** What the worklet reports once a second (voice-worklet.js report()). */
export interface VoiceProcessorStats {
  model: string;
  frames: number;
  meanMs: number;
  p99Ms: number;
  maxMs: number;
  underruns: number;
  vadMean: number;
  /** Share of the second's frames the voice gate let through. */
  gateOpenRatio: number;
  /** "date": whole-millisecond timing, so p99Ms and maxMs move in 1 ms steps. */
  clock: "performance" | "date";
}

// A microphone processor that always runs, whether or not noise suppression is
// on. It owns the output gain, which is why it is unconditional: the user's
// microphone volume slider previously fed a GainNode wired only to the level
// meter, so moving it changed the meter and nothing else — the published audio
// never saw it.
//
// Chain: source -> highpass -> [voice worklet] -> gain -> limiter
//
// The voice worklet (voice-worklet.js) is the app's own: RNNoise 0.2, built
// from Xiph's release as a bare .wasm (assets/README.md). The model was
// RNNoise's 2017 one, bundled by @sapphi-red/web-noise-suppressor; on the
// noise test bench 0.2 lets keyboard noise through in 6% of the pauses between
// words instead of 19%. The worklet also gates, with its default settings:
// between phrases it sends true silence, so Opus DTX stops sending packets.
//
// The limiter is what makes gain above 100% safe; without it, boosting a hot
// microphone just clips into the encoder.
//
// Worklet files must stay above Vite's inline limit, or they are inlined as
// data: URLs that the app's CSP (script-src 'self') refuses. An earlier noise
// gate was lost that way in every production build; vite.config.ts now never
// inlines .js or .wasm assets.

export interface MicrophoneProcessor
  extends TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  /** Live gain update, no track renegotiation. `percent` is 0-200. */
  setGainPercent: (percent: number) => void;
  /** Whether RNNoise actually came up (it can fail and fall back). */
  isNoiseSuppressionActive: () => boolean;
  /** The worklet's latest one-second report, null before the first. */
  getStats: () => VoiceProcessorStats | null;
}

interface ProcessorGraph {
  sourceNode: MediaStreamAudioSourceNode;
  inputHighPassNode: BiquadFilterNode;
  rnnoiseNode: AudioWorkletNode | null;
  gainNode: GainNode;
  limiterNode: DynamicsCompressorNode;
  destinationNode: MediaStreamAudioDestinationNode;
}

interface RnnoiseProcessingProfile {
  inputHighPassHz: number;
  /** voice-worklet.js: how far noise is lowered at most; 0 is no limit. */
  attenLimitDb: number;
  /** How long the voice gate stays open after the last voiced frame. */
  gateHoldMs: number;
}

// A lowpass after RNNoise (13-16 kHz by preset) used to be the only thing
// telling the presets apart. On the noise test bench removing it changed no
// score, so it is gone. Measured there instead: a 12 dB limit keeps some of
// the room in Doğal (background score 3.59 against 3.83 unlimited, speech
// 3.41 against 3.33). Agresif closes the gate 100 ms sooner, which lets mouse
// clicks through in 8.7% of pauses instead of 9.7%; RNNoise has nothing
// stronger to give it, DeepFilterNet will.
const RNNOISE_PROCESSING_PROFILES: Record<
  NoiseSuppressionPreset,
  RnnoiseProcessingProfile
> = {
  natural: {
    inputHighPassHz: 80,
    attenLimitDb: 12,
    gateHoldMs: 250,
  },
  balanced: {
    inputHighPassHz: 100,
    attenLimitDb: 0,
    gateHoldMs: 250,
  },
  aggressive: {
    inputHighPassHz: 120,
    attenLimitDb: 0,
    gateHoldMs: 150,
  },
};

const clampGainPercent = (percent: number): number => {
  if (!Number.isFinite(percent)) {
    return 1;
  }
  return Math.min(200, Math.max(0, percent)) / 100;
};

const configureLimiter = (node: DynamicsCompressorNode): void => {
  // Brick-wall-ish: catches peaks introduced by boosting without audibly
  // compressing normal speech.
  node.threshold.value = -3;
  node.knee.value = 0;
  node.ratio.value = 20;
  node.attack.value = 0.003;
  node.release.value = 0.25;
};

const resolveProcessingProfile = (
  preset: NoiseSuppressionPreset,
): RnnoiseProcessingProfile => {
  return (
    RNNOISE_PROCESSING_PROFILES[preset] ?? RNNOISE_PROCESSING_PROFILES.balanced
  );
};

export interface MicrophoneProcessorOptions {
  preset: NoiseSuppressionPreset;
  /** When false the graph is gain + limiter only, no RNNoise. */
  noiseSuppressionEnabled: boolean;
  gainPercent: number;
}

export class MicrophoneTrackProcessorFactory {
  private rnnoiseModulePromise: Promise<WebAssembly.Module> | null = null;
  private wasmCompilationAllowed: boolean | null = null;
  private warnedAboutWasmCspBlock = false;

  public constructor(private readonly onWarning?: (message: string) => void) {}

  /**
   * Loads everything RNNoise needs, and reports whether it is actually usable.
   *
   * This exists because of WHEN the loading used to happen. createProcessor only
   * builds an object; the two AudioWorklet modules and the RNNoise WASM were
   * fetched and compiled inside init(), which LiveKit calls from setProcessor —
   * and setProcessor ran AFTER the microphone was already published and live.
   *
   * The capture constraints make that gap audible rather than merely late: when
   * enhanced suppression is on, the browser's own noise suppression and (on the
   * stronger presets) its automatic gain control are deliberately switched off,
   * because RNNoise is meant to own them. So for as long as the worklets and the
   * WASM took to load — a cold first join, before anything is cached — the room
   * heard a raw, ungated microphone at whatever level the hardware produced,
   * ignoring the user's own volume setting, and then heard it abruptly change
   * character when the processor finally attached. That is the "everyone sounds
   * like they have an effect on them when I first join the lobby" report.
   *
   * Both halves are idempotent and cached, so paying for them here costs nothing
   * later; it only moves the cost to before the first packet goes out.
   */
  public async prewarm(
    audioContext: AudioContext,
    noiseSuppressionEnabled: boolean,
  ): Promise<boolean> {
    if (!this.isSupported() || !noiseSuppressionEnabled) {
      return false;
    }

    // RNNoise is a 48 kHz model. Feeding it a context running at anything else
    // does not fail — it denoises the wrong frequencies and returns a voice with
    // shifted formants, which is heard as an effect rather than as a bug. The
    // context asks for 48 kHz and only falls back to the device default if that
    // is refused, so this is the guard on that fallback.
    if (audioContext.sampleRate !== 48000) {
      logLiveKitDebug("mic-controller", "processor-prewarm-wrong-sample-rate", {
        sampleRate: audioContext.sampleRate,
      });
      this.onWarning?.(
        `Ses aygıtı ${audioContext.sampleRate} Hz çalışıyor; RNNoise 48 kHz gerektirdiği için tarayıcı gürültü filtresi kullanılıyor.`,
      );
      return false;
    }

    if (!(await this.isWasmCompilationAllowed())) {
      return false;
    }

    try {
      await this.ensureWorkletRegistered(audioContext);
      await this.getRnnoiseModule();
      return true;
    } catch (error) {
      logLiveKitDebug("mic-controller", "processor-prewarm-failed", { error });
      return false;
    }
  }

  public async createProcessor(
    options: MicrophoneProcessorOptions,
  ): Promise<MicrophoneProcessor | null> {
    if (!this.isSupported()) {
      return null;
    }

    const { preset, noiseSuppressionEnabled } = options;
    let gainPercent = options.gainPercent;

    // The caller has already established this through prewarm, and the capture
    // constraints were chosen from the same answer. Re-deciding it here is how
    // the graph and the constraints came to disagree; the WASM check stays as a
    // cheap backstop for a processor built without a prewarm.
    //
    // RNNoise needs WASM; the gain/limiter half of the chain does not, so a
    // CSP-blocked WASM only costs noise suppression, not the volume control.
    const canUseRnnoise =
      noiseSuppressionEnabled && (await this.isWasmCompilationAllowed());

    let graph: ProcessorGraph | null = null;
    // The context the chain was first built on. LiveKit calls restart() on its
    // own whenever it re-acquires the microphone: a device unplugged mid-call,
    // or a device change that waited for unmute. It passes no context there, and
    // without one the chain came back as a passthrough. The room then heard the
    // raw microphone, with the browser's suppressor switched off because RNNoise
    // was meant to be running, until the next rejoin.
    let chainContext: AudioContext | null = null;
    let stats: VoiceProcessorStats | null = null;

    const destroyGraph = (): void => {
      if (!graph) {
        return;
      }

      try {
        const track = graph.destinationNode.stream.getAudioTracks()[0];
        track?.stop();
      } catch (error) {
        console.warn("[MicProcessor] Failed to stop destination track:", error);
      }

      const disconnectables: (AudioNode | null)[] = [
        graph.sourceNode,
        graph.inputHighPassNode,
        graph.rnnoiseNode,
        graph.gainNode,
        graph.limiterNode,
        graph.destinationNode,
      ];

      for (const node of disconnectables) {
        try {
          node?.disconnect();
        } catch {
          // no-op
        }
      }

      // Frees the model's state inside the worklet; the node itself goes with
      // the graph.
      graph.rnnoiseNode?.port.postMessage({ type: "destroy" });

      graph = null;
    };

    const processor: MicrophoneProcessor = {
      name: "connect-microphone-processor",
      setGainPercent: (percent: number) => {
        gainPercent = percent;
        if (graph) {
          graph.gainNode.gain.value = clampGainPercent(percent);
        }
      },
      isNoiseSuppressionActive: () => Boolean(graph?.rnnoiseNode),
      getStats: () => stats,
      init: async (opts) => {
        destroyGraph();

        const context = opts.audioContext ?? chainContext;
        if (!context) {
          logLiveKitDebug("mic-controller", "processor-init-skipped", {
            reason: "audio-context-missing",
          });
          processor.processedTrack = opts.track;
          return;
        }
        chainContext = context;

        try {
          const profile = resolveProcessingProfile(preset);
          logLiveKitDebug("mic-controller", "processor-init-profile", {
            preset,
            noiseSuppression: canUseRnnoise,
            gainPercent,
            highPass: `${profile.inputHighPassHz}Hz`,
            attenLimitDb: profile.attenLimitDb,
            gateHoldMs: profile.gateHoldMs,
          });

          const sourceNode = context.createMediaStreamSource(
            new MediaStream([opts.track]),
          );
          const inputHighPassNode = context.createBiquadFilter();
          inputHighPassNode.type = "highpass";
          inputHighPassNode.frequency.value = profile.inputHighPassHz;
          inputHighPassNode.Q.value = 0.707;

          const gainNode = context.createGain();
          gainNode.gain.value = clampGainPercent(gainPercent);

          const limiterNode = context.createDynamicsCompressor();
          configureLimiter(limiterNode);

          const destinationNode = context.createMediaStreamDestination();
          // Defaults to 2. Every stage in front of it is mono — the capture asks
          // for channelCount 1, the voice worklet has outputChannelCount [1] —
          // so the default published a stereo microphone track
          // whose second channel was never anything but a copy, and handed the
          // receiver a layout it then had to guess at. One channel in, one out.
          destinationNode.channelCount = 1;

          let rnnoiseNode: AudioWorkletNode | null = null;

          if (canUseRnnoise) {
            try {
              await this.ensureWorkletRegistered(context);
              const wasmModule = await this.getRnnoiseModule();

              // Mono in, mono out: the model denoises one channel, and a
              // stereo input would be down-mixed here rather than half-ignored.
              rnnoiseNode = new AudioWorkletNode(context, VOICE_PROCESSOR, {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                channelCount: 1,
                channelCountMode: "explicit",
                outputChannelCount: [1],
                processorOptions: {
                  model: "rnnoise",
                  wasmModule,
                  attenLimitDb: profile.attenLimitDb,
                  gate: { holdMs: profile.gateHoldMs },
                },
              });
              rnnoiseNode.port.onmessage = (event: MessageEvent) => {
                if (event.data?.type !== "stats") {
                  return;
                }
                stats = event.data as VoiceProcessorStats;
                // A missed quantum is an audible click; a slow frame is the
                // warning before it. Neither is expected on any machine with
                // RNNoise, so both are worth a line in the debug log.
                if (stats.underruns > 0 || stats.p99Ms > 5) {
                  logLiveKitDebug("mic-controller", "voice-worklet-slow", { ...stats });
                }
              };
            } catch (error) {
              // Degrade to gain + limiter rather than losing the mic entirely.
              rnnoiseNode = null;
              this.onWarning?.(
                `RNNoise başlatılamadı, mikrofon filtresiz yayınlanıyor: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
              );
            }
          }

          // Wire the chain, skipping whichever optional stages are absent.
          let tail: AudioNode = inputHighPassNode;
          sourceNode.connect(inputHighPassNode);
          if (rnnoiseNode) {
            tail.connect(rnnoiseNode);
            tail = rnnoiseNode;
          }
          tail.connect(gainNode);
          gainNode.connect(limiterNode);
          limiterNode.connect(destinationNode);

          const processedTrack = destinationNode.stream.getAudioTracks()[0];
          processor.processedTrack = processedTrack ?? opts.track;
          graph = {
            sourceNode,
            inputHighPassNode,
            rnnoiseNode,
            gainNode,
            limiterNode,
            destinationNode,
          };

          if (context.state === "suspended") {
            await context.resume();
          }
        } catch (error) {
          this.onWarning?.(
            `Mikrofon işleme zinciri başlatılamadı, ham mikrofon yayınlanıyor: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
          );
          processor.processedTrack = opts.track;
        }
      },
      restart: async (opts) => {
        await processor.init(opts);
      },
      destroy: async () => {
        destroyGraph();
        processor.processedTrack = undefined;
      },
    };

    return processor;
  }

  private isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof AudioWorkletNode !== "undefined" &&
      typeof AudioContext !== "undefined"
    );
  }

  private readonly registrationPromises = new WeakMap<
    AudioContext,
    Promise<void>
  >();

  private async ensureWorkletRegistered(
    audioContext: AudioContext,
  ): Promise<void> {
    if (!audioContext || !audioContext.audioWorklet) {
      throw new Error("Invalid AudioContext provided for voice worklet registration");
    }

    const existingPromise = this.registrationPromises.get(audioContext);
    if (existingPromise) {
      return existingPromise;
    }

    const registrationPromise =
      audioContext.audioWorklet.addModule(voiceWorkletPath);

    // Clear the cache on failure so a later attempt can retry.
    registrationPromise.catch(() => {
      if (this.registrationPromises.get(audioContext) === registrationPromise) {
        this.registrationPromises.delete(audioContext);
      }
    });

    this.registrationPromises.set(audioContext, registrationPromise);
    return registrationPromise;
  }

  /**
   * Compiled here, on the main thread and asynchronously, then handed to the
   * worklet already compiled: compiling 1.5 MB inside the worklet would stall
   * the audio thread. Once per session; every processor reuses the module.
   */
  private async getRnnoiseModule(): Promise<WebAssembly.Module> {
    if (!this.rnnoiseModulePromise) {
      this.rnnoiseModulePromise = fetch(rnnoiseWasmPath)
        .then((response) => response.arrayBuffer())
        .then((bytes) => WebAssembly.compile(bytes))
        .catch((error: unknown) => {
          this.rnnoiseModulePromise = null;
          throw error;
        });
    }

    return this.rnnoiseModulePromise;
  }

  private async isWasmCompilationAllowed(): Promise<boolean> {
    if (this.wasmCompilationAllowed != null) {
      return this.wasmCompilationAllowed;
    }

    if (
      typeof WebAssembly === "undefined" ||
      typeof WebAssembly.compile !== "function"
    ) {
      this.wasmCompilationAllowed = false;
      return false;
    }

    const emptyWasmModule = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ]);

    try {
      await WebAssembly.compile(emptyWasmModule);
      this.wasmCompilationAllowed = true;
    } catch (error) {
      this.wasmCompilationAllowed = false;

      if (!this.warnedAboutWasmCspBlock) {
        this.warnedAboutWasmCspBlock = true;
        this.onWarning?.(
          `RNNoise WASM CSP nedeniyle başlatılamadı, tarayıcı filtrelerine geri dönüldü: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
        );
      }
    }

    return this.wasmCompilationAllowed;
  }
}
