import { useCallback, type MutableRefObject } from "react";
import type {
  LiveKitMediaSession,
  RemoteParticipantAudioPreference,
} from "@/features/livekit";

// Per-participant audio preferences (volume, mute, screen-share audio).
//
// WorkspaceShell carried five near-identical handlers for this — read the
// current preference, patch one field, write state, push to the session — which
// was ~100 lines of copy-paste where the only difference was the field name.

export const DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE: RemoteParticipantAudioPreference =
  {
    muted: false,
    volumePercent: 100,
    cameraHidden: false,
  };

const clampVolumePercent = (volumePercent: number): number => {
  if (!Number.isFinite(volumePercent)) {
    return DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE.volumePercent;
  }
  return Math.min(200, Math.max(0, Math.round(volumePercent)));
};

interface UseRemoteParticipantAudioParams {
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  preferencesRef: MutableRefObject<Record<string, RemoteParticipantAudioPreference>>;
  setPreferences: React.Dispatch<
    React.SetStateAction<Record<string, RemoteParticipantAudioPreference>>
  >;
}

export const useRemoteParticipantAudio = ({
  liveKitSessionRef,
  preferencesRef,
  setPreferences,
}: UseRemoteParticipantAudioParams) => {
  const patchPreference = useCallback(
    (
      participantUserId: string,
      patch: Partial<RemoteParticipantAudioPreference>,
      /** cameraHidden is a pure UI concern; the session does not need it. */
      pushToSession = true,
    ): void => {
      const next: RemoteParticipantAudioPreference = {
        ...(preferencesRef.current[participantUserId] ??
          DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE),
        ...patch,
      };

      setPreferences((previous) => ({
        ...previous,
        [participantUserId]: next,
      }));

      if (pushToSession) {
        liveKitSessionRef.current?.setRemoteParticipantAudioPreference(
          participantUserId,
          next,
        );
      }
    },
    [liveKitSessionRef, preferencesRef, setPreferences],
  );

  const setMuted = useCallback(
    (participantUserId: string, muted: boolean): void => {
      patchPreference(participantUserId, { muted });
    },
    [patchPreference],
  );

  const setVolume = useCallback(
    (participantUserId: string, volumePercent: number): void => {
      patchPreference(participantUserId, {
        volumePercent: clampVolumePercent(volumePercent),
      });
    },
    [patchPreference],
  );

  const setScreenAudioMuted = useCallback(
    (participantUserId: string, muted: boolean): void => {
      patchPreference(participantUserId, { screenAudioMuted: muted });
    },
    [patchPreference],
  );

  const setScreenAudioVolume = useCallback(
    (participantUserId: string, volumePercent: number): void => {
      patchPreference(participantUserId, {
        screenAudioVolumePercent: clampVolumePercent(volumePercent),
      });
    },
    [patchPreference],
  );

  const setCameraHidden = useCallback(
    (participantUserId: string, cameraHidden: boolean): void => {
      // Handled entirely in the participant tile.
      patchPreference(participantUserId, { cameraHidden }, false);
    },
    [patchPreference],
  );

  return {
    setMuted,
    setVolume,
    setScreenAudioMuted,
    setScreenAudioVolume,
    setCameraHidden,
  };
};
