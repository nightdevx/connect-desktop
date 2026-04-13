import {
  Track,
  type AudioProcessorOptions,
  type TrackProcessor,
} from "livekit-client";
import {
  NoiseGateWorkletNode,
  RnnoiseWorkletNode,
  loadRnnoise,
} from "@sapphi-red/web-noise-suppressor";
import noiseGateWorkletPath from "@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

interface ProcessorGraph {
  sourceNode: MediaStreamAudioSourceNode;
  inputHighPassNode: BiquadFilterNode;
  rnnoiseNode: RnnoiseWorkletNode;
  outputLowPassNode: BiquadFilterNode;
  noiseGateNode: NoiseGateWorkletNode | null;
  destinationNode: MediaStreamAudioDestinationNode;
}

interface WorkletAvailability {
  noiseGateSupported: boolean;
}

export type NoiseSuppressionPreset = "natural" | "balanced" | "aggressive";

interface RnnoiseProcessingProfile {
  inputHighPassHz: number;
  outputLowPassHz: number;
  gateOpenThresholdDb: number;
  gateCloseThresholdDb: number;
  gateHoldMs: number;
}

const RNNOISE_PROCESSING_PROFILES: Record<
  NoiseSuppressionPreset,
  RnnoiseProcessingProfile
> = {
  natural: {
    inputHighPassHz: 90,
    outputLowPassHz: 9000,
    gateOpenThresholdDb: -60,
    gateCloseThresholdDb: -66,
    gateHoldMs: 110,
  },
  balanced: {
    inputHighPassHz: 110,
    outputLowPassHz: 7600,
    gateOpenThresholdDb: -52,
    gateCloseThresholdDb: -58,
    gateHoldMs: 140,
  },
  aggressive: {
    inputHighPassHz: 140,
    outputLowPassHz: 6800,
    gateOpenThresholdDb: -46,
    gateCloseThresholdDb: -52,
    gateHoldMs: 190,
  },
};

const resolveProcessingProfile = (
  preset: NoiseSuppressionPreset,
): RnnoiseProcessingProfile => {
  return (
    RNNOISE_PROCESSING_PROFILES[preset] ?? RNNOISE_PROCESSING_PROFILES.balanced
  );
};

export class RnnoiseTrackProcessorFactory {
  private readonly loadedWorklets = new WeakMap<
    AudioContext,
    WorkletAvailability
  >();
  private rnnoiseWasmBinaryPromise: Promise<ArrayBuffer> | null = null;

  public constructor(private readonly onWarning?: (message: string) => void) {}

  public async createProcessor(
    preset: NoiseSuppressionPreset = "balanced",
  ): Promise<TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | null> {
    if (!this.isSupported()) {
      return null;
    }

    let graph: ProcessorGraph | null = null;

    const destroyGraph = (): void => {
      if (!graph) {
        return;
      }

      try {
        graph.sourceNode.disconnect();
      } catch {
        // no-op
      }

      try {
        graph.inputHighPassNode.disconnect();
      } catch {
        // no-op
      }

      try {
        graph.rnnoiseNode.disconnect();
      } catch {
        // no-op
      }

      try {
        graph.outputLowPassNode.disconnect();
      } catch {
        // no-op
      }

      if (graph.noiseGateNode) {
        try {
          graph.noiseGateNode.disconnect();
        } catch {
          // no-op
        }
      }

      try {
        graph.rnnoiseNode.destroy();
      } catch {
        // no-op
      }

      try {
        graph.destinationNode.disconnect();
      } catch {
        // no-op
      }

      graph = null;
    };

    const processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
      name: "rnnoise-track-processor",
      init: async (opts) => {
        destroyGraph();

        try {
          const profile = resolveProcessingProfile(preset);
          const workletAvailability = await this.ensureWorkletRegistered(
            opts.audioContext,
          );
          const wasmBinary = await this.getRnnoiseWasmBinary();

          const sourceNode = opts.audioContext.createMediaStreamSource(
            new MediaStream([opts.track]),
          );
          const inputHighPassNode = opts.audioContext.createBiquadFilter();
          inputHighPassNode.type = "highpass";
          inputHighPassNode.frequency.value = profile.inputHighPassHz;
          inputHighPassNode.Q.value = 0.707;

          const rnnoiseNode = new RnnoiseWorkletNode(opts.audioContext, {
            maxChannels: 1,
            wasmBinary,
          });

          const outputLowPassNode = opts.audioContext.createBiquadFilter();
          outputLowPassNode.type = "lowpass";
          outputLowPassNode.frequency.value = profile.outputLowPassHz;
          outputLowPassNode.Q.value = 0.707;

          const noiseGateNode = workletAvailability.noiseGateSupported
            ? new NoiseGateWorkletNode(opts.audioContext, {
                openThreshold: profile.gateOpenThresholdDb,
                closeThreshold: profile.gateCloseThresholdDb,
                holdMs: profile.gateHoldMs,
                maxChannels: 1,
              })
            : null;

          const destinationNode =
            opts.audioContext.createMediaStreamDestination();

          sourceNode.connect(inputHighPassNode);
          inputHighPassNode.connect(rnnoiseNode);
          rnnoiseNode.connect(outputLowPassNode);
          if (noiseGateNode) {
            outputLowPassNode.connect(noiseGateNode);
            noiseGateNode.connect(destinationNode);
          } else {
            outputLowPassNode.connect(destinationNode);
          }

          const processedTrack = destinationNode.stream.getAudioTracks()[0];
          processor.processedTrack = processedTrack ?? opts.track;
          graph = {
            sourceNode,
            inputHighPassNode,
            rnnoiseNode,
            outputLowPassNode,
            noiseGateNode,
            destinationNode,
          };

          if (opts.audioContext.state === "suspended") {
            await opts.audioContext.resume();
          }
        } catch (error) {
          this.onWarning?.(
            `RNNoise işleme zinciri başlatılamadı, tarayıcı filtrelerine geri dönüldü: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
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

  private async ensureWorkletRegistered(
    audioContext: AudioContext,
  ): Promise<WorkletAvailability> {
    const cached = this.loadedWorklets.get(audioContext);
    if (cached) {
      return cached;
    }

    await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);

    let noiseGateSupported = true;
    try {
      await audioContext.audioWorklet.addModule(noiseGateWorkletPath);
    } catch (error) {
      noiseGateSupported = false;
      this.onWarning?.(
        `Noise gate modülü yüklenemedi, sadece RNNoise ile devam ediliyor: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
      );
    }

    const availability: WorkletAvailability = { noiseGateSupported };
    this.loadedWorklets.set(audioContext, availability);
    return availability;
  }

  private async getRnnoiseWasmBinary(): Promise<ArrayBuffer> {
    if (!this.rnnoiseWasmBinaryPromise) {
      this.rnnoiseWasmBinaryPromise = loadRnnoise({
        url: rnnoiseWasmPath,
        simdUrl: rnnoiseSimdWasmPath,
      });
    }

    return this.rnnoiseWasmBinaryPromise;
  }
}
