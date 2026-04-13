import {
  Track,
  type AudioCaptureOptions,
  type AudioProcessorOptions,
  type LocalParticipant,
  type TrackProcessor,
  type TrackPublishOptions,
} from "livekit-client";
import { logLiveKitDebug } from "./livekit-debug-log";
import {
  RnnoiseTrackProcessorFactory,
  type NoiseSuppressionPreset,
} from "./rnnoise-track-processor";

export interface MicrophoneProcessingPreferences {
  enhancedNoiseSuppressionEnabled: boolean;
  noiseSuppressionPreset: NoiseSuppressionPreset;
  selectedAudioInputDeviceId: string | null;
}

interface ApplyMicrophoneStateOptions {
  enabled: boolean;
  participant: LocalParticipant;
  preferences: MicrophoneProcessingPreferences;
  publishOptions: TrackPublishOptions;
}

interface MicrophoneAttempt {
  options: AudioCaptureOptions;
  warning?: string;
}

export class LiveKitMicrophoneController {
  private liveKitAudioContext: AudioContext | null = null;
  private activeMicrophoneProcessor: TrackProcessor<
    Track.Kind.Audio,
    AudioProcessorOptions
  > | null = null;
  private activeMicrophoneProcessorPreset: NoiseSuppressionPreset | null = null;
  private operationQueue: Promise<void> = Promise.resolve();
  private readonly rnnoiseProcessorFactory: RnnoiseTrackProcessorFactory;

  public constructor(private readonly onWarning?: (message: string) => void) {
    this.rnnoiseProcessorFactory = new RnnoiseTrackProcessorFactory(
      this.onWarning,
    );
    logLiveKitDebug("mic-controller", "constructed");
  }

  public getOrCreateAudioContext(): AudioContext | null {
    if (
      this.liveKitAudioContext &&
      this.liveKitAudioContext.state !== "closed"
    ) {
      return this.liveKitAudioContext;
    }

    if (typeof window === "undefined") {
      return null;
    }

    const Ctx =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!Ctx) {
      return null;
    }

