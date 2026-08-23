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
import {
  isLobbyTransitionBusy,
  type LobbyTransitionState,
} from "./lobby-transition";
import type { ScheduleActiveLobbyReconnect } from "./use-workspace-lobbies";

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
  // Armed when the media bring-up fails before room.connect() is reached: no
  // connection state ever changes in that case, so nothing else would retry.
  scheduleActiveLobbyReconnect: ScheduleActiveLobbyReconnect;
  activeLobbyReconnectAttemptRef: MutableRefObject<number>;
  activeLobbyReconnectInFlightRef: MutableRefObject<boolean>;
  resetLocalMediaCapture: () => void;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  kickedLobbyIdRef: MutableRefObject<string | null>;
  // Claimed synchronously by joinLobby/leaveActiveLobby so the background
  // reconnect scheduler stands down for the duration. See lobby-transition.ts.
  lobbyTransitionRef: MutableRefObject<LobbyTransitionState>;
  // The password that got the user into the room they are in. Every unattended
  // re-join — the reconnect chain and the membership-recovery probe — has to
  // present it, or a password-protected room can never be recovered into.
  activeLobbyPasswordRef: MutableRefObject<string | null>;
  // True while the lobby websocket is delivering snapshots. See
  // refreshLobbiesIfUnstreamed below.
  hasLiveSnapshotRef: MutableRefObject<boolean>;
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
    isTextOnly?: boolean,
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
  scheduleActiveLobbyReconnect,
  activeLobbyReconnectAttemptRef,
  activeLobbyReconnectInFlightRef,
  resetLocalMediaCapture,
  liveKitSessionRef,
  kickedLobbyIdRef,
  lobbyTransitionRef,
  activeLobbyPasswordRef,
  hasLiveSnapshotRef,
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

  // Every one of these mutations already writes the server's own answer into
  // knownLobbies, and while the websocket is up the next snapshot — under a
  // second away — is authoritative for the whole list anyway. So the refetch
  // that used to follow each of them re-read a list nobody was waiting on, and
  // in create/update/delete it was awaited, holding the dialog's spinner open
  // for an extra round trip after the work was done.
  //
  // It still runs when the stream is not delivering: then REST is the only
  // thing that can correct the list.
  const refreshLobbiesIfUnstreamed = (): void => {
    if (hasLiveSnapshotRef.current) {
      return;
    }

    void lobbiesQuery.refetch();
  };

  const createLobby = async (
    name: string,
    isLocked?: boolean,
    allowedUsers?: string[],
    password?: string,
    // Create-only: there is no edit path, so updateLobby has no counterpart.
    isTextOnly?: boolean,
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
        isTextOnly,
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
      refreshLobbiesIfUnstreamed();
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
      refreshLobbiesIfUnstreamed();
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
      refreshLobbiesIfUnstreamed();
      return true;
    } finally {
      setDeletingLobbyId(null);
    }
  };

  const joinLobby = async (lobbyId: string, password?: string): Promise<void> => {
    // The ref, not the state, decides. State lands a commit later, and a
    // reconnect timer firing inside that window would see "idle" and race this.
    if (activeLobbyId === lobbyId) {
      return;
    }

    if (isLobbyTransitionBusy(lobbyTransitionRef.current)) {
      // Silently returning here is what produced "the lobby button does
      // nothing": the row is only disabled while a JOIN is in flight, so a click
      // during the leave leg of a switch reached this guard and died with no
      // spinner, no toast and no state change.
      setStatus("Oda değişimi sürüyor, birazdan tekrar dene", "warn");
      return;
    }

    soundEffectManager.prime();

    lobbyTransitionRef.current.joiningLobbyId = lobbyId;
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

      // Remembered for the life of the membership: an automatic re-join has
      // nobody to prompt, so this is the only place the password can come from.
      activeLobbyPasswordRef.current = password ?? null;

      // A deliberate (re)join means any prior kick from this lobby no longer
      // applies — clear the marker so the reconnect guard doesn't block us.
      kickedLobbyIdRef.current = null;

      setActiveLobbyId(lobbyId);
      clearActiveLobbyReconnectTimer();
      activeLobbyReconnectAttemptRef.current = 0;
      activeLobbyReconnectInFlightRef.current = false;

      // The reconnect chain only retries what fails AFTER room.connect() — it
      // is driven by connection-state changes. A token request that times out,
      // or a microphone that throws, rejects before the room exists, so
      // swallowing it left the user on the roster, with a "you joined" toast,
      // and no audio in either direction until the server timed them out ~50s
      // later. Hand those failures to the same scheduler instead.
      void performPostJoinSynchronization(lobbyId).catch(() => {
        scheduleActiveLobbyReconnect("livekit-disconnected", true);
      });

      soundEffectManager.playSelfJoinedLobby();

      const joinedLobby = lobbies.find((item) => item.id === lobbyId);
      setStatus(`${joinedLobby?.name ?? lobbyId} lobisine katıldın`, "ok");
      refreshLobbiesIfUnstreamed();
    } finally {
      lobbyTransitionRef.current.joiningLobbyId = null;
      setJoiningLobbyId(null);
    }
  };

  const leaveActiveLobby = async (reason: "user" | "kicked" = "user"): Promise<void> => {
    if (!activeLobbyId || lobbyTransitionRef.current.isLeaving) {
      return;
    }

    soundEffectManager.prime();

    lobbyTransitionRef.current.isLeaving = true;
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
      activeLobbyPasswordRef.current = null;
      resetLocalMediaCapture();
      // Awaited: ensureCleanRoomTransition awaits this function before joining
      // the next room, and a teardown still in flight when the next connect()
      // starts used to take the new room down with it.
      await liveKitSessionRef.current?.disconnect();
      soundEffectManager.playSelfLeftLobby();
      // The kick warning already told the user what happened; a second
      // contradicting "ok" toast right after is confusing, not informative.
      if (reason !== "kicked") {
        setStatus("Lobiden ayrıldın", "ok");
      }
      refreshLobbiesIfUnstreamed();
    } finally {
      lobbyTransitionRef.current.isLeaving = false;
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



