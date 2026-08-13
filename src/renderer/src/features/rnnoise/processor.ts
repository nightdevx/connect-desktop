import {
  Track,
  type AudioProcessorOptions,
  type TrackProcessor,
} from "livekit-client";
import { logLiveKitDebug } from "../livekit";
import {
  NoiseGateWorkletNode,
  RnnoiseWorkletNode,
  loadRnnoise,
} from "@sapphi-red/web-noise-suppressor";
import noiseGateWorkletPath from "@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import { type NoiseSuppressionPreset } from "./types";

// A microphone processor that always runs, whether or not noise suppression is
// on. It owns the output gain, which is why it is unconditional: the user's
// microphone volume slider previously fed a GainNode wired only to the level
// meter, so moving it changed the meter and nothing else — the published audio
// never saw it.
//
// Chain: source -> highpass -> [rnnoise -> lowpass -> gate] -> gain -> limiter
//
// The limiter is what makes gain above 100% safe; without it, boosting a hot
// microphone just clips into the encoder.

export interface MicrophoneProcessor
  extends TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  /** Live gain update, no track renegotiation. `percent` is 0-200. */
  setGainPercent: (percent: number) => void;
  /** Whether RNNoise actually came up (it can fail and fall back). */
  isNoiseSuppressionActive: () => boolean;
}

interface ProcessorGraph {
  sourceNode: MediaStreamAudioSourceNode;
  inputHighPassNode: BiquadFilterNode;
  rnnoiseNode: RnnoiseWorkletNode | null;
  outputLowPassNode: BiquadFilterNode | null;
  noiseGateNode: NoiseGateWorkletNode | null;
  gainNode: GainNode;
  limiterNode: DynamicsCompressorNode;
  destinationNode: MediaStreamAudioDestinationNode;
}

interface WorkletAvailability {
  noiseGateSupported: boolean;
}

interface RnnoiseProcessingProfile {
  inputHighPassHz: number;
  outputLowPassHz: number;
  gateOpenThresholdDb: number;
  gateCloseThresholdDb: number;
  gateHoldMs: number;
}

// The output lowpass used to sit at 6.8-9 kHz, which cut speech down to
// telephone bandwidth and was the main reason the aggressive preset sounded
// muffled. Opus carries fullband audio; these corners only trim the top end
// where RNNoise artefacts live.
const RNNOISE_PROCESSING_PROFILES: Record<
  NoiseSuppressionPreset,
  RnnoiseProcessingProfile