    try {
      this.liveKitAudioContext = new Ctx({
        latencyHint: "interactive",
        sampleRate: 48000,
      });
    } catch {
      this.liveKitAudioContext = new Ctx({ latencyHint: "interactive" });
    }
    logLiveKitDebug("mic-controller", "audio-context-created", {
      state: this.liveKitAudioContext.state,
      sampleRate: this.liveKitAudioContext.sampleRate,
    });
    return this.liveKitAudioContext;
  }

  public prepareParticipantAudioContext(participant: LocalParticipant): void {
    logLiveKitDebug("mic-controller", "prepare-participant-audio-context");
    void this.ensureParticipantAudioContext(participant);
  }

  public applyMicrophoneState(
    options: ApplyMicrophoneStateOptions,
  ): Promise<void> {
    logLiveKitDebug("mic-controller", "apply-requested", {
      enabled: options.enabled,
      enhancedNoiseSuppressionEnabled:
        options.preferences.enhancedNoiseSuppressionEnabled,
      noiseSuppressionPreset: options.preferences.noiseSuppressionPreset,
      selectedAudioInputDeviceId:
        options.preferences.selectedAudioInputDeviceId ?? "default",
      dtx: options.publishOptions.dtx ?? false,
      red: options.publishOptions.red ?? false,
    });
    return this.enqueue(() => this.applyMicrophoneStateInternal(options));
  }

  public refreshMicrophoneProcessing(
    options: Omit<ApplyMicrophoneStateOptions, "enabled">,
  ): Promise<void> {
    return this.enqueue(async () => {
      logLiveKitDebug("mic-controller", "refresh-processing-start");
      await options.participant.setMicrophoneEnabled(false);
      await this.destroyActiveMicrophoneProcessor();
      await this.applyMicrophoneStateInternal({
        ...options,
        enabled: true,
      });
      logLiveKitDebug("mic-controller", "refresh-processing-finished", {
        participantMicEnabled: options.participant.isMicrophoneEnabled,
      });
    });
  }

  public dispose(): Promise<void> {
    return this.enqueue(async () => {
      logLiveKitDebug("mic-controller", "dispose-start");
      await this.destroyActiveMicrophoneProcessor();
      await this.closeLiveKitAudioContext();
      logLiveKitDebug("mic-controller", "dispose-finished");
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async applyMicrophoneStateInternal({
    enabled,
    participant,
    preferences,
    publishOptions,
  }: ApplyMicrophoneStateOptions): Promise<void> {
    if (!enabled) {
      logLiveKitDebug("mic-controller", "apply-disable-start");
      await participant.setMicrophoneEnabled(false);
      await this.destroyActiveMicrophoneProcessor();
      logLiveKitDebug("mic-controller", "apply-disable-finished", {
        participantMicEnabled: participant.isMicrophoneEnabled,
      });
      return;
    }

    const context = await this.ensureParticipantAudioContext(participant);
    logLiveKitDebug("mic-controller", "apply-enable-context-ready", {
      contextAvailable: Boolean(context),
      contextState: context?.state ?? "unavailable",
    });

    const captureOptions = await this.buildCaptureOptions(
      participant,
      preferences,
    );
    const attempts = this.buildAttempts(captureOptions);
    logLiveKitDebug("mic-controller", "apply-enable-attempts-built", {
      attemptCount: attempts.length,
      attempts: attempts.map((attempt) => {
        return {
          hasProcessor: Boolean(attempt.options.processor),
          hasDeviceId: typeof attempt.options.deviceId !== "undefined",
          warning: attempt.warning ?? null,
        };
      }),
    });

    let lastError: unknown = null;
    for (
      let attemptIndex = 0;
      attemptIndex < attempts.length;
      attemptIndex += 1
    ) {
      const attempt = attempts[attemptIndex];

      try {
        logLiveKitDebug("mic-controller", "attempt-start", {
          attemptIndex,
          hasProcessor: Boolean(attempt.options.processor),
          hasDeviceId: typeof attempt.options.deviceId !== "undefined",
        });
        const publication = await participant.setMicrophoneEnabled(
          true,
          attempt.options,
          publishOptions,
        );

        if (
          participant.isMicrophoneEnabled ||
          (publication ? !publication.isMuted : false)
        ) {
          logLiveKitDebug("mic-controller", "attempt-success", {
            attemptIndex,
            participantMicEnabled: participant.isMicrophoneEnabled,
            publicationFound: Boolean(publication),
            publicationMuted: publication?.isMuted ?? null,
            source: publication?.source ?? null,
            sid: publication?.trackSid ?? null,
          });
          return;
        }

        throw new Error("Mikrofon yayını aktifleştirilemedi");
      } catch (error) {
        lastError = error;
        logLiveKitDebug("mic-controller", "attempt-failed", {
          attemptIndex,
          hasProcessor: Boolean(attempt.options.processor),
          hasDeviceId: typeof attempt.options.deviceId !== "undefined",
          error,
        });

        if (attempt.warning && attemptIndex < attempts.length - 1) {
          this.onWarning?.(attempt.warning);
        }

        if (attempt.options.processor) {
          await this.destroyActiveMicrophoneProcessor();
          await this.ensureParticipantAudioContext(participant);

          if (attemptIndex < attempts.length - 1) {
            continue;
          }
        }

        if (attemptIndex < attempts.length - 1) {
          continue;
        }

        break;
      }
    }

    const recovered = await this.tryEmergencyFallback(
      participant,
      publishOptions,
    );
    if (recovered) {
      logLiveKitDebug("mic-controller", "emergency-fallback-success", {
        participantMicEnabled: participant.isMicrophoneEnabled,
      });
      this.onWarning?.("Mikrofon yayını acil fallback ile yeniden başlatıldı.");
      return;
    }

    logLiveKitDebug("mic-controller", "emergency-fallback-failed", {
      participantMicEnabled: participant.isMicrophoneEnabled,
      lastError,
    });

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error("Mikrofon yayını başlatılamadı");
  }

  private async buildCaptureOptions(
    participant: LocalParticipant,
    preferences: MicrophoneProcessingPreferences,
  ): Promise<AudioCaptureOptions> {
    const options: AudioCaptureOptions = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    const preferredInputDeviceId = await this.resolvePreferredInputDeviceId(
      preferences.selectedAudioInputDeviceId,
    );
    if (preferredInputDeviceId) {
      options.deviceId = preferredInputDeviceId;
    }

    logLiveKitDebug("mic-controller", "capture-options-base", {
      selectedAudioInputDeviceId: preferences.selectedAudioInputDeviceId,
      resolvedAudioInputDeviceId: preferredInputDeviceId ?? "default",
      enhancedNoiseSuppressionEnabled:
        preferences.enhancedNoiseSuppressionEnabled,
      noiseSuppressionPreset: preferences.noiseSuppressionPreset,
    });

    if (!preferences.enhancedNoiseSuppressionEnabled) {
      return options;
    }

    const context = await this.ensureParticipantAudioContext(participant);
    if (!context) {
      this.onWarning?.(
        "AudioContext oluşturulamadı, RNNoise devre dışı bırakılarak varsayılan mikrofon filtreleri kullanılıyor.",
      );
      return options;
    }

    const processor = await this.getOrCreateMicrophoneProcessor(
      preferences.noiseSuppressionPreset,
    );
    if (!processor) {
      return options;
    }

    const browserProfile = this.resolveBrowserSuppressionProfile(
      preferences.noiseSuppressionPreset,
    );
    options.noiseSuppression = browserProfile.noiseSuppression;
    options.autoGainControl = browserProfile.autoGainControl;
    options.processor = processor;
    logLiveKitDebug("mic-controller", "capture-options-processor-enabled", {
      resolvedAudioInputDeviceId: preferredInputDeviceId ?? "default",
      noiseSuppressionPreset: preferences.noiseSuppressionPreset,
      noiseSuppression: options.noiseSuppression,
      autoGainControl: options.autoGainControl,
    });
    return options;
  }

  private resolveBrowserSuppressionProfile(
    preset: NoiseSuppressionPreset,
  ): Pick<AudioCaptureOptions, "noiseSuppression" | "autoGainControl"> {
    if (preset === "natural") {
      return {
        noiseSuppression: true,
        autoGainControl: true,
      };
    }

    if (preset === "aggressive") {
      return {
        noiseSuppression: true,
        autoGainControl: false,
      };
    }

    return {
      noiseSuppression: true,
      autoGainControl: false,
    };
  }

  private buildAttempts(
    captureOptions: AudioCaptureOptions,
  ): MicrophoneAttempt[] {
    const hasProcessor = Boolean(captureOptions.processor);
    const hasPreferredDevice = typeof captureOptions.deviceId !== "undefined";

    const attempts: MicrophoneAttempt[] = [];

    if (hasProcessor) {
      const withoutProcessor: AudioCaptureOptions = {
        ...captureOptions,
        processor: undefined,
        noiseSuppression: true,
      };

      attempts.push({
        options: captureOptions,
        warning:
          "RNNoise başlatılamadı, mikrofon tarayıcı ses filtreleri ile açılıyor.",
      });

      if (hasPreferredDevice) {
        attempts.push({
          options: withoutProcessor,
          warning:
            "Seçili mikrofon cihazı kullanılamadı, varsayılan mikrofona geri dönülüyor.",
        });
        attempts.push({
          options: {
            ...withoutProcessor,
            deviceId: undefined,
          },
        });
      } else {
        attempts.push({ options: withoutProcessor });
      }

      return attempts;
    }

    if (hasPreferredDevice) {
      attempts.push({
        options: captureOptions,
        warning:
          "Seçili mikrofon cihazı kullanılamadı, varsayılan mikrofona geri dönülüyor.",
      });
      attempts.push({
        options: {
          ...captureOptions,
          deviceId: undefined,
        },
      });
      return attempts;
    }

    attempts.push({ options: captureOptions });
    return attempts;
  }

  private async ensureParticipantAudioContext(
    participant: LocalParticipant,
  ): Promise<AudioContext | null> {
    const context = this.getOrCreateAudioContext();
    if (!context) {
      logLiveKitDebug("mic-controller", "participant-context-unavailable");
      return null;
    }

    participant.setAudioContext(context);

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // no-op
      }
    }

    logLiveKitDebug("mic-controller", "participant-context-ready", {
      state: context.state,
    });

    return context;
  }

  private async resolvePreferredInputDeviceId(
    selectedInputDeviceId: string | null,
  ): Promise<string | undefined> {
    if (!selectedInputDeviceId) {
      return undefined;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== "function"
    ) {
      return selectedInputDeviceId;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasSelectedInput = devices.some(
        (device) =>
          device.kind === "audioinput" &&
          device.deviceId === selectedInputDeviceId,
      );

      if (hasSelectedInput) {
        return selectedInputDeviceId;
      }

      this.onWarning?.(
        "Seçili mikrofon bulunamadı, varsayılan mikrofon kullanılacak.",
      );
      logLiveKitDebug("mic-controller", "selected-device-not-found", {
        selectedInputDeviceId,
      });
      return undefined;
    } catch {
      logLiveKitDebug("mic-controller", "resolve-device-enumeration-failed", {
        selectedInputDeviceId,
      });
      return selectedInputDeviceId;
    }
  }

  private async getOrCreateMicrophoneProcessor(
    preset: NoiseSuppressionPreset,
  ): Promise<TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | null> {
    if (
      this.activeMicrophoneProcessor &&
      this.activeMicrophoneProcessorPreset === preset
    ) {
      logLiveKitDebug("mic-controller", "processor-reused", {
        preset,
      });
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
      await this.destroyActiveMicrophoneProcessor();
    }

    const processor =
      await this.rnnoiseProcessorFactory.createProcessor(preset);
    if (!processor) {
      this.onWarning?.(
        "AudioWorklet desteklenmediği için RNNoise devreye alınamadı, tarayıcı filtreleri kullanılıyor.",
      );
      logLiveKitDebug("mic-controller", "processor-unavailable", {
        preset,
      });
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

  private async destroyActiveMicrophoneProcessor(): Promise<void> {
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

  private async closeLiveKitAudioContext(): Promise<void> {
    if (!this.liveKitAudioContext) {
      return;
    }

    const context = this.liveKitAudioContext;
    this.liveKitAudioContext = null;

    if (context.state === "closed") {
      return;
    }

    try {
      await context.close();
    } catch {
      // no-op
    }

    logLiveKitDebug("mic-controller", "audio-context-closed");
  }

  private async tryEmergencyFallback(
    participant: LocalParticipant,
    publishOptions: TrackPublishOptions,
  ): Promise<boolean> {
    try {
      logLiveKitDebug("mic-controller", "emergency-fallback-start");
      await participant.setMicrophoneEnabled(false);
      await this.destroyActiveMicrophoneProcessor();
      await this.ensureParticipantAudioContext(participant);

      await participant.setMicrophoneEnabled(
        true,
        {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: undefined,
          processor: undefined,
        },
        publishOptions,
      );

      logLiveKitDebug("mic-controller", "emergency-fallback-finish", {
        participantMicEnabled: participant.isMicrophoneEnabled,
      });
      return participant.isMicrophoneEnabled;
    } catch (error) {
      logLiveKitDebug("mic-controller", "emergency-fallback-error", {
        error,
      });
      return false;
    }
  }
}
