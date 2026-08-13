import { useCallback, type MutableRefObject } from "react";
import type { UserDirectoryEntry } from "@shared/auth-contracts";
import type {
  LiveKitMediaSession,
  ParticipantMediaMap,
} from "@/features/livekit";

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
  leaveActiveLobby: (reason?: "user" | "kicked") => Promise<void>;
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
  const isPeerInRoom = useCallback((): boolean => {
    const peerUserId = callPeer?.userId;
    return Boolean(peerUserId && remoteParticipantStreams[peerUserId]);
  }, [callPeer, remoteParticipantStreams]);

  const teardownCall = useCallback(async (): Promise<void> => {
    await endActiveCall(isPeerInRoom());
    resetLocalMediaCapture();
    try {
      await liveKitSessionRef.current?.disconnect();
    } catch {
      // Already gone; the room is being replaced either way.
    }
  }, [endActiveCall, isPeerInRoom, resetLocalMediaCapture, liveKitSessionRef]);

  const ensureCleanRoomTransition = useCallback(
    async (nextRoomId: string | null): Promise<void> => {
      const currentRoomId = activeLobbyRef.current;
      if (!currentRoomId || currentRoomId === nextRoomId) {
        return;
      }

      if (currentRoomId.startsWith("call_")) {
        // Switching context deliberately, so the peer should be told.
        await teardownCall();
        return;
      }

      await leaveActiveLobby();
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
