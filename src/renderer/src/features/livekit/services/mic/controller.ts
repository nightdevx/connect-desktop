import {
  type LocalAudioTrack,
  Track,
  type AudioCaptureOptions,
  type LocalParticipant,
  type TrackPublishOptions,
} from "livekit-client";
import { logLiveKitDebug } from "@/services/debug-log";
import {
  LiveKitNoiseSuppressionRuntime,
  ProcessorManager,
  resolveCaptureFilters,
  type ActiveNoiseSuppressionMode,
  type MicrophoneProcessor,
  type NoiseSuppressionPreset,
} from "@/features/rnnoise";
import { AudioContextManager } from "./audio-context-manager";
import { DeviceResolver } from "./device-resolver";
import {
  type ApplyMicrophoneStateOptions,
  type MicrophoneAttempt,
  type MicrophoneProcessingPreferences,
} from "./types";

// How long one setProcessor attempt may take before the browser's own noise
// suppression is used instead. Every microphone operation is serialised behind
// this one, so the budget is a hard ceiling on how long a wedged worklet load
// can hold up a mute, an unmute, or leaving a room.
const PROCESSOR_ATTACH_TIMEOUT_MS = 2_000;

export class LiveKitMicrophoneController {
  private operationQueue: Promise<void> = Promise.resolve();
  private readonly audioContextManager: AudioContextManager;
  private readonly processorManager: ProcessorManager;
  private readonly deviceResolver: DeviceResolver;
  private readonly noiseSuppressionRuntime: LiveKitNoiseSuppressionRuntime;

  private lastAppliedParticipantIdentity: string | null = null;
  private lastAppliedEnabled: boolean | null = null;
  private lastAppliedDeviceId: string | null = null;
  private lastAppliedNoiseSuppression: boolean | null = null;
  private lastAppliedPreset: NoiseSuppressionPreset | null = null;

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

  /**
   * Build the room-independent half of the microphone chain ahead of time.
   *
   * The AudioContext, two AudioWorklet module loads and the RNNoise WASM
   * compile do not depend on a room, a participant or a track — but they only
   * ran on the way to publishing, i.e. AFTER room.connect() had resolved. That
   * put 250-700ms of pure setup between "connected" and "they can hear me" on a
   * cold join, and 60-160ms on every room switch, because the worklet
   * registration is cached per AudioContext and the context used to be closed
   * on every teardown.
   *
   * Idempotent: the context is reused and prewarm caches its own work, so
   * calling this once per session and again on a preference change is free.
   */
  public warmUp(enhancedNoiseSuppressionEnabled: boolean): Promise<void> {
    return this.enqueue(async () => {
      const context = this.getOrCreateAudioContext();
      if (!context) {
        logLiveKitDebug("mic-controller", "warmup-no-context");
        return;
      }

      if (context.state === "suspended") {
        try {
          await context.resume();
        } catch {
          // A context that cannot resume yet (no user gesture) still registers
          // its worklets; the resume happens later on the real publish path.
        }
      }

      await this.processorManager.prewarm(context, enhancedNoiseSuppressionEnabled);
      logLiveKitDebug("mic-controller", "warmup-finished", {
        enhancedNoiseSuppressionEnabled,
      });
    });
  }

