import { useEffect, useRef, useState, useCallback } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { LobbyDescriptor } from "@shared/auth-contracts";
import type { LobbyStateMember, DesktopResult } from "@shared/desktop-api-types";
import workspaceService from "../../services";
import type { ReconnectStatusKey } from "../core/use-network-reconnect";
import {
  isLobbyTransitionBusy,
  type LobbyTransitionState,
} from "./lobby-transition";

interface UseWorkspaceLobbiesProps {
  isOnline: boolean;
  shouldEmitReconnectStatus: (
    key: ReconnectStatusKey,
    cooldownMs: number,
  ) => boolean;
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
  activeLobbyId: string | null;
  // Shared with the manual join/leave paths. See lobby-transition.ts: this
  // used to arrive as two literals, which left the interlock below open.
  lobbyTransitionRef: React.MutableRefObject<LobbyTransitionState>;
  activeLobbyReconnectInFlightRef: React.MutableRefObject<boolean>;
  activeLobbyReconnectAttemptRef: React.MutableRefObject<number>;
  performPostJoinSynchronization: (lobbyId: string) => Promise<void>;
  lobbiesQuery: UseQueryResult<DesktopResult<{ lobbies: LobbyDescriptor[] }>, Error>;
  kickedLobbyIdRef: React.MutableRefObject<string | null>;
  // Set by the manual join. An automatic re-join has nobody to prompt for a
  // password, so without this every recovery into a protected room failed with
  // LOBBY_PASSWORD_REQUIRED and retried forever.
  activeLobbyPasswordRef: React.MutableRefObject<string | null>;
  // Mirrors hasLiveSnapshotRef out to the shell, which owns lobbiesQuery and
  // uses it to stop that query running while the stream is authoritative.
  onLobbyStreamLiveChange: (live: boolean) => void;
}

// The two events that mean the media membership itself may be gone. Exported so
// the LiveKit session — which is created before this hook and calls back into it
// through a ref — is typed against the same set rather than `any`.
export type ActiveLobbyReconnectReason =
  | "network-online"
  | "livekit-disconnected";

