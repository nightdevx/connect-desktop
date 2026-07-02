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
  scheduleActiveLobbyReconnect: (reason: string, immediate: boolean) => void,
  kickedLobbyIdRef: React.MutableRefObject<string | null>,
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
  const [liveKitConnectionState, setLiveKitConnectionState] = useState<
    "connecting" | "connected" | "reconnecting" | "disconnected"
  >("disconnected");
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
        setLiveKitConnectionState(state);

        if (state === "reconnecting") {
          if (shouldEmitReconnectStatus("livekit", 7_000)) {
            setStatus("LiveKit bağlantısı yeniden kuruluyor...", "warn");
          }
          return;
        }

        if (state === "disconnected" && activeLobbyRef.current) {
          // A server-enforced kick also disconnects LiveKit. Don't claim
          // we're "reconnecting" (we're not — the reconnect loop itself
          // refuses to rejoin a lobby the user was just kicked from).
          if (kickedLobbyIdRef.current === activeLobbyRef.current) {
            return;
          }

          if (shouldEmitReconnectStatus("livekit", 7_000)) {
            setStatus(
              "Canlı ses bağlantısı koptu, LiveKit yeniden bağlanmayı deniyor...",
              "warn",
            );
          }
          // Trigger the active-lobby reconnect chain (fresh token + reconnect).
          // The stream manager tears down the dead room on unexpected disconnect,
          // so performPostJoinSynchronization -> connect() will rebuild it.
          scheduleActiveLobbyReconnect("livekit-disconnected", true);
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
    scheduleActiveLobbyReconnect,
    kickedLobbyIdRef,
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
    liveKitConnectionState,
  };
}
