import {
  type LocalAudioTrack,
  Track,
  type AudioCaptureOptions,
  type LocalParticipant,
  type TrackPublishOptions,
} from "livekit-client";
import { logLiveKitDebug } from "../debug-log";
import {
  LiveKitNoiseSuppressionRuntime,
  ProcessorManager,
  type ActiveNoiseSuppressionMode,
  type NoiseSuppressionPreset,
} from "../../../rnnoise";
import { AudioContextManager } from "./audio-context-manager";
import { DeviceResolver } from "./device-resolver";
import {
  type ApplyMicrophoneStateOptions,
  type MicrophoneAttempt,
  type MicrophoneProcessingPreferences,
} from "./types";

export class LiveKitMicrophoneController {
  private operationQueue: Promise<void> = Promise.resolve();
  private readonly audioContextManager: AudioContextManager;
  private readonly processorManager: ProcessorManager;
  private readonly deviceResolver: DeviceResolver;
  private readonly noiseSuppressionRuntime: LiveKitNoiseSuppressionRuntime;

  public constructor(
    private readonly onWarning?: (message: string) => void,
    onModeChange?: (mode: ActiveNoiseSuppressionMode) => void,
  ) {
    this.audioContextManager = new AudioContextManager();
    this.processorManager = new ProcessorManager(this.onWarning);
    this.deviceResolver = new DeviceResolver(this.onWarning);
    this.noiseSuppressionRuntime = new LiveKitNoiseSuppressionRuntime(
      onModeChange,
    );
    logLiveKitDebug("mic-controller", "constructed");
  }

