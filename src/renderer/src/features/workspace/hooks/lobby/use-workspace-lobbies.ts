import { useEffect, useRef, useState, useCallback } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { LobbyDescriptor } from "@shared/auth-contracts";
import type { LobbyStateMember, DesktopResult } from "@shared/desktop-api-types";
import workspaceService from "../../services";

interface UseWorkspaceLobbiesProps {
  workspaceSection: string;
  isOnline: boolean;
  shouldEmitReconnectStatus: (key: any, delay: number) => boolean;
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
  activeLobbyId: string | null;
  joiningLobbyId: string | null;
  isLeavingLobby: boolean;
  activeLobbyReconnectInFlightRef: React.MutableRefObject<boolean>;
  activeLobbyReconnectAttemptRef: React.MutableRefObject<number>;
  performPostJoinSynchronization: (lobbyId: string) => Promise<void>;
  lobbiesQuery: UseQueryResult<DesktopResult<{ lobbies: LobbyDescriptor[] }>, Error>;
}

const LOBBY_STREAM_RECONNECT_BASE_MS = 1_000;
const LOBBY_STREAM_RECONNECT_MAX_MS = 10_000;
const ACTIVE_LOBBY_RECONNECT_BASE_MS = 1_200;
const ACTIVE_LOBBY_RECONNECT_MAX_MS = 15_000;
const RECONNECT_MAX_EXPONENT = 5;
const RECONNECT_JITTER_MAX_MS = 450;

const withReconnectJitter = (delayMs: number): number => {
  return delayMs + Math.floor(Math.random() * RECONNECT_JITTER_MAX_MS);
};

const isMainLobby = (lobby: Pick<LobbyDescriptor, "id" | "name">): boolean => {
  return (
    lobby.id === "main-lobby" ||
    lobby.name.trim().toLocaleLowerCase("tr-TR") === "ana lobi"
  );
};

const sortLobbiesWithMainFirst = (
  lobbies: LobbyDescriptor[],
): LobbyDescriptor[] => {
  return [...lobbies].sort((left, right) => {
    const leftIsMain = isMainLobby(left);
    const rightIsMain = isMainLobby(right);
    if (leftIsMain !== rightIsMain) {
      return leftIsMain ? -1 : 1;
    }

    if (left.createdAt === right.createdAt) {
      return left.id.localeCompare(right.id, "tr");
    }

    return left.createdAt.localeCompare(right.createdAt, "tr");
  });
};