export type ScheduleActiveLobbyReconnect = (
  reason: ActiveLobbyReconnectReason,
  immediate?: boolean,
) => void;

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
  isOnline,
  shouldEmitReconnectStatus,
  setStatus,
  activeLobbyId,
  lobbyTransitionRef,
  activeLobbyReconnectInFlightRef,
  activeLobbyReconnectAttemptRef,
  performPostJoinSynchronization,
  lobbiesQuery,
  kickedLobbyIdRef,
  activeLobbyPasswordRef,
  onLobbyStreamLiveChange,
}: UseWorkspaceLobbiesProps) {
  const [knownLobbies, setKnownLobbies] = useState<LobbyDescriptor[]>([]);
  const [lobbyMembersById, setLobbyMembersById] = useState<Record<string, LobbyStateMember[]>>({});
  
  const activeLobbyRef = useRef(activeLobbyId);
  const onlineRef = useRef(isOnline);

  const lobbyStreamReconnectTimerRef = useRef<number | null>(null);
  const lobbyStreamReconnectAttemptRef = useRef(0);
  const activeLobbyReconnectTimerRef = useRef<number | null>(null);
  // Once the websocket has delivered a snapshot it is the authoritative list.
  //
  // Both this effect and the REST effect below wrote knownLobbies, and the REST
  // one depends on lobbyMembersById — a fresh object on every snapshot. So each
  // push ran: snapshot sets the new list, then the effect immediately replaces
  // it with the (cached, 15s-stale) REST list. A lobby someone else had just
  // created appeared for one frame and vanished.
  const hasLiveSnapshotRef = useRef(false);

  // The ref is what the snapshot handler reads (it runs between renders); the
  // callback is what lets the shell's REST query stand down. Kept in one place
  // so the two can never disagree.
  const setLobbyStreamLive = (live: boolean): void => {
    hasLiveSnapshotRef.current = live;
    onLobbyStreamLiveChangeRef.current(live);
  };

  useEffect(() => { activeLobbyRef.current = activeLobbyId; }, [activeLobbyId]);

  // Latest-value refs for the reconnect scheduler.
  //
  // scheduleActiveLobbyReconnect used to depend on these directly. lobbiesQuery
  // is a new tracked-result proxy on every render and performPostJoinSynchronization
  // inherits churn from the camera/screen hook objects, so the callback got a
  // new identity every render — which re-ran the stream-subscription effect
  // below, whose cleanup cleared the pending reconnect timer. The first backoff
  // window is 1–1.45s and the shell re-renders at least 1 Hz while in a room,
  // so a dropped lobby socket reliably had its retry destroyed before it fired,
  // with nothing left to re-arm it: the roster froze permanently and, because
  // this socket doubles as the server-side membership heartbeat, the user was
  // dropped from the voice room ~45s later.
  const performPostJoinSyncRef = useRef(performPostJoinSynchronization);
  const lobbiesQueryRef = useRef(lobbiesQuery);
  const shouldEmitReconnectStatusRef = useRef(shouldEmitReconnectStatus);
  const setStatusRef = useRef(setStatus);
  // Same reason as the others: the stream-subscription effect must not re-run
  // because the shell handed down a new function identity.
  const onLobbyStreamLiveChangeRef = useRef(onLobbyStreamLiveChange);

  useEffect(() => {
    performPostJoinSyncRef.current = performPostJoinSynchronization;
    onLobbyStreamLiveChangeRef.current = onLobbyStreamLiveChange;
    lobbiesQueryRef.current = lobbiesQuery;
    shouldEmitReconnectStatusRef.current = shouldEmitReconnectStatus;
    setStatusRef.current = setStatus;
    reconnectHandlesRef.current = {
      clearLobbyReconnectTimer,
      scheduleLobbyStreamReconnect,
      clearActiveLobbyReconnectTimer,
      scheduleActiveLobbyReconnect,
    };
  });

  // Network came back: redial the stream, and rebuild the room membership if
  // the user is in one.
  //
  // Everything is read through a ref. The dependency list is [isOnline] alone —
  // it has to be, or the effect re-runs on identity churn and re-fires the
  // reconnect — which meant every function it called was frozen at first render.
  // `setStatus` and `shouldEmitReconnectStatus` were the visible casualties: the
  // toast cooldown was tracked against a stale closure, so the "internet is
  // back" message could repeat past its own rate limit.
  const reconnectHandlesRef = useRef({
    clearLobbyReconnectTimer: () => {},
    scheduleLobbyStreamReconnect: (_immediate?: boolean) => {},
    clearActiveLobbyReconnectTimer: () => {},
    scheduleActiveLobbyReconnect: (
      _reason: "network-online" | "livekit-disconnected",
      _immediate?: boolean,
    ) => {},
  });

  useEffect(() => {
    if (onlineRef.current === isOnline) return;
    onlineRef.current = isOnline;
    if (!isOnline) return;

    const handles = reconnectHandlesRef.current;
    handles.clearLobbyReconnectTimer();
    handles.scheduleLobbyStreamReconnect(true);

    if (!activeLobbyRef.current) return;

    if (shouldEmitReconnectStatusRef.current("network", 4_000)) {
      setStatusRef.current(
        "İnternet geri geldi, lobi bağlantısı yeniden kuruluyor...",
        "warn",
      );
    }
    handles.clearActiveLobbyReconnectTimer();
    handles.scheduleActiveLobbyReconnect("network-online", true);
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

  // Two reasons, both meaning "the media membership itself may be gone".
  //
  // "lobby-stream-closed" and "lobby-state-probe" used to be in here as well.
  // The first was removed when the roster socket dropping stopped forcing a
  // re-join; the second was never sent by any caller at all — and one of the
  // suppression checks compared against it, so that comparison was permanently
  // true and a successful reconnect announced itself on every single attempt.
  const scheduleActiveLobbyReconnect = useCallback((
    reason: "network-online" | "livekit-disconnected",
    immediate = false,
  ): void => {
    if (!activeLobbyRef.current) return;
    // Never auto-rejoin a lobby the user was just server-kicked from — that
    // would silently undo the kick. A deliberate manual join clears this.
    if (kickedLobbyIdRef.current === activeLobbyRef.current) return;

    // The room this attempt is FOR. Checked again when the timer fires: a
    // reconnect armed for the room the user was in must not fire against the
    // one they moved to. Every server-side join is exclusive, so re-joining the
    // wrong room does not just waste a round trip, it pulls the user out of the
    // room they are standing in.
    const scheduledFor = activeLobbyRef.current;

    if (activeLobbyReconnectTimerRef.current !== null) {
      // An urgent trigger (LiveKit dropped, network came back) must not be
      // swallowed by a backoff timer that is already counting down.
      if (!immediate) return;
      window.clearTimeout(activeLobbyReconnectTimerRef.current);
      activeLobbyReconnectTimerRef.current = null;
    }

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

      // Moved rooms while this was counting down. Drop it: whatever the user is
      // in now has its own lifecycle and does not need this attempt.
      if (targetLobbyID !== scheduledFor) return;

      // A manual join or leave is under way. Stand down and try later rather
      // than racing it — this is the interlock that used to be permanently open
      // because the two flags arrived as literals.
      if (
        isLobbyTransitionBusy(lobbyTransitionRef.current) ||
        !onlineRef.current ||
        activeLobbyReconnectInFlightRef.current
      ) {
        scheduleActiveLobbyReconnect(reason);
        return;
      }

      const attempt = activeLobbyReconnectAttemptRef.current;
      activeLobbyReconnectInFlightRef.current = true;

      const isCallRoom = targetLobbyID.startsWith("call_");

      if (isCallRoom) {
        void performPostJoinSyncRef.current(targetLobbyID)
          .then(() => {
            activeLobbyReconnectAttemptRef.current = 0;
            // Only after a visible failure, and at most once per bucket. See
            // the lobby branch below for why the old condition never held.
            if (
              attempt > 0 &&
              shouldEmitReconnectStatusRef.current("activeLobby", 10_000)
            ) {
              setStatusRef.current("Arama bağlantısı yeniden kuruldu", "ok");
            }
          })
          .catch((error: unknown) => {
            activeLobbyReconnectAttemptRef.current = attempt + 1;
            if (shouldEmitReconnectStatusRef.current("activeLobby", 10_000)) {
              setStatusRef.current(`Arama bağlantısı geri yüklenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`, "warn");
            }
            scheduleActiveLobbyReconnect(reason);
          })
          .finally(() => {
            activeLobbyReconnectInFlightRef.current = false;
          });
        return;
      }

      void workspaceService
        .joinLobby({
          lobbyId: targetLobbyID,
          // Nobody is at the keyboard for a background reconnect, so the
          // password the user typed on the way in is the only one available.
          password: activeLobbyPasswordRef.current ?? undefined,
        })
        .then(async (result) => {
          if (!result.ok) {
            activeLobbyReconnectAttemptRef.current = attempt + 1;
            if (shouldEmitReconnectStatusRef.current("activeLobby", 10_000)) {
              setStatusRef.current(`Lobi bağlantısı geri yüklenemedi: ${result.error?.message ?? "Bilinmeyen hata"}`, "warn");
            }
            scheduleActiveLobbyReconnect(reason);
            return;
          }

          await performPostJoinSyncRef.current(targetLobbyID);
          activeLobbyReconnectAttemptRef.current = 0;
          // This was the toast the user saw over and over.
          //
          // Every failure branch around it is rate-limited by
          // shouldEmitReconnectStatus; the success branch was not, and its one
          // suppression term compared against "lobby-state-probe" — a reason no
          // caller anywhere passes. The right-hand side was therefore always
          // true, so a reconnect that succeeded first try still announced
          // itself, once per attempt, for every flap.
          //
          // Announce a recovery only when there was a visible failure to
          // recover from, and no more often than the failures themselves.
          if (
            attempt > 0 &&
            shouldEmitReconnectStatusRef.current("activeLobby", 10_000)
          ) {
            setStatusRef.current("Lobi bağlantısı yeniden kuruldu", "ok");
          }
          void lobbiesQueryRef.current.refetch();
        })
        .catch((error: unknown) => {
          activeLobbyReconnectAttemptRef.current = attempt + 1;
          if (shouldEmitReconnectStatusRef.current("activeLobby", 10_000)) {
            setStatusRef.current(`Lobi bağlantısı geri yüklenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`, "warn");
          }
          scheduleActiveLobbyReconnect(reason);
        })
        .finally(() => {
          activeLobbyReconnectInFlightRef.current = false;
        });
    }, delay);
    // Stable identity on purpose: everything mutable is read through a ref
    // above. See the refs block near the top of this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!lobbiesQuery.data?.ok || !lobbiesQuery.data.data) return;
    // REST only seeds the list until the stream takes over; after that it is
    // strictly older data and must not overwrite a live snapshot.
    if (hasLiveSnapshotRef.current) return;
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
        setLobbyStreamLive(true);

        const nextMembersById: Record<string, LobbyStateMember[]> = {};
        const nextLobbies: LobbyDescriptor[] = event.lobbies.map((snapshot) => {
          nextMembersById[snapshot.id] = snapshot.members;
          return {
            id: snapshot.id,
            name: snapshot.name,
            room: snapshot.room,
            createdAt: snapshot.createdAt,
            createdBy: snapshot.createdBy,
            // Carried by the snapshot now. Omitting them here is what used to
            // make a locked room render as public between pushes.
            createdByUsername: snapshot.createdByUsername,
            memberCount: snapshot.memberCount,
            isLocked: snapshot.isLocked,
            allowedUsers: snapshot.allowedUsers,
            hasPassword: snapshot.hasPassword,
            // Same trap as isLocked: dropping it here turns a text room back
            // into a voice room — with a live mic — on the next push.
            isTextOnly: snapshot.isTextOnly,
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
        if (shouldEmitReconnectStatusRef.current("lobbyStream", 8_000)) {
          setStatusRef.current(`Lobi akışı hatası: ${event.message}`, "warn");
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
        if (shouldEmitReconnectStatusRef.current("lobbyStream", 8_000)) {
          setStatusRef.current(`Lobi akışı kapandı: ${event.detail ?? "bağlantı sonlandı"}`, "warn");
        }
        // The stream is no longer authoritative, so let REST drive the list
        // again until the next snapshot arrives.
        setLobbyStreamLive(false);
        void syncLobbiesFromFallback();
        scheduleLobbyStreamReconnect();
        // Deliberately NOT a lobby re-join.
        //
        // The roster socket and the media transport are different connections;
        // this one dropping says nothing about whether the user is still in the
        // voice room, and the server keeps their seat alive from the LiveKit
        // side now. Forcing a POST /lobby/join here meant every flap minted a
        // fresh LiveKit token, re-declared mic/camera/screen and wrote a "join"
        // audit row — a request storm on exactly the network that was already
        // struggling. Membership is repaired by the two signals that actually
        // mean something: LiveKit reporting disconnected, and the roster saying
        // we are not in it (see WorkspaceShell's membership recovery).
      }
    });

    return () => {
      // Only the subscription is torn down here. Clearing the reconnect timer
      // was the actual bug: a pending backoff has to survive a re-subscription,
      // or the retry is destroyed before it ever fires.
      unsubscribe();
    };
  }, [clearLobbyReconnectTimer, scheduleLobbyStreamReconnect, syncLobbiesFromFallback, scheduleActiveLobbyReconnect]);

  // The lobby stream stays open for the whole session, not just while the
  // Lobbies tab is visible. It is one socket, it carries the roster, and on the
  // server side it doubles as the membership heartbeat — closing it on a tab
  // switch is what used to drop users out of the voice room after ~45s.
  useEffect(() => {
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
  }, [setStatus, clearLobbyReconnectTimer, syncLobbiesFromFallback, scheduleLobbyStreamReconnect]);

  return {
    knownLobbies,
    setKnownLobbies,
    lobbyMembersById,
    clearActiveLobbyReconnectTimer,
    scheduleActiveLobbyReconnect,
    // Whether the websocket is currently the source of truth for the list.
    // Everything that mutates a lobby reads this to decide whether a REST
    // refetch would tell it anything the next snapshot will not.
    hasLiveSnapshotRef,
  };
}



