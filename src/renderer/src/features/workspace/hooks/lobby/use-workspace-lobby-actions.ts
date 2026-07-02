import {
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { LobbyDescriptor } from "@shared/auth-contracts";
import type { DesktopResult } from "@shared/desktop-api-types";
import type { LiveKitMediaSession } from "@/features/livekit";
import { soundEffectManager } from "@/features/sound-effects";
import workspaceService from "../../services";

type StatusTone = "ok" | "warn" | "error";

interface UseWorkspaceLobbyActionsParams {
  activeLobbyId: string | null;
  setActiveLobbyId: Dispatch<SetStateAction<string | null>>;
  currentUserId: string;
  lobbies: LobbyDescriptor[];
  lobbiesQuery: UseQueryResult<
    DesktopResult<{ lobbies: LobbyDescriptor[] }>,
    Error
  >;
  setKnownLobbies: Dispatch<SetStateAction<LobbyDescriptor[]>>;
  setStatus: (message: string, tone: StatusTone) => void;
  performPostJoinSynchronization: (lobbyId: string) => Promise<void>;
  clearActiveLobbyReconnectTimer: () => void;
  activeLobbyReconnectAttemptRef: MutableRefObject<number>;
  activeLobbyReconnectInFlightRef: MutableRefObject<boolean>;
  resetLocalMediaCapture: () => void;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  kickedLobbyIdRef: MutableRefObject<string | null>;
}

export interface WorkspaceLobbyActionsState {
  isCreatingLobby: boolean;
  renamingLobbyId: string | null;
  deletingLobbyId: string | null;
  joiningLobbyId: string | null;
  isLeavingLobby: boolean;
  createLobby: (
    name: string,
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string,
  ) => Promise<boolean>;
  updateLobby: (
    lobbyId: string,
    name: string,
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string | null,
  ) => Promise<boolean>;
  deleteLobby: (lobbyId: string) => Promise<boolean>;
  joinLobby: (lobbyId: string, password?: string) => Promise<void>;
  leaveActiveLobby: (reason?: "user" | "kicked") => Promise<void>;
  pendingPasswordLobby: { lobbyId: string; wrong: boolean } | null;
  cancelPasswordPrompt: () => void;
}

export const useWorkspaceLobbyActions = ({
  activeLobbyId,
  setActiveLobbyId,
  lobbies,
  lobbiesQuery,
  setKnownLobbies,
  setStatus,
  performPostJoinSynchronization,
  clearActiveLobbyReconnectTimer,
  activeLobbyReconnectAttemptRef,
  activeLobbyReconnectInFlightRef,
  resetLocalMediaCapture,
  liveKitSessionRef,
  kickedLobbyIdRef,
}: UseWorkspaceLobbyActionsParams): WorkspaceLobbyActionsState => {
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [renamingLobbyId, setRenamingLobbyId] = useState<string | null>(null);
  const [deletingLobbyId, setDeletingLobbyId] = useState<string | null>(null);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [isLeavingLobby, setIsLeavingLobby] = useState(false);
  const [pendingPasswordLobby, setPendingPasswordLobby] = useState<{
    lobbyId: string;
    wrong: boolean;
  } | null>(null);

  const createLobby = async (
    name: string,
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string,
  ): Promise<boolean> => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setStatus("Lobi adı en az 2 karakter olmalı", "warn");
      return false;
    }

    setIsCreatingLobby(true);
    try {
      const result = await workspaceService.createLobby({
        name: trimmed,
        isLocked,
        allowedUsers,
        password,
      });
      if (!result.ok) {
        setStatus(
          `Lobi oluşturulamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return false;
      }

      if (result.data?.lobby) {
        const createdLobby = result.data.lobby;
        setKnownLobbies((previous) => {
          const existingIndex = previous.findIndex(
            (lobby) => lobby.id === createdLobby.id,
          );

          if (existingIndex >= 0) {
            const next = [...previous];
            next[existingIndex] = createdLobby;
            return next;
          }

          return [...previous, createdLobby];
        });
      }

      setStatus(`"${trimmed}" lobisi oluşturuldu`, "ok");
      await lobbiesQuery.refetch();
      return true;
    } finally {
      setIsCreatingLobby(false);
    }
  };

  const updateLobby = async (
    lobbyId: string,
    nextName: string,
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string | null,
  ): Promise<boolean> => {
    const trimmedName = nextName.trim();
    if (trimmedName.length < 2) {
      setStatus("Lobi adı en az 2 karakter olmalı", "warn");
      return false;
    }

    setRenamingLobbyId(lobbyId);
    try {
      const result = await workspaceService.updateLobby({
        lobbyId,
        name: trimmedName,
        isLocked,
        allowedUsers,
        password,
      });

      if (!result.ok) {
        setStatus(
          `Lobi güncellenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return false;
      }

      if (result.data?.lobby) {
        const updatedLobby = result.data.lobby;
        setKnownLobbies((previous) => {
          return previous.map((lobby) => {
            if (lobby.id !== updatedLobby.id) {
              return lobby;
            }

            return updatedLobby;
          });
        });
      }

      setStatus("Lobi güncellendi", "ok");
      await lobbiesQuery.refetch();
      return true;
    } finally {
      setRenamingLobbyId(null);
    }
  };

  const deleteLobby = async (lobbyId: string): Promise<boolean> => {
    setDeletingLobbyId(lobbyId);
    try {
      const result = await workspaceService.deleteLobby({ lobbyId });
      if (!result.ok) {
        setStatus(
          `Lobi silinemedi: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return false;
      }

      setKnownLobbies((previous) => {
        return previous.filter((lobby) => lobby.id !== lobbyId);
      });

      if (activeLobbyId === lobbyId) {
        setActiveLobbyId(null);
      }

      setStatus("Lobi silindi", "ok");
      await lobbiesQuery.refetch();
      return true;
    } finally {
      setDeletingLobbyId(null);
    }
  };

  const joinLobby = async (lobbyId: string, password?: string): Promise<void> => {
    if (joiningLobbyId || isLeavingLobby || activeLobbyId === lobbyId) {
      return;
    }

    soundEffectManager.prime();

    setJoiningLobbyId(lobbyId);
    try {
      const result = await workspaceService.joinLobby({ lobbyId, password });
      if (!result.ok) {
        // Password-protected room: surface a prompt instead of a scary error.
        const code = result.error?.code;
        if (code === "LOBBY_PASSWORD_REQUIRED" || code === "LOBBY_PASSWORD_INCORRECT") {
          setPendingPasswordLobby({
            lobbyId,
            wrong: code === "LOBBY_PASSWORD_INCORRECT",
          });
          return;
        }
        setStatus(
          `Lobiye katılınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return;
      }

      setPendingPasswordLobby(null);

      // A deliberate (re)join means any prior kick from this lobby no longer
      // applies — clear the marker so the reconnect guard doesn't block us.
      kickedLobbyIdRef.current = null;

      setActiveLobbyId(lobbyId);
      clearActiveLobbyReconnectTimer();
      activeLobbyReconnectAttemptRef.current = 0;
      activeLobbyReconnectInFlightRef.current = false;

      void performPostJoinSynchronization(lobbyId);

      soundEffectManager.playMemberJoined();

      const joinedLobby = lobbies.find((item) => item.id === lobbyId);
      setStatus(`${joinedLobby?.name ?? lobbyId} lobisine katıldın`, "ok");
      void lobbiesQuery.refetch();
    } finally {
      setJoiningLobbyId(null);
    }
  };

  const leaveActiveLobby = async (reason: "user" | "kicked" = "user"): Promise<void> => {
    if (!activeLobbyId || isLeavingLobby) {
      return;
    }

    soundEffectManager.prime();

    setIsLeavingLobby(true);
    clearActiveLobbyReconnectTimer();
    activeLobbyReconnectAttemptRef.current = 0;
    activeLobbyReconnectInFlightRef.current = false;
    try {
      const leavingLobbyId = activeLobbyId;
      const result = await workspaceService.leaveLobby({
        lobbyId: leavingLobbyId,
      });
      if (!result.ok) {
        setStatus(
          `Lobiden ayrılınamadı: ${result.error?.message ?? "Bilinmeyen hata"}`,
          "error",
        );
        return;
      }

      setActiveLobbyId(null);
      resetLocalMediaCapture();
      void liveKitSessionRef.current?.disconnect();
      soundEffectManager.playMemberLeft();
      // The kick warning already told the user what happened; a second
      // contradicting "ok" toast right after is confusing, not informative.
      if (reason !== "kicked") {
        setStatus("Lobiden ayrıldın", "ok");
      }
      void lobbiesQuery.refetch();
    } finally {
      setIsLeavingLobby(false);
    }
  };

  return {
    isCreatingLobby,
    renamingLobbyId,
    deletingLobbyId,
    joiningLobbyId,
    isLeavingLobby,
    createLobby,
    updateLobby,
    deleteLobby,
    joinLobby,
    leaveActiveLobby,
    pendingPasswordLobby,
    cancelPasswordPrompt: () => setPendingPasswordLobby(null),
  };
};