  public getOrCreateAudioContext(): AudioContext | null {
    return this.audioContextManager.getOrCreateAudioContext();
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

      const { participant, preferences } = options;
      
      // If microphone is not enabled, just do a normal apply
      if (!participant.isMicrophoneEnabled) {
        return this.applyMicrophoneStateInternal({
          ...options,
          enabled: true,
        });
      }

      // Fast Path: Microphone is already enabled, update processor in-place
      const publication = participant.getTrackPublication(Track.Source.Microphone);
      const track = publication?.track as LocalAudioTrack | undefined;

      if (!track) {
        // Track not found, fallback to full refresh
        await participant.setMicrophoneEnabled(false);
        this.noiseSuppressionRuntime.markDisabled();
        await this.processorManager.destroyActiveProcessor();
        return this.applyMicrophoneStateInternal({ ...options, enabled: true });
      }

      // 1. Resolve new processor
      const desiredProcessor = await this.resolveDesiredProcessor(
        participant,
        preferences,
      );

      // 2. Detach old processor if it's different or if we want no processor
      // This is crucial to prevent "audio stops" issues when toggling
      logLiveKitDebug("mic-controller", "refresh-detaching-old-processor");
      await track.stopProcessor();
      
      await this.processorManager.destroyActiveProcessor();

      // 3. Attach new processor if wanted
      let appliedProcessor = false;
      if (desiredProcessor) {
        appliedProcessor = await this.attachProcessorToMicrophoneTrack(
          participant,
          publication as any,
          desiredProcessor,
        );
      }

      // 4. Update runtime state
      if (appliedProcessor) {
        this.noiseSuppressionRuntime.markEnabled(appliedProcessor);
      } else {
        this.noiseSuppressionRuntime.markDisabled();
      }

      logLiveKitDebug("mic-controller", "refresh-processing-finished", {
        appliedProcessor,
        participantMicEnabled: participant.isMicrophoneEnabled,
      });
    });
  }

  public dispose(): Promise<void> {
    return this.enqueue(async () => {
      logLiveKitDebug("mic-controller", "dispose-start");
      await this.processorManager.destroyActiveProcessor();
      this.noiseSuppressionRuntime.markDisabled();
      await this.audioContextManager.closeContext();
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
      this.noiseSuppressionRuntime.markDisabled();
      await this.processorManager.destroyActiveProcessor();
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

    const desiredProcessor = await this.resolveDesiredProcessor(
      participant,
      preferences,
    );
    const wantsProcessor = Boolean(desiredProcessor);

    const captureOptions = await this.buildCaptureOptions(
      preferences,
      wantsProcessor,
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
          const appliedProcessor = desiredProcessor
            ? await this.attachProcessorToMicrophoneTrack(
                participant,
                publication,
                desiredProcessor,
              )
            : false;

          if (desiredProcessor && !appliedProcessor) {
            this.onWarning?.(
              "RNNoise başlatılamadı, mikrofon tarayıcı ses filtreleri ile açılıyor.",
            );
          }

          this.noiseSuppressionRuntime.markEnabled(appliedProcessor);

          logLiveKitDebug("mic-controller", "attempt-success", {
            attemptIndex,
            appliedProcessor,
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
    preferences: MicrophoneProcessingPreferences,
    wantsProcessor: boolean,
  ): Promise<AudioCaptureOptions> {
    const options: AudioCaptureOptions = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };

    const preferredInputDeviceId =
      await this.deviceResolver.resolvePreferredInputDeviceId(
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

    if (!wantsProcessor) {
      return options;
    }

    const browserProfile = this.resolveBrowserSuppressionProfile(
      preferences.noiseSuppressionPreset,
    );
    options.noiseSuppression = browserProfile.noiseSuppression;
    options.autoGainControl = browserProfile.autoGainControl;
    logLiveKitDebug("mic-controller", "capture-options-processor-target", {
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

    return {
      noiseSuppression: true,
      autoGainControl: false,
    };
  }

  private buildAttempts(
    captureOptions: AudioCaptureOptions,
  ): MicrophoneAttempt[] {
    const hasPreferredDevice = typeof captureOptions.deviceId !== "undefined";

    const attempts: MicrophoneAttempt[] = [];

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

  private async resolveDesiredProcessor(
    participant: LocalParticipant,
    preferences: MicrophoneProcessingPreferences,
  ): Promise<any | null> {
    if (!preferences.enhancedNoiseSuppressionEnabled) {
      return null;
    }

    const context = await this.ensureParticipantAudioContext(participant);
    if (!context) {
      this.onWarning?.(
        "AudioContext oluşturulamadı, RNNoise devre dışı bırakılarak varsayılan mikrofon filtreleri kullanılıyor.",
      );
      return null;
    }

    return this.processorManager.getOrCreateProcessor(
      preferences.noiseSuppressionPreset,
    );
  }

  private async attachProcessorToMicrophoneTrack(
    participant: LocalParticipant,
    publication: Awaited<ReturnType<LocalParticipant["setMicrophoneEnabled"]>>,
    processor: any,
  ): Promise<boolean> {
    const currentPublication =
      publication ?? participant.getTrackPublication(Track.Source.Microphone);
    const track = currentPublication?.track as LocalAudioTrack | undefined;
    if (!track) {
      logLiveKitDebug("mic-controller", "processor-attach-skipped", {
        reason: "microphone-track-missing",
      });
      return false;
    }

    const context = await this.ensureParticipantAudioContext(participant);
    if (!context) {
      return false;
    }

    track.setAudioContext(context);

    for (let attempt = 0; attempt < 3; attempt++) {
      let timeoutId: any;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("RNNoise initialization timeout")), 5000);
        });

        await Promise.race([
          track.setProcessor(processor),
          timeoutPromise
        ]);
        
        clearTimeout(timeoutId);

        logLiveKitDebug("mic-controller", "processor-attach-success", {
          trackId: track.mediaStreamTrack.id,
          attempt,
        });
        return true;
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        logLiveKitDebug("mic-controller", "processor-attach-attempt-failed", {
          attempt,
          error,
        });

        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 150 * (attempt + 1)),
          );
        } else {
          logLiveKitDebug("mic-controller", "processor-attach-final-failure", {
            error,
          });
        }
      }
    }

    return false;
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

  private async tryEmergencyFallback(
    participant: LocalParticipant,
    publishOptions: TrackPublishOptions,
  ): Promise<boolean> {
    try {
      logLiveKitDebug("mic-controller", "emergency-fallback-start");
      await participant.setMicrophoneEnabled(false);
      await this.processorManager.destroyActiveProcessor();
      await this.ensureParticipantAudioContext(participant);

      await participant.setMicrophoneEnabled(
        true,
        {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          deviceId: undefined,
          processor: undefined,
        },
        publishOptions,
      );

      logLiveKitDebug("mic-controller", "emergency-fallback-finish", {
        participantMicEnabled: participant.isMicrophoneEnabled,
      });
      this.noiseSuppressionRuntime.markEnabled(false);
      return participant.isMicrophoneEnabled;
    } catch (error) {
      logLiveKitDebug("mic-controller", "emergency-fallback-error", {
        error,
      });
      return false;
    }
  }

  public getActiveNoiseSuppressionMode(): ActiveNoiseSuppressionMode {
    return this.noiseSuppressionRuntime.getActiveMode();
  }
}
