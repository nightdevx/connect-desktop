import { useEffect, useRef, type MutableRefObject } from "react";
import type { LiveKitMediaSession } from "@/features/livekit";
import type { AudioPreferences } from "@/features/workspace";
import type { StatusTone } from "@/store/ui-store";

// Pushes the user's audio settings into a live media session.
//
// Split from the settings screen on purpose: the preferences are owned by the
// workspace and persisted there, while the session that has to honour them only
// exists while the user is in a room. This is the one place that knows both.

export interface AudioPreferenceSyncOptions {
  audioPreferences: AudioPreferences;
  activeLobbyId: string | null;
  micEnabled: boolean;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  setStatus: (message: string, tone: StatusTone) => void;
}

export function useAudioPreferenceSync({
  audioPreferences,
  activeLobbyId,
  micEnabled,
  liveKitSessionRef,
  setStatus,
}: AudioPreferenceSyncOptions): void {
  const previousRef = useRef(audioPreferences);

  useEffect(() => {
    const previous = previousRef.current;
    const next = audioPreferences;

    if (next === previous) {
      return;
    }

    // Only these three change the capture graph itself. Volume and the output
    // device are applied by setAudioProcessingPreferences without republishing,
    // and republishing for them would drop a word out of every conversation
    // where somebody nudged a slider.
    const shouldRefreshMicProcessing =
      Boolean(activeLobbyId) &&
      micEnabled &&
      (next.enhancedNoiseSuppressionEnabled !==
        previous.enhancedNoiseSuppressionEnabled ||
        next.echoCancellationEnabled !== previous.echoCancellationEnabled ||
        next.noiseSuppressionPreset !== previous.noiseSuppressionPreset ||
        next.selectedAudioInputDeviceId !== previous.selectedAudioInputDeviceId);

    if (activeLobbyId && liveKitSessionRef.current) {
      liveKitSessionRef.current.setAudioProcessingPreferences({
        enhancedNoiseSuppressionEnabled: next.enhancedNoiseSuppressionEnabled,
        echoCancellationEnabled: next.echoCancellationEnabled,
        noiseSuppressionPreset: next.noiseSuppressionPreset,
        selectedAudioInputDeviceId: next.selectedAudioInputDeviceId,
        selectedAudioOutputDeviceId: next.selectedAudioOutputDeviceId,
        masterVolume: next.masterVolume,
        microphoneVolume: next.microphoneVolume,
      });

      if (shouldRefreshMicProcessing) {
        liveKitSessionRef.current
          .refreshMicrophoneProcessing()
          .catch((error: unknown) => {
            setStatus(
              `Mikrofon yenileme hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
              "warn",
            );
          });
      }
    }

    previousRef.current = next;
  }, [audioPreferences, activeLobbyId, micEnabled, liveKitSessionRef, setStatus]);
}
