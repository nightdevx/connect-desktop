import { useEffect, useRef, useState } from "react";
import {
  LiveKitMediaSession,
  type ParticipantMediaMap,
  type RemoteParticipantAudioPreference,
} from "../services/stream";
import type { ActiveNoiseSuppressionMode } from "../services/mic";
import { useUiStore } from "../../../store/ui-store";

export function useLivekitSession(
  _currentUserId: string,
  audioPreferences: any,
  shouldEmitReconnectStatus: (key: any, delay: number) => boolean,
  activeLobbyRef: React.MutableRefObject<string | null>,
  _scheduleActiveLobbyReconnect: (reason: string, immediate: boolean) => void,
) {
  const setStatus = useUiStore((state) => state.setStatus);
  const [remoteParticipantStreams, setRemoteParticipantStreams] =
    useState<ParticipantMediaMap>({});
  const [
    remoteParticipantAudioPreferences,
    setRemoteParticipantAudioPreferences,
  ] = useState<Record<string, RemoteParticipantAudioPreference>>({});
  const [activeNoiseSuppressionMode, setActiveNoiseSuppressionMode] =
    useState<ActiveNoiseSuppressionMode>("none");
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const liveKitSessionRef = useRef<LiveKitMediaSession | null>(null);
  const remoteParticipantAudioPreferencesRef = useRef<
    Record<string, RemoteParticipantAudioPreference>
  >({});

  useEffect(() => {
    remoteParticipantAudioPreferencesRef.current =
      remoteParticipantAudioPreferences;
  }, [remoteParticipantAudioPreferences]);

  // Stable initialization of the session
  useEffect(() => {
    const session = new LiveKitMediaSession({
      onRemoteStreamsChanged: (nextStreams: ParticipantMediaMap) => {
        setRemoteParticipantStreams(nextStreams);
      },
      onActiveSpeakersChanged: (speakerIds: string[]) => {
        setActiveSpeakerIds(speakerIds);
      },
      onConnectionStateChanged: (
        state: "connecting" | "connected" | "reconnecting" | "disconnected",
      ) => {
        if (state === "reconnecting") {
          if (shouldEmitReconnectStatus("livekit", 7_000)) {
            setStatus("LiveKit bağlantısı yeniden kuruluyor...", "warn");
          }
          return;
        }

        if (state === "disconnected" && activeLobbyRef.current) {
          if (shouldEmitReconnectStatus("livekit", 7_000)) {
            setStatus(
              "Canlı ses bağlantısı koptu, LiveKit yeniden bağlanmayı deniyor...",
              "warn",
            );
          }
        }
      },
      onWarning: (message: string) => setStatus(message, "warn"),
      onNoiseSuppressionModeChanged: (mode: ActiveNoiseSuppressionMode) => {
        setActiveNoiseSuppressionMode(mode);
      },
    });

    liveKitSessionRef.current = session;

    // Apply any current audio preferences immediately
    session.setAudioProcessingPreferences({
      enhancedNoiseSuppressionEnabled:
        audioPreferences.enhancedNoiseSuppressionEnabled,
      noiseSuppressionPreset: audioPreferences.noiseSuppressionPreset,
      selectedAudioInputDeviceId: audioPreferences.selectedAudioInputDeviceId,
      selectedAudioOutputDeviceId: audioPreferences.selectedAudioOutputDeviceId,
      masterVolume: audioPreferences.masterVolume,
      microphoneVolume: audioPreferences.microphoneVolume,
    });

    return () => {
      liveKitSessionRef.current = null;
      setActiveSpeakerIds([]);
      void session.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setStatus,
    shouldEmitReconnectStatus,
    activeLobbyRef,
    // scheduleActiveLobbyReconnect, // Removed from deps as it was not used inside useEffect and causing issues
  ]);

  // Sync preferences without recreating the session
  useEffect(() => {
    if (liveKitSessionRef.current) {
      liveKitSessionRef.current.setAudioProcessingPreferences({
        enhancedNoiseSuppressionEnabled:
          audioPreferences.enhancedNoiseSuppressionEnabled,
        noiseSuppressionPreset: audioPreferences.noiseSuppressionPreset,
        selectedAudioInputDeviceId: audioPreferences.selectedAudioInputDeviceId,
        selectedAudioOutputDeviceId:
          audioPreferences.selectedAudioOutputDeviceId,
        masterVolume: audioPreferences.masterVolume,
        microphoneVolume: audioPreferences.microphoneVolume,
      });
    }
  }, [
    audioPreferences.enhancedNoiseSuppressionEnabled,
    audioPreferences.noiseSuppressionPreset,
    audioPreferences.selectedAudioInputDeviceId,
    audioPreferences.selectedAudioOutputDeviceId,
    audioPreferences.masterVolume,
    audioPreferences.microphoneVolume,
  ]);

  return {
    liveKitSessionRef,
    remoteParticipantStreams,
    remoteParticipantAudioPreferences,
    setRemoteParticipantAudioPreferences,
    activeNoiseSuppressionMode,
    remoteParticipantAudioPreferencesRef,
    activeSpeakerIds,
  };
}
