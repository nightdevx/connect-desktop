import { useEffect, useRef } from "react";
import type { LobbyStateMember } from "../../../../../shared/desktop-api-types";
import { soundCueService } from "../../../services/sound-cue-service";

interface UseWorkspaceAudioCuesProps {
  activeLobbyId: string | null;
  currentUserId: string;
  lobbyMembers: LobbyStateMember[];
}

export function useWorkspaceAudioCues({
  activeLobbyId,
  currentUserId,
  lobbyMembers,
}: UseWorkspaceAudioCuesProps) {
  const observedLobbyIdRef = useRef<string | null>(null);
  const previousLobbyMembersRef = useRef<Map<string, LobbyStateMember>>(new Map());

  useEffect(() => {
    if (!activeLobbyId) {
      observedLobbyIdRef.current = null;
      previousLobbyMembersRef.current = new Map();
      return;
    }

    const currentMembers = new Map<string, LobbyStateMember>(
      lobbyMembers.map((member) => [member.userId, member]),
    );

    if (observedLobbyIdRef.current !== activeLobbyId) {
      observedLobbyIdRef.current = activeLobbyId;
      previousLobbyMembersRef.current = currentMembers;
      return;
    }

    const previousMembers = previousLobbyMembersRef.current;
    for (const [userId, member] of currentMembers) {
      const previousMember = previousMembers.get(userId);

      if (!previousMember) {
        if (userId !== currentUserId) {
          soundCueService.playMemberJoined();
        }
        continue;
      }

      if (userId === currentUserId) {
        continue;
      }

      if (!previousMember.cameraEnabled && member.cameraEnabled) {
        soundCueService.playCameraEnabled();
      }

      if (!previousMember.screenSharing && member.screenSharing) {
        soundCueService.playScreenEnabled();
      }
    }

    for (const [userId] of previousMembers) {
      if (!currentMembers.has(userId) && userId !== currentUserId) {
        soundCueService.playMemberLeft();
      }
    }

    previousLobbyMembersRef.current = currentMembers;
  }, [activeLobbyId, currentUserId, lobbyMembers]);
}
