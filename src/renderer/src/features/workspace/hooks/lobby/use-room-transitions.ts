import { useCallback, type MutableRefObject } from "react";
import type { UserDirectoryEntry } from "@shared/auth-contracts";
import type {
  LiveKitMediaSession,
  ParticipantMediaMap,
} from "@/features/livekit";
import { resolveRoomTransition } from "./lobby-transition";
import workspaceService from "../../services";

const CALL_ROOM_PREFIX = "call_";
// Hanging up waits at most this long for the SFU's answer.
const PEER_CHECK_TIMEOUT_MS = 1_500;
import type { LobbyLeaveIntent } from "./use-workspace-lobby-actions";

// Mutual exclusion between rooms: a user is in at most one lobby or one 1:1
// call at a time. Every entry point has to tear the previous room down first,
// which is why these all funnel through ensureCleanRoomTransition rather than
// each caller remembering to do it.

interface CallPeer {
  userId: string;
}

interface UseRoomTransitionsParams {
  activeLobbyRef: MutableRefObject<string | null>;
  liveKitSessionRef: MutableRefObject<LiveKitMediaSession | null>;
  activeLobbyId: string | null;
  callPeer: CallPeer | null | undefined;
  remoteParticipantStreams: ParticipantMediaMap;
  endActiveCall: (peerInRoom: boolean) => Promise<void>;
  leaveActiveLobby: (reason?: LobbyLeaveIntent) => Promise<void>;
  resetLocalMediaCapture: () => void;
  joinLobby: (lobbyId: string, password?: string) => Promise<void>;
  initiateCall: (targetUser: UserDirectoryEntry) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejoinCall: () => Promise<void>;
}

export const useRoomTransitions = ({
  activeLobbyRef,
  liveKitSessionRef,
  activeLobbyId,
  callPeer,
  remoteParticipantStreams,
  endActiveCall,
  leaveActiveLobby,
  resetLocalMediaCapture,
  joinLobby,
  initiateCall,
  acceptCall,
  rejoinCall,
}: UseRoomTransitionsParams) => {
  // Whether the other side is still connected decides between a soft leave
  // (they can keep the call going) and a hard end (notify them, write the DM).
  //
  // Our own room is the first witness, and the only one when it says yes. When
  // it says no, it may be talking about us: while our room is being rebuilt it
  // lists nobody, and hanging up then used to end the call on a peer who was
  // sitting in it. So a "no" is checked with the SFU, briefly. Anything but a
  // clear answer -- a timeout, an error, a server without the route -- keeps
  // our own view, which is what this always did.
  const isPeerInRoom = useCallback(async (): Promise<boolean> => {
    const peerUserId = callPeer?.userId;
    if (!peerUserId) {
      return false;
    }
    if (remoteParticipantStreams[peerUserId]) {
      return true;
    }

    const roomId = activeLobbyRef.current;
    if (!roomId?.startsWith(CALL_ROOM_PREFIX)) {
      return false;
    }
    const answer = await Promise.race([
      workspaceService.getCallPeerStatus({ callId: roomId.slice(CALL_ROOM_PREFIX.length) }),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), PEER_CHECK_TIMEOUT_MS);
      }),
    ]);
    return answer?.ok === true && answer.data?.peerConnected === true;
  }, [activeLobbyRef, callPeer, remoteParticipantStreams]);

  const teardownCall = useCallback(async (): Promise<void> => {
    await endActiveCall(await isPeerInRoom());
    resetLocalMediaCapture();
    try {
      await liveKitSessionRef.current?.disconnect();
    } catch {
      // Already gone; the room is being replaced either way.
    }
  }, [endActiveCall, isPeerInRoom, resetLocalMediaCapture, liveKitSessionRef]);

  // The decision itself is pure and lives in lobby-transition.ts, where
  // scripts/check-room-transition.cjs can hold it to the matrix. This is only
  // the acting on it.
  const ensureCleanRoomTransition = useCallback(
    async (nextRoomId: string | null): Promise<void> => {
      switch (resolveRoomTransition(activeLobbyRef.current, nextRoomId)) {
        case "teardown-call":
          // Switching context deliberately, so the peer should be told.
          await teardownCall();
          return;
        case "leave-lobby":
          await leaveActiveLobby("switch");
          return;
        default:
          return;
      }
    },
    [activeLobbyRef, teardownCall, leaveActiveLobby],
  );

  const handleJoinLobby = useCallback(
    async (lobbyId: string): Promise<void> => {
      await ensureCleanRoomTransition(lobbyId);
      await joinLobby(lobbyId);
    },
    [ensureCleanRoomTransition, joinLobby],
  );

  const handleInitiateCall = useCallback(
    async (targetUser: UserDirectoryEntry): Promise<void> => {
      await ensureCleanRoomTransition(null);
      await initiateCall(targetUser);
    },
    [ensureCleanRoomTransition, initiateCall],
  );

  const handleAcceptCall = useCallback(async (): Promise<void> => {
    await ensureCleanRoomTransition(null);
    await acceptCall();
  }, [ensureCleanRoomTransition, acceptCall]);

  const handleRejoinCall = useCallback(async (): Promise<void> => {
    await ensureCleanRoomTransition(null);
    await rejoinCall();
  }, [ensureCleanRoomTransition, rejoinCall]);

  const handleEndActiveCall = useCallback(async (): Promise<void> => {
    await teardownCall();
  }, [teardownCall]);

  const handleLeaveLobbyOrEndCall = useCallback(async (): Promise<void> => {
    if (activeLobbyId?.startsWith("call_")) {
      await teardownCall();
      return;
    }

    await leaveActiveLobby();
  }, [activeLobbyId, teardownCall, leaveActiveLobby]);

  return {
    handleJoinLobby,
    handleInitiateCall,
    handleAcceptCall,
    handleRejoinCall,
    handleEndActiveCall,
    handleLeaveLobbyOrEndCall,
  };
};
