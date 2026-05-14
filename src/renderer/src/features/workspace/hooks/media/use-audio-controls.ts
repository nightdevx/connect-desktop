import { useState, useCallback, type MutableRefObject } from "react";
import { type LobbyStateMember } from "../../../../../../shared/desktop-api-types";
import { type LiveKitMediaSession } from "@/features/livekit";
import { soundEffectManager } from "@/features/sound-effects";
import workspaceService from "../../services";
import { readAudioPreferences } from "../../workspace-media-utils";

interface UseAudioControlsParams {
  currentUserId: string;
  activeLobbyRef: MutableRefObject<string | null>;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
  patchLobbyMemberState: (
    userId: string,
    patch: Partial<Pick<LobbyStateMember, "muted" | "deafened" | "speaking">>
  ) => void;
}

export const useAudioControls = ({
  currentUserId,
  activeLobbyRef,
  liveKitSessionRef,
  setStatus,
  patchLobbyMemberState,
}: UseAudioControlsParams) => {
  const [micEnabled, setMicEnabled] = useState<boolean>(
    () => readAudioPreferences().defaultMicEnabled
  );
  const [headphoneEnabled, setHeadphoneEnabled] = useState<boolean>(
    () => readAudioPreferences().defaultHeadphoneEnabled
  );

  const syncLobbyAudioState = useCallback(
    async (lobbyId: string): Promise<void> => {
      const updates: Array<Promise<void>> = [];

      if (!micEnabled) {
        updates.push(
          workspaceService
            .setLobbyMuted({
              lobbyId,
              muted: true,
            })
            .then((result) => {
              if (!result.ok) {
                setStatus(
                  `Mikrofon durumu uygulanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                  "warn"
                );
              }
            })
        );
      }

      if (!headphoneEnabled) {
        updates.push(
          workspaceService
            .setLobbyDeafened({
              lobbyId,
              deafened: true,
            })
            .then((result) => {
              if (!result.ok) {
                setStatus(
                  `Kulaklik durumu uygulanamadi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                  "warn"
                );
              }
            })
        );
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    },
    [micEnabled, headphoneEnabled, setStatus]
  );

  const handleMicToggle = useCallback((): void => {
    setMicEnabled((previous) => {
      const next = !previous;
      soundEffectManager.playMicToggle(next);

      const activeLobbyId = activeLobbyRef.current;
      if (activeLobbyId) {
        patchLobbyMemberState(currentUserId, {
          muted: !next,
          speaking: false,
        });
      }

      if (activeLobbyId) {
        void liveKitSessionRef.current
          ?.setMicrophoneEnabled(next)
          .catch((error: unknown) => {
            setStatus(
              `Mikrofon yayini guncellenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
              "warn"
            );
          });

        void workspaceService
          .setLobbyMuted({ lobbyId: activeLobbyId, muted: !next })
          .then((result) => {
            if (!result.ok) {
              setStatus(
                `Mikrofon durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn"
              );
            }
          });
      }

      return next;
    });
  }, [
    activeLobbyRef,
    currentUserId,
    liveKitSessionRef,
    patchLobbyMemberState,
    setStatus,
  ]);

  const handleHeadphoneToggle = useCallback((): void => {
    setHeadphoneEnabled((previous) => {
      const next = !previous;
      soundEffectManager.playHeadphoneToggle(next);

      const activeLobbyId = activeLobbyRef.current;
      if (activeLobbyId) {
        patchLobbyMemberState(currentUserId, {
          deafened: !next,
        });
      }

      if (activeLobbyId) {
        void workspaceService
          .setLobbyDeafened({ lobbyId: activeLobbyId, deafened: !next })
          .then((result) => {
            if (!result.ok) {
              setStatus(
                `Kulaklik durumu guncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
                "warn"
              );
            }
          });
      }

      return next;
    });
  }, [activeLobbyRef, currentUserId, patchLobbyMemberState, setStatus]);

  return {
    micEnabled,
    setMicEnabled,
    headphoneEnabled,
    setHeadphoneEnabled,
    handleMicToggle,
    handleHeadphoneToggle,
    syncLobbyAudioState,
  };
};




