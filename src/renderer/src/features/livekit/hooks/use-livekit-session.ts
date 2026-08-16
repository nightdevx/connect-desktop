import { useEffect, useRef, useState } from "react";
import {
  EMPTY_MEDIA_STATS,
  LiveKitMediaSession,
  type LiveKitConnectionStatus,
  type MediaStatsSnapshot,
  type ParticipantMediaMap,
  type RemoteParticipantAudioPreference,
  type VideoPublishPreferences,
} from "../services/stream";
import type { ActiveNoiseSuppressionMode } from "../services/mic";
import type { ReconnectStatusKey } from "../../workspace/hooks/core/use-network-reconnect";
import { useUiStore } from "../../../store/ui-store";

// Only one reason originates here: the media transport itself dropped. Named
// rather than `string` so the scheduler's accepted set and this call site cannot
// drift apart — a typo used to be a silently dead trigger.
type LiveKitReconnectTrigger = (
  reason: "livekit-disconnected",
  immediate?: boolean,
) => void;

// Per-participant playback preferences survive a restart.
//
// The stream manager already re-applies them across a reconnect, but the map
// lives inside the session object and the session is rebuilt on every mount —
// so "turn that one loud person down to 40%" lasted exactly as long as the app
// did, and every launch handed the whole room back at 100%.
//
// ponytail: localStorage, not the backend. These are one machine's playback
// choices, like the output device beside them in ct.settings.audio; syncing
// them across devices needs a server-side per-user blob that nothing else
// wants yet.
const PARTICIPANT_AUDIO_STORAGE_KEY = "ct.settings.participant-audio";

const clampPercent = (value: unknown, fallback: number): number => {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(200, Math.max(0, Math.round(value)))
    : fallback;
};

const readStoredParticipantAudio = (): Record<
  string,
  RemoteParticipantAudioPreference
> => {
  try {
    const raw = localStorage.getItem(PARTICIPANT_AUDIO_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const restored: Record<string, RemoteParticipantAudioPreference> = {};

    // Rebuilt field by field rather than trusted wholesale: this is parsed
    // input, and a volumePercent of NaN reaches a GainNode as an exception that
    // takes the whole audio pipeline down.
    for (const [userId, value] of Object.entries(parsed)) {
      if (!userId || typeof value !== "object" || value === null) {
        continue;
      }
      const entry = value as Partial<RemoteParticipantAudioPreference>;
      restored[userId] = {
        muted: entry.muted === true,
        volumePercent: clampPercent(entry.volumePercent, 100),
        cameraHidden: entry.cameraHidden === true,
        screenAudioMuted: entry.screenAudioMuted === true,
        screenAudioVolumePercent: clampPercent(
          entry.screenAudioVolumePercent,
          100,
        ),
      };
    }

    return restored;
  } catch {
    return {};
  }
};

// Everything at its default is not worth a row: a lobby the user never touched
// would otherwise grow the blob by one entry per person they have ever sat with.
const isDefaultPreference = (
  preference: RemoteParticipantAudioPreference,
): boolean =>
  !preference.muted &&
  preference.volumePercent === 100 &&
  !preference.cameraHidden &&
  !preference.screenAudioMuted &&
  (preference.screenAudioVolumePercent ?? 100) === 100;

const saveStoredParticipantAudio = (
  preferences: Record<string, RemoteParticipantAudioPreference>,
): void => {
  try {
    const persistable = Object.fromEntries(
      Object.entries(preferences).filter(
        ([, preference]) => !isDefaultPreference(preference),
      ),
    );
    localStorage.setItem(
      PARTICIPANT_AUDIO_STORAGE_KEY,
      JSON.stringify(persistable),
    );
  } catch {
    // A full or unavailable quota costs the user a remembered slider, nothing
    // more — never the session.
  }
};

export function useLivekitSession(
  _currentUserId: string,
  audioPreferences: any,
  shouldEmitReconnectStatus: (
    key: ReconnectStatusKey,
    cooldownMs: number,
  ) => boolean,
  activeLobbyRef: React.MutableRefObject<string | null>,
  scheduleActiveLobbyReconnect: LiveKitReconnectTrigger,
  kickedLobbyIdRef: React.MutableRefObject<string | null>,
  videoPreferences: VideoPublishPreferences,
) {
  const setStatus = useUiStore((state) => state.setStatus);
  const [remoteParticipantStreams, setRemoteParticipantStreams] =
    useState<ParticipantMediaMap>({});
  const [
    remoteParticipantAudioPreferences,
    setRemoteParticipantAudioPreferences,
  ] = useState<Record<string, RemoteParticipantAudioPreference>>(
    readStoredParticipantAudio,
  );
  const [activeNoiseSuppressionMode, setActiveNoiseSuppressionMode] =
    useState<ActiveNoiseSuppressionMode>("none");
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [mediaStats, setMediaStats] =
    useState<MediaStatsSnapshot>(EMPTY_MEDIA_STATS);
  const [liveKitConnectionState, setLiveKitConnectionState] =
    useState<LiveKitConnectionStatus>("disconnected");
  const liveKitSessionRef = useRef<LiveKitMediaSession | null>(null);
  const remoteParticipantAudioPreferencesRef = useRef<
    Record<string, RemoteParticipantAudioPreference>
  >({});

  useEffect(() => {
    remoteParticipantAudioPreferencesRef.current =
      remoteParticipantAudioPreferences;
    saveStoredParticipantAudio(remoteParticipantAudioPreferences);
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
      onConnectionStateChanged: (state: LiveKitConnectionStatus) => {
        setLiveKitConnectionState(state);

        // Ended by the server. Stop here — the reconnect chain would either
        // fail repeatedly or, for a duplicate identity, evict the very session
        // it just created and loop. The manager has already explained which
        // decision it was through onWarning; do not overwrite that with a
        // vaguer message.
        if (state === "closed") {
          return;
        }

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
      onMediaStats: (snapshot: MediaStatsSnapshot) => {
        setMediaStats(snapshot);
      },
    });

    liveKitSessionRef.current = session;

    session.setVideoPublishPreferences(videoPreferences);

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

    // Hand the restored (or, if this is a re-created session, the current)
    // per-participant choices to the fresh session. Without this the manager's
    // own map starts empty and the first person to publish audio comes in at
    // 100% no matter what the menu shows.
    for (const [participantUserId, preference] of Object.entries(
      remoteParticipantAudioPreferencesRef.current,
    )) {
      session.setRemoteParticipantAudioPreference(participantUserId, preference);
    }

    return () => {
      liveKitSessionRef.current = null;
      setActiveSpeakerIds([]);
      setMediaStats(EMPTY_MEDIA_STATS);
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

  // Codec / hardware preference changes apply to the next publish, so this can
  // safely run without recreating the session.
  useEffect(() => {
    liveKitSessionRef.current?.setVideoPublishPreferences(videoPreferences);
  }, [videoPreferences.codec, videoPreferences.hardwareAcceleration]);

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
    mediaStats,
  };
}