  /**
   * Per-room teardown: forget what was applied and drop the processor, but keep
   * the AudioContext and everything registered on it.
   *
   * dispose() closes the context, which throws away the worklet registration
   * cache with it — that is correct when the session itself is going away, and
   * pure waste between two rooms.
   */
  public releaseForRoomChange(): Promise<void> {
    return this.enqueue(async () => {
      logLiveKitDebug("mic-controller", "release-for-room-change");
      this.lastAppliedParticipantIdentity = null;
      this.lastAppliedEnabled = null;
      this.lastAppliedDeviceId = null;
      this.lastAppliedNoiseSuppression = null;
      this.lastAppliedPreset = null;
      await this.processorManager.destroyActiveProcessor();
      this.noiseSuppressionRuntime.markDisabled();
    });
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

      // 2.5 Switch device if it changed
      const preferredInputDeviceId =
        await this.deviceResolver.resolvePreferredInputDeviceId(
          preferences.selectedAudioInputDeviceId,
        );
      const currentDeviceId = track.mediaStreamTrack.getSettings().deviceId;
      if (preferredInputDeviceId && currentDeviceId !== preferredInputDeviceId) {
        logLiveKitDebug("mic-controller", "refresh-switching-device", {
          from: currentDeviceId,
          to: preferredInputDeviceId,
        });
        try {
          await track.setDeviceId(preferredInputDeviceId);
        } catch (err) {
          console.warn("[LiveKitMicrophoneController] Failed to set device ID on track, falling back to full refresh:", err);
          await participant.setMicrophoneEnabled(false);
          this.noiseSuppressionRuntime.markDisabled();
          await this.processorManager.destroyActiveProcessor();
          return this.applyMicrophoneStateInternal({ ...options, enabled: true });
        }
      }

      // 3. Attach new processor if wanted
      let appliedProcessor = false;
      if (desiredProcessor) {
        appliedProcessor = await this.attachProcessorToMicrophoneTrack(
          participant,
          publication,
          desiredProcessor,
        );
      }

      // 4. Update runtime state
      if (appliedProcessor) {
        this.noiseSuppressionRuntime.markEnabled(
          this.processorManager.isNoiseSuppressionActive(),
        );
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
      this.lastAppliedParticipantIdentity = null;
      this.lastAppliedEnabled = null;
      this.lastAppliedDeviceId = null;
      this.lastAppliedNoiseSuppression = null;
      this.lastAppliedPreset = null;
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
    const participantIdentity = participant.identity;
    const deviceId = preferences.selectedAudioInputDeviceId ?? "default";
    const nsEnabled = preferences.enhancedNoiseSuppressionEnabled;
    const preset = preferences.noiseSuppressionPreset;

    const isActuallyEnabled = participant.isMicrophoneEnabled;
    const isSameState =
      this.lastAppliedParticipantIdentity === participantIdentity &&
      this.lastAppliedEnabled === enabled &&
      isActuallyEnabled === enabled &&
      this.lastAppliedDeviceId === deviceId &&
      this.lastAppliedNoiseSuppression === nsEnabled &&
      this.lastAppliedPreset === preset;

    if (isSameState) {
      logLiveKitDebug("mic-controller", "apply-skipped-redundant", {
        enabled,
        deviceId,
      });
      return;
    }

    if (!enabled) {
      logLiveKitDebug("mic-controller", "apply-disable-start");

      // Mute, do not dismantle.
      //
      // This used to stop the processor, stop the track and destroy the
      // processor on every disable — with stopMicTrackOnMute doing the same
      // thing again underneath it. Push-to-talk drives this path on every key
      // release, so every single unmute then re-ran getUserMedia, rebuilt the
      // AudioContext graph, re-registered two audioWorklets and recompiled the
      // RNNoise WASM: 200-600ms, which is the first syllable of the sentence.
      //
      // LiveKit mutes the sender, so nothing leaves the machine while it is off,
      // and the OS microphone indicator staying lit is the honest signal — the
      // app still holds the device, and it is about to send again.
      // The full teardown lives in releaseForRoomChange() and dispose().
      await participant.setMicrophoneEnabled(false);

      this.lastAppliedParticipantIdentity = participantIdentity;
      this.lastAppliedEnabled = false;
      this.lastAppliedDeviceId = deviceId;
      this.lastAppliedNoiseSuppression = nsEnabled;
      this.lastAppliedPreset = preset;

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

    // Resolved BEFORE the microphone is published, and now genuinely ready by
    // the time it returns: resolveDesiredProcessor loads the worklets and the
    // RNNoise WASM rather than leaving that to the first setProcessor call.
    const desiredProcessor = await this.resolveDesiredProcessor(
      participant,
      preferences,
    );

    const captureOptions = await this.buildCaptureOptions(
      preferences,
      // Whether RNNoise will actually run, not merely whether a processor object
      // exists. The chain is also used with noise suppression off, for its gain
      // and limiter, and in that case the browser's suppressor is the only
      // denoiser there is — switching it off for a processor that is not going to
      // denoise leaves the microphone completely unfiltered.
      this.processorManager.isNoiseSuppressionReady(),
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

          // "processor" must mean RNNoise is really running, not merely that a
          // processor was attached — the chain now attaches even when noise
          // suppression is off.
          this.noiseSuppressionRuntime.markEnabled(
            appliedProcessor && this.processorManager.isNoiseSuppressionActive(),
          );

          this.lastAppliedParticipantIdentity = participantIdentity;
          this.lastAppliedEnabled = true;
          this.lastAppliedDeviceId = deviceId;
          this.lastAppliedNoiseSuppression = nsEnabled;
          this.lastAppliedPreset = preset;

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
    rnnoiseReady: boolean,
  ): Promise<AudioCaptureOptions> {
    // One decision, shared with the graph that gets built afterwards, so the two
    // cannot disagree about which denoiser is running. echoCancellation is not
    // part of it: it is the user's own setting and nothing in the chain replaces
    // it.
    const filters = resolveCaptureFilters(
      preferences.enhancedNoiseSuppressionEnabled,
      rnnoiseReady,
      preferences.noiseSuppressionPreset,
    );

    const options: AudioCaptureOptions = {
      echoCancellation: preferences.echoCancellationEnabled,
      noiseSuppression: filters.browserNoiseSuppression,
      autoGainControl: filters.browserAutoGainControl,
      channelCount: 1,
    };

    const preferredInputDeviceId =
      await this.deviceResolver.resolvePreferredInputDeviceId(
        preferences.selectedAudioInputDeviceId,
      );
    if (preferredInputDeviceId) {
      options.deviceId = preferredInputDeviceId;
    }

    logLiveKitDebug("mic-controller", "capture-options", {
      selectedAudioInputDeviceId: preferences.selectedAudioInputDeviceId,
      resolvedAudioInputDeviceId: preferredInputDeviceId ?? "default",
      enhancedNoiseSuppressionEnabled:
        preferences.enhancedNoiseSuppressionEnabled,
      noiseSuppressionPreset: preferences.noiseSuppressionPreset,
      rnnoiseReady,
      noiseSuppression: options.noiseSuppression,
      autoGainControl: options.autoGainControl,
    });

    return options;
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

  /**
   * Microphone volume. Applied straight to the running processor graph, so it
   * takes effect mid-sentence without renegotiating the track.
   */
  public setMicrophoneGain(percent: number): void {
    this.processorManager.setGainPercent(percent);
  }

  // Always wanted, even with noise suppression off: the processor carries the
  // output gain and limiter, which is how the microphone volume setting reaches
  // the published track at all.
  private async resolveDesiredProcessor(
    participant: LocalParticipant,
    preferences: MicrophoneProcessingPreferences,
  ): Promise<MicrophoneProcessor | null> {
    // ponytail: worklet/wasm load or context.resume() has no internal timeout
    // and can hang (seen stuck on "Başlatılıyor..." indefinitely). Bound it here
    // so the UI always falls back to browser NS instead of hanging forever.
    try {
      return await Promise.race([
        this.resolveDesiredProcessorInternal(participant, preferences),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 6000),
        ),
      ]);
    } catch {
      return null;
    }
  }

  private async resolveDesiredProcessorInternal(
    participant: LocalParticipant,
    preferences: MicrophoneProcessingPreferences,
  ): Promise<MicrophoneProcessor | null> {
    const context = await this.ensureParticipantAudioContext(participant);
    if (!context) {
      this.onWarning?.(
        "AudioContext oluşturulamadı, mikrofon işleme zinciri devre dışı; tarayıcı filtreleri kullanılıyor.",
      );
      return null;
    }

    this.processorManager.setGainPercent(preferences.microphoneVolume);

    // The expensive half of the processor — two AudioWorklet modules and the
    // RNNoise WASM — is loaded here, while the microphone is still off the air.
    // It used to be loaded inside the processor's init(), which LiveKit calls
    // from setProcessor, which this code runs only after the track is already
    // published: on a cold first join the room heard an unprocessed microphone
    // for as long as that took, and then heard it change character.
    await this.processorManager.prewarm(
      context,
      preferences.enhancedNoiseSuppressionEnabled,
    );

    return this.processorManager.getOrCreateProcessor(
      preferences.noiseSuppressionPreset,
      preferences.enhancedNoiseSuppressionEnabled,
    );
  }

  private async attachProcessorToMicrophoneTrack(
    participant: LocalParticipant,
    publication: Awaited<ReturnType<LocalParticipant["setMicrophoneEnabled"]>>,
    processor: MicrophoneProcessor,
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

    // One attempt, bounded. This used to be three attempts raced against 5s
    // each with backoff between them — 15.45s worst case — inside the single
    // serialised operation queue, so a wedged worklet load blocked every later
    // microphone operation behind it, including the mute that disconnect()
    // waits on. Failing here is not fatal: the caller falls back to the
    // browser's own noise suppression and warns.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("RNNoise initialization timeout")),
          PROCESSOR_ATTACH_TIMEOUT_MS,
        );
      });

      await Promise.race([track.setProcessor(processor), timeoutPromise]);

      clearTimeout(timeoutId);

      logLiveKitDebug("mic-controller", "processor-attach-success", {
        trackId: track.mediaStreamTrack.id,
      });
      return true;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      logLiveKitDebug("mic-controller", "processor-attach-final-failure", {
        error,
      });
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
