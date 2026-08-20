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

/**
 * Is this person silent for me right now?
 *
 * Dragging the slider to 0 is the same intent as "Sustur", and the audio graph
 * has always treated it that way (gain 0). Only the UI disagreed: every icon
 * and menu label read `muted` alone, so somebody turned all the way down was
 * drawn as live and their menu still offered "Sustur".
 *
 * Derived rather than stored, so there is no second flag to keep in step with
 * the slider — and so the stored preference still remembers WHICH of the two
 * the user did.
 */
export const isRemoteParticipantMuted = (
  preference: RemoteParticipantAudioPreference | undefined,
): boolean =>
  preference !== undefined && (preference.muted || preference.volumePercent === 0);

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
      // Un-muting somebody sitting at 0% has to move the slider as well.
      // Clearing the flag alone left the gain at zero, so "Sesi Aç" produced
      // silence and the menu immediately offered "Sesi Aç" again.
      const current = preferencesRef.current[participantUserId];
      const isSilencedByVolume = (current?.volumePercent ?? 100) === 0;

      patchPreference(participantUserId, {
        muted,
        ...(!muted && isSilencedByVolume
          ? {
              volumePercent:
                DEFAULT_REMOTE_PARTICIPANT_AUDIO_PREFERENCE.volumePercent,
            }
          : {}),
      });
    },
    [patchPreference, preferencesRef],
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

  const setEmoteMuted = useCallback(
    (participantUserId: string, emoteMuted: boolean): void => {
      // No session push: an emote is a lobby-stream event played locally, so
      // there is no LiveKit track for a preference to reach.
      patchPreference(participantUserId, { emoteMuted }, false);
    },
    [patchPreference],
  );

  return {
    setMuted,
    setVolume,
    setScreenAudioMuted,
    setScreenAudioVolume,
    setCameraHidden,
    setEmoteMuted,
  };
};
