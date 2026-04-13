import {
  Track,
  type AudioProcessorOptions,
  type TrackProcessor,
} from "livekit-client";
import {
  RnnoiseWorkletNode,
  loadRnnoise,
} from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

interface ProcessorGraph {
  sourceNode: MediaStreamAudioSourceNode;
  rnnoiseNode: RnnoiseWorkletNode;
  destinationNode: MediaStreamAudioDestinationNode;
}

export class RnnoiseTrackProcessorFactory {
  private readonly loadedWorklets = new WeakSet<AudioContext>();
  private rnnoiseWasmBinaryPromise: Promise<ArrayBuffer> | null = null;

  public constructor(private readonly onWarning?: (message: string) => void) {}

  public async createProcessor(): Promise<TrackProcessor<
    Track.Kind.Audio,
    AudioProcessorOptions
  > | null> {
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
        graph.rnnoiseNode.disconnect();
      } catch {
        // no-op
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
          await this.ensureWorkletRegistered(opts.audioContext);
          const wasmBinary = await this.getRnnoiseWasmBinary();

          const sourceNode = opts.audioContext.createMediaStreamSource(
            new MediaStream([opts.track]),
          );
          const rnnoiseNode = new RnnoiseWorkletNode(opts.audioContext, {
            maxChannels: 1,
            wasmBinary,
          });
          const destinationNode =
            opts.audioContext.createMediaStreamDestination();

          sourceNode.connect(rnnoiseNode);
          rnnoiseNode.connect(destinationNode);

          const processedTrack = destinationNode.stream.getAudioTracks()[0];
          processor.processedTrack = processedTrack ?? opts.track;
          graph = { sourceNode, rnnoiseNode, destinationNode };

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
  ): Promise<void> {
    if (this.loadedWorklets.has(audioContext)) {
      return;
    }

    await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
    this.loadedWorklets.add(audioContext);
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