> = {
  natural: {
    inputHighPassHz: 80,
    outputLowPassHz: 16_000,
    gateOpenThresholdDb: -60,
    gateCloseThresholdDb: -66,
    gateHoldMs: 110,
  },
  balanced: {
    inputHighPassHz: 100,
    outputLowPassHz: 15_000,
    gateOpenThresholdDb: -52,
    gateCloseThresholdDb: -58,
    gateHoldMs: 140,
  },
  aggressive: {
    inputHighPassHz: 120,
    outputLowPassHz: 13_000,
    gateOpenThresholdDb: -46,
    gateCloseThresholdDb: -52,
    gateHoldMs: 190,
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
  private rnnoiseWasmBinaryPromise: Promise<ArrayBuffer> | null = null;
  private wasmCompilationAllowed: boolean | null = null;
  private warnedAboutWasmCspBlock = false;

  public constructor(private readonly onWarning?: (message: string) => void) {}

  public async createProcessor(
    options: MicrophoneProcessorOptions,
  ): Promise<MicrophoneProcessor | null> {
    if (!this.isSupported()) {
      return null;
    }

    const { preset, noiseSuppressionEnabled } = options;
    let gainPercent = options.gainPercent;

    // RNNoise needs WASM; the gain/limiter half of the chain does not, so a
    // CSP-blocked WASM only costs noise suppression, not the volume control.
    const canUseRnnoise =
      noiseSuppressionEnabled && (await this.isWasmCompilationAllowed());

    let graph: ProcessorGraph | null = null;

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
        graph.outputLowPassNode,
        graph.noiseGateNode,
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

      try {
        graph.rnnoiseNode?.destroy();
      } catch {
        // no-op
      }

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
      init: async (opts) => {
        destroyGraph();

        if (!opts.audioContext) {
          logLiveKitDebug("mic-controller", "processor-init-skipped", {
            reason: "audio-context-missing",
          });
          processor.processedTrack = opts.track;
          return;
        }

        const context = opts.audioContext;

        try {
          const profile = resolveProcessingProfile(preset);
          logLiveKitDebug("mic-controller", "processor-init-profile", {
            preset,
            noiseSuppression: canUseRnnoise,
            gainPercent,
            highPass: `${profile.inputHighPassHz}Hz`,
            lowPass: `${profile.outputLowPassHz}Hz`,
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

          let rnnoiseNode: RnnoiseWorkletNode | null = null;
          let outputLowPassNode: BiquadFilterNode | null = null;
          let noiseGateNode: NoiseGateWorkletNode | null = null;

          if (canUseRnnoise) {
            try {
              const workletAvailability =
                await this.ensureWorkletRegistered(context);
              const wasmBinary = await this.getRnnoiseWasmBinary();

              rnnoiseNode = new RnnoiseWorkletNode(context, {
                maxChannels: 1,
                wasmBinary,
              });

              outputLowPassNode = context.createBiquadFilter();
              outputLowPassNode.type = "lowpass";
              outputLowPassNode.frequency.value = profile.outputLowPassHz;
              outputLowPassNode.Q.value = 0.707;

              noiseGateNode = workletAvailability.noiseGateSupported
                ? new NoiseGateWorkletNode(context, {
                    openThreshold: profile.gateOpenThresholdDb,
                    closeThreshold: profile.gateCloseThresholdDb,
                    holdMs: profile.gateHoldMs,
                    maxChannels: 1,
                  })
                : null;
            } catch (error) {
              // Degrade to gain + limiter rather than losing the mic entirely.
              rnnoiseNode = null;
              outputLowPassNode = null;
              noiseGateNode = null;
              this.onWarning?.(
                `RNNoise başlatılamadı, mikrofon filtresiz yayınlanıyor: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
              );
            }
          }

          // Wire the chain, skipping whichever optional stages are absent.
          let tail: AudioNode = inputHighPassNode;
          sourceNode.connect(inputHighPassNode);
          if (rnnoiseNode && outputLowPassNode) {
            tail.connect(rnnoiseNode);
            rnnoiseNode.connect(outputLowPassNode);
            tail = outputLowPassNode;
            if (noiseGateNode) {
              tail.connect(noiseGateNode);
              tail = noiseGateNode;
            }
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
            outputLowPassNode,
            noiseGateNode,
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
    Promise<WorkletAvailability>
  >();

  private async ensureWorkletRegistered(
    audioContext: AudioContext,
  ): Promise<WorkletAvailability> {
    if (!audioContext || !audioContext.audioWorklet) {
      throw new Error("Invalid AudioContext provided for RNNoise registration");
    }

    const existingPromise = this.registrationPromises.get(audioContext);
    if (existingPromise) {
      return existingPromise;
    }

    const registrationPromise: Promise<WorkletAvailability> = (async () => {
      await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);

      let noiseGateSupported = true;
      try {
        await audioContext.audioWorklet.addModule(noiseGateWorkletPath);
      } catch (error) {
        noiseGateSupported = false;
        console.warn(
          "[MicProcessor] Noise gate module failed to load, continuing without it.",
          error,
        );
      }

      return { noiseGateSupported };
    })();

    // Clear the cache on failure so a later attempt can retry.
    registrationPromise.catch(() => {
      if (this.registrationPromises.get(audioContext) === registrationPromise) {
        this.registrationPromises.delete(audioContext);
      }
    });

    this.registrationPromises.set(audioContext, registrationPromise);
    return registrationPromise;
  }

  private async getRnnoiseWasmBinary(): Promise<ArrayBuffer> {
    if (!this.rnnoiseWasmBinaryPromise) {
      this.rnnoiseWasmBinaryPromise = loadRnnoise({
        url: rnnoiseWasmPath,
        simdUrl: rnnoiseSimdWasmPath,
      }).catch((error) => {
        this.rnnoiseWasmBinaryPromise = null;
        throw error;
      });
    }

    return this.rnnoiseWasmBinaryPromise;
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