export function useWorkspaceLobbies({
  workspaceSection,
  isOnline,
  shouldEmitReconnectStatus,
  setStatus,
  activeLobbyId,
  joiningLobbyId,
  isLeavingLobby,
  activeLobbyReconnectInFlightRef,
  activeLobbyReconnectAttemptRef,
  performPostJoinSynchronization,
  lobbiesQuery,
}: UseWorkspaceLobbiesProps) {
  const [knownLobbies, setKnownLobbies] = useState<LobbyDescriptor[]>([]);
  const [lobbyMembersById, setLobbyMembersById] = useState<Record<string, LobbyStateMember[]>>({});
  
  const workspaceSectionRef = useRef(workspaceSection);
  const activeLobbyRef = useRef(activeLobbyId);
  const joiningLobbyRef = useRef(joiningLobbyId);
  const leavingLobbyRef = useRef(isLeavingLobby);
  const onlineRef = useRef(isOnline);

  const lobbyStreamReconnectTimerRef = useRef<number | null>(null);
  const lobbyStreamReconnectAttemptRef = useRef(0);
  const activeLobbyReconnectTimerRef = useRef<number | null>(null);

  useEffect(() => { workspaceSectionRef.current = workspaceSection; }, [workspaceSection]);
  useEffect(() => { activeLobbyRef.current = activeLobbyId; }, [activeLobbyId]);
  useEffect(() => { joiningLobbyRef.current = joiningLobbyId; }, [joiningLobbyId]);
  useEffect(() => { leavingLobbyRef.current = isLeavingLobby; }, [isLeavingLobby]);

  // Online ref tracking for internal loops
  useEffect(() => {
    if (!onlineRef.current && isOnline) {
      onlineRef.current = true;
      if (workspaceSectionRef.current === "lobbies") {
        clearLobbyReconnectTimer();
        scheduleLobbyStreamReconnect(true);
      }
      if (activeLobbyRef.current) {
        if (shouldEmitReconnectStatus("network", 4_000)) {
          setStatus("İnternet geri geldi, lobi bağlantısı yeniden kuruluyor...", "warn");
        }
        clearActiveLobbyReconnectTimer();
        scheduleActiveLobbyReconnect("network-online", true);
      }
    } else {
      onlineRef.current = isOnline;
    }
  }, [isOnline]);

  const clearLobbyReconnectTimer = useCallback((): void => {
    if (lobbyStreamReconnectTimerRef.current !== null) {
      window.clearTimeout(lobbyStreamReconnectTimerRef.current);
      lobbyStreamReconnectTimerRef.current = null;
    }
  }, []);

  const clearActiveLobbyReconnectTimer = useCallback((): void => {
    if (activeLobbyReconnectTimerRef.current !== null) {
      window.clearTimeout(activeLobbyReconnectTimerRef.current);
      activeLobbyReconnectTimerRef.current = null;
    }
  }, []);

  const syncLobbiesFromFallback = useCallback(async (): Promise<void> => {
    const [lobbiesResult, statesResult] = await Promise.all([
      workspaceService.listLobbies(),
      workspaceService.getLobbyStates(),
    ]);

    if (!lobbiesResult.ok || !lobbiesResult.data) {
      return;
    }

    const membersByLobby: Record<string, LobbyStateMember[]> = {};
    if (statesResult.ok && statesResult.data) {
      for (const lobbyState of statesResult.data.lobbies) {
        membersByLobby[lobbyState.lobbyId] = lobbyState.members;
      }
      setLobbyMembersById(membersByLobby);
    }

    const merged = lobbiesResult.data.lobbies.map((lobby) => {
      const members = membersByLobby[lobby.id];
      return {
        ...lobby,
        memberCount: members ? members.length : lobby.memberCount,
      };
    });

    setKnownLobbies(sortLobbiesWithMainFirst(merged));
  }, []);

  const scheduleLobbyStreamReconnect = useCallback((immediate = false): void => {
    if (workspaceSectionRef.current !== "lobbies") return;
    if (lobbyStreamReconnectTimerRef.current !== null) return;

    const delay = immediate
      ? 0
      : withReconnectJitter(
          Math.min(
            LOBBY_STREAM_RECONNECT_MAX_MS,
            LOBBY_STREAM_RECONNECT_BASE_MS *
              2 ** Math.min(lobbyStreamReconnectAttemptRef.current, RECONNECT_MAX_EXPONENT)
          )
        );

    lobbyStreamReconnectTimerRef.current = window.setTimeout(() => {
      lobbyStreamReconnectTimerRef.current = null;
      if (workspaceSectionRef.current !== "lobbies") return;
      if (!onlineRef.current) {
        scheduleLobbyStreamReconnect();
        return;
      }

      void workspaceService.startLobbyStream().then((result) => {
        if (result.ok) {
          lobbyStreamReconnectAttemptRef.current = 0;
          return;
        }

        lobbyStreamReconnectAttemptRef.current += 1;
        void syncLobbiesFromFallback();
        scheduleLobbyStreamReconnect();
      });
    }, delay);
  }, [syncLobbiesFromFallback]);

  const scheduleActiveLobbyReconnect = useCallback((
    reason: "network-online" | "lobby-stream-closed" | "lobby-state-probe" | "livekit-disconnected",
    immediate = false,
  ): void => {
    if (!activeLobbyRef.current || activeLobbyReconnectTimerRef.current !== null) return;

    const delay = immediate
      ? 0
      : withReconnectJitter(
          Math.min(
            ACTIVE_LOBBY_RECONNECT_MAX_MS,
            ACTIVE_LOBBY_RECONNECT_BASE_MS *
              2 ** Math.min(activeLobbyReconnectAttemptRef.current, RECONNECT_MAX_EXPONENT)
          )
        );

    activeLobbyReconnectTimerRef.current = window.setTimeout(() => {
      activeLobbyReconnectTimerRef.current = null;
      const targetLobbyID = activeLobbyRef.current;
      if (!targetLobbyID) return;
      if (joiningLobbyRef.current || leavingLobbyRef.current || !onlineRef.current || activeLobbyReconnectInFlightRef.current) {
        scheduleActiveLobbyReconnect(reason);
        return;
      }

      const attempt = activeLobbyReconnectAttemptRef.current;
      activeLobbyReconnectInFlightRef.current = true;

      const isCallRoom = targetLobbyID.startsWith("call_");

      if (isCallRoom) {
        void performPostJoinSynchronization(targetLobbyID)
          .then(() => {
            activeLobbyReconnectAttemptRef.current = 0;
            if (attempt > 0 || reason !== "lobby-state-probe") {
              setStatus("Arama bağlantısı yeniden kuruldu", "ok");
            }
          })
          .catch((error: unknown) => {
            activeLobbyReconnectAttemptRef.current = attempt + 1;
            if (shouldEmitReconnectStatus("activeLobby", 10_000)) {
              setStatus(`Arama bağlantısı geri yüklenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`, "warn");
            }
            scheduleActiveLobbyReconnect(reason);
          })
          .finally(() => {
            activeLobbyReconnectInFlightRef.current = false;
          });
        return;
      }

      void workspaceService.joinLobby({ lobbyId: targetLobbyID })
        .then(async (result) => {
          if (!result.ok) {
            activeLobbyReconnectAttemptRef.current = attempt + 1;
            if (shouldEmitReconnectStatus("activeLobby", 10_000)) {
              setStatus(`Lobi bağlantısı geri yüklenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`, "warn");
            }
            scheduleActiveLobbyReconnect(reason);
            return;
          }

          await performPostJoinSynchronization(targetLobbyID);
          activeLobbyReconnectAttemptRef.current = 0;
          if (attempt > 0 || reason !== "lobby-state-probe") {
            setStatus("Lobi bağlantısı yeniden kuruldu", "ok");
          }
          void lobbiesQuery.refetch();
        })
        .catch((error: unknown) => {
          activeLobbyReconnectAttemptRef.current = attempt + 1;
          if (shouldEmitReconnectStatus("activeLobby", 10_000)) {
            setStatus(`Lobi bağlantısı geri yüklenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`, "warn");
          }
          scheduleActiveLobbyReconnect(reason);
        })
        .finally(() => {
          activeLobbyReconnectInFlightRef.current = false;
        });
    }, delay);
  }, [shouldEmitReconnectStatus, setStatus, performPostJoinSynchronization, lobbiesQuery]);

  useEffect(() => {
    if (!lobbiesQuery.data?.ok || !lobbiesQuery.data.data) return;
    const lobbiesFromQuery = lobbiesQuery.data.data.lobbies;

    setKnownLobbies((previous) => {
      const previousMap = new Map(previous.map((lobby) => [lobby.id, lobby]));
      const merged = lobbiesFromQuery.map((incomingLobby) => {
        const wsMembers = lobbyMembersById[incomingLobby.id];
        const existing = previousMap.get(incomingLobby.id);
        return {
          ...incomingLobby,
          memberCount: wsMembers?.length ?? existing?.memberCount ?? incomingLobby.memberCount,
        };
      });
      return sortLobbiesWithMainFirst(merged);
    });
  }, [lobbiesQuery.data, lobbyMembersById]);

  useEffect(() => {
    const unsubscribe = workspaceService.onLobbyStreamEvent((event) => {
      if (event.type === "lobbies-snapshot") {
        clearLobbyReconnectTimer();
        lobbyStreamReconnectAttemptRef.current = 0;

        const nextMembersById: Record<string, LobbyStateMember[]> = {};
        const nextLobbies: LobbyDescriptor[] = event.lobbies.map((snapshot) => {
          nextMembersById[snapshot.id] = snapshot.members;
          return {
            id: snapshot.id,
            name: snapshot.name,
            room: snapshot.room,
            createdAt: snapshot.createdAt,
            createdBy: snapshot.createdBy,
            memberCount: snapshot.memberCount,
          };
        });

        setKnownLobbies(sortLobbiesWithMainFirst(nextLobbies));
        setLobbyMembersById(nextMembersById);

        const currentActiveLobbyID = activeLobbyRef.current;
        if (currentActiveLobbyID && !Object.prototype.hasOwnProperty.call(nextMembersById, currentActiveLobbyID)) {
          // You might want to handle activeLobbyId reset here if needed, but it's handled up tree or via onLeave callback
        }
        return;
      }

      if (event.type === "system-error") {
        if (shouldEmitReconnectStatus("lobbyStream", 8_000)) {
          setStatus(`Lobi akışı hatası: ${event.message}`, "warn");
        }
        scheduleLobbyStreamReconnect();
        return;
      }

      if (event.type === "stream-status" && event.status === "connected") {
        clearLobbyReconnectTimer();
        lobbyStreamReconnectAttemptRef.current = 0;
        return;
      }

      if (event.type === "stream-status" && event.status === "closed") {
        if (shouldEmitReconnectStatus("lobbyStream", 8_000)) {
          setStatus(`Lobi akışı kapandı: ${event.detail ?? "bağlantı sonlandı"}`, "warn");
        }
        void syncLobbiesFromFallback();
        scheduleLobbyStreamReconnect();
        if (activeLobbyRef.current) {
          scheduleActiveLobbyReconnect("lobby-stream-closed", true);
        }
      }
    });

    return () => {
      clearLobbyReconnectTimer();
      unsubscribe();
    };
  }, [setStatus, shouldEmitReconnectStatus, clearLobbyReconnectTimer, scheduleLobbyStreamReconnect, syncLobbiesFromFallback, scheduleActiveLobbyReconnect]);

  useEffect(() => {
    if (workspaceSection !== "lobbies") {
      clearLobbyReconnectTimer();
      lobbyStreamReconnectAttemptRef.current = 0;
      return;
    }

    let cancelled = false;
    void workspaceService.startLobbyStream().then((result) => {
      if (cancelled || result.ok) {
        if (result.ok) {
          lobbyStreamReconnectAttemptRef.current = 0;
        }
        return;
      }
      setStatus(`Lobi akışı başlatılamadı: ${result.error?.message ?? "Bilinmeyen hata"}`, "error");
      void syncLobbiesFromFallback();
      lobbyStreamReconnectAttemptRef.current += 1;
      scheduleLobbyStreamReconnect(true);
    });

    return () => {
      cancelled = true;
      clearLobbyReconnectTimer();
      lobbyStreamReconnectAttemptRef.current = 0;
      void workspaceService.stopLobbyStream();
    };
  }, [setStatus, workspaceSection, clearLobbyReconnectTimer, syncLobbiesFromFallback, scheduleLobbyStreamReconnect]);

  return {
    knownLobbies,
    setKnownLobbies,
    lobbyMembersById,
    clearActiveLobbyReconnectTimer,
    scheduleActiveLobbyReconnect,
  };
}



