import { logLiveKitDebug } from "../livekit";
import {
  MicrophoneTrackProcessorFactory,
  type MicrophoneProcessor,
} from "./processor";
import { type NoiseSuppressionPreset } from "./types";

interface ActiveProcessorKey {
  preset: NoiseSuppressionPreset;
  noiseSuppressionEnabled: boolean;
}

export class ProcessorManager {
  private activeMicrophoneProcessor: MicrophoneProcessor | null = null;
  private activeKey: ActiveProcessorKey | null = null;
  private gainPercent = 100;
  private readonly processorFactory: MicrophoneTrackProcessorFactory;

  public constructor(private readonly onWarning?: (message: string) => void) {
    this.processorFactory = new MicrophoneTrackProcessorFactory(this.onWarning);
  }

  /**
   * Microphone volume, applied live to the running graph. Kept here rather than
   * as part of the processor key so changing the slider never rebuilds the
   * audio graph — a rebuild is an audible gap mid-sentence.
   */
  public setGainPercent(percent: number): void {
    this.gainPercent = percent;
    this.activeMicrophoneProcessor?.setGainPercent(percent);
  }

  public async getOrCreateProcessor(
    preset: NoiseSuppressionPreset,
    noiseSuppressionEnabled: boolean,
  ): Promise<MicrophoneProcessor | null> {
    const matchesActive =
      this.activeKey?.preset === preset &&
      this.activeKey?.noiseSuppressionEnabled === noiseSuppressionEnabled;

    if (this.activeMicrophoneProcessor && matchesActive) {
      logLiveKitDebug("mic-controller", "processor-reused", { preset });
      return this.activeMicrophoneProcessor;
    }

    if (this.activeMicrophoneProcessor) {
      logLiveKitDebug("mic-controller", "processor-config-changed", {
        from: this.activeKey,
        to: { preset, noiseSuppressionEnabled },
      });
      await this.destroyActiveProcessor();
    }

    const processor = await this.processorFactory.createProcessor({
      preset,
      noiseSuppressionEnabled,
      gainPercent: this.gainPercent,
    });

    if (!processor) {
      this.onWarning?.(
        "AudioWorklet desteklenmediği için mikrofon işleme zinciri devreye alınamadı.",
      );
      logLiveKitDebug("mic-controller", "processor-unavailable", { preset });
      return null;
    }

    this.activeMicrophoneProcessor = processor;
    this.activeKey = { preset, noiseSuppressionEnabled };
    logLiveKitDebug("mic-controller", "processor-created", {
      name: processor.name,
      preset,
      noiseSuppressionEnabled,
    });
    return processor;
  }

  public isNoiseSuppressionActive(): boolean {
    return this.activeMicrophoneProcessor?.isNoiseSuppressionActive() ?? false;
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
    this.activeKey = null;
    logLiveKitDebug("mic-controller", "processor-destroyed", {
      name: processorName,
    });
  }
}
