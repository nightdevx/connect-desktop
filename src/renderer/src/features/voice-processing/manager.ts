import { logLiveKitDebug } from "@/services/debug-log";
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
  private noiseSuppressionReady = false;
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

  /**
   * Loads the worklets and the WASM up front, and reports whether RNNoise will
   * really run. Both answers matter to the caller: the loading has to finish
   * before the microphone is published, and a `false` means the browser's own
   * noise suppression must be left switched on, because nothing else will be
   * denoising.
   */
  public async prewarm(
    audioContext: AudioContext,
    noiseSuppressionEnabled: boolean,
  ): Promise<boolean> {
    this.noiseSuppressionReady = await this.processorFactory.prewarm(
      audioContext,
      noiseSuppressionEnabled,
    );
    return this.noiseSuppressionReady;
  }

  /**
   * Whether RNNoise is loaded and will run, as opposed to
   * isNoiseSuppressionActive, which reports whether a built graph currently has
   * it wired in. This is the one the capture constraints need, because they are
   * decided before any graph exists.
   */
  public isNoiseSuppressionReady(): boolean {
    return this.noiseSuppressionReady;
  }

  public async getOrCreateProcessor(
    preset: NoiseSuppressionPreset,
    wantsNoiseSuppression: boolean,
  ): Promise<MicrophoneProcessor | null> {
    // One decision, made in prewarm, used in both places: the capture
    // constraints and the graph. If they disagree — RNNoise wired in while the
    // browser's suppressor was left on, or both switched off — the microphone is
    // either double-processed or not processed at all.
    const noiseSuppressionEnabled =
      wantsNoiseSuppression && this.noiseSuppressionReady;

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
