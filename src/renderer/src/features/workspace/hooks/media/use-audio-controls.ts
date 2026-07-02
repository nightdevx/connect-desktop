import { useState, useCallback, useEffect, type MutableRefObject } from "react";
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

  // 0. Continuous state synchronization with the active LiveKit session
  useEffect(() => {
    if (liveKitSessionRef.current) {
      void liveKitSessionRef.current.setMicrophoneEnabled(micEnabled);
      liveKitSessionRef.current.setDeafened(!headphoneEnabled);
    }
  }, [liveKitSessionRef, micEnabled, headphoneEnabled]);

  const syncLobbyAudioState = useCallback(
    async (lobbyId: string): Promise<void> => {
      // Ensure LiveKit session reflects current UI state immediately
      liveKitSessionRef.current?.setDeafened(!headphoneEnabled);

      if (lobbyId.startsWith("call_")) {
        return; // Bypass database sync for P2P calling
      }

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
    [micEnabled, headphoneEnabled, setStatus, liveKitSessionRef]
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

        if (!activeLobbyId.startsWith("call_")) {
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

      // 1. LiveKit Sync: Mute/Unmute all remote audio
      // When deafened (next=false), we tell LiveKit to silence everything
      liveKitSessionRef.current?.setDeafened(!next);

      // 2. Auto-Mic Mute: If disabling headphones, also disable mic if it's currently on
      if (!next && micEnabled) {
        setTimeout(() => handleMicToggle(), 0);
      }

      if (activeLobbyId) {
        patchLobbyMemberState(currentUserId, {
          deafened: !next,
        });

        if (!activeLobbyId.startsWith("call_")) {
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
      }

      return next;
    });
  }, [
    activeLobbyRef,
    currentUserId,
    patchLobbyMemberState,
    setStatus,
    liveKitSessionRef,
    micEnabled,
    handleMicToggle,
  ]);

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




