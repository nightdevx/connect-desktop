import {
  Track,
  type AudioProcessorOptions,
  type TrackProcessor,
} from "livekit-client";
import { logLiveKitDebug } from "../livekit";
import { RnnoiseTrackProcessorFactory } from "./processor";
import { type NoiseSuppressionPreset } from "./types";

export class ProcessorManager {
  private activeMicrophoneProcessor: TrackProcessor<
    Track.Kind.Audio,
    AudioProcessorOptions
  > | null = null;
  private activeMicrophoneProcessorPreset: NoiseSuppressionPreset | null = null;
  private readonly rnnoiseProcessorFactory: RnnoiseTrackProcessorFactory;

  public constructor(private readonly onWarning?: (message: string) => void) {
    this.rnnoiseProcessorFactory = new RnnoiseTrackProcessorFactory(
      this.onWarning,
    );
  }

  public async getOrCreateProcessor(
    preset: NoiseSuppressionPreset,
  ): Promise<TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | null> {
    if (
      this.activeMicrophoneProcessor &&
      this.activeMicrophoneProcessorPreset === preset
    ) {
      logLiveKitDebug("mic-controller", "processor-reused", { preset });
      return this.activeMicrophoneProcessor;
    }

    if (
      this.activeMicrophoneProcessor &&
      this.activeMicrophoneProcessorPreset !== preset
    ) {
      logLiveKitDebug("mic-controller", "processor-preset-changed", {
        from: this.activeMicrophoneProcessorPreset,
        to: preset,
      });
      await this.destroyActiveProcessor();
    }

    const processor =
      await this.rnnoiseProcessorFactory.createProcessor(preset);
    if (!processor) {
      this.onWarning?.(
        "AudioWorklet desteklenmediği için RNNoise devreye alınamadı, tarayıcı filtreleri kullanılıyor.",
      );
      logLiveKitDebug("mic-controller", "processor-unavailable", { preset });
      return null;
    }

    this.activeMicrophoneProcessor = processor;
    this.activeMicrophoneProcessorPreset = preset;
    logLiveKitDebug("mic-controller", "processor-created", {
      name: processor.name,
      preset,
    });
    return processor;
  }

  public async destroyActiveProcessor(): Promise<void> {
    if (!this.activeMicrophoneProcessor) {
      return;
    }

    const processorName = this.activeMicrophoneProcessor.name;

    try {
      await this.activeMicrophoneProcessor.destroy();
    } catch {
      // no-op
    }

    this.activeMicrophoneProcessor = null;
    this.activeMicrophoneProcessorPreset = null;
    logLiveKitDebug("mic-controller", "processor-destroyed", {
      name: processorName,
    });
  }
}
