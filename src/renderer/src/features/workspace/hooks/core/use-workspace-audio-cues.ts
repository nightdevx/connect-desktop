import { useEffect, useRef } from "react";
import type { LobbyStateMember } from "@shared/desktop-api-types";
import { soundEffectManager } from "@/features/sound-effects";

interface UseWorkspaceAudioCuesProps {
  activeLobbyId: string | null;
  currentUserId: string;
  lobbyMembers: LobbyStateMember[];
}

// How long a departure has to hold before anyone hears it.
//
// These cues are derived from roster diffs, so a member who blinks out and back
// — a reconcile pass taken mid-reconnect, a snapshot that raced a rejoin — used
// to ring a "left" and a "joined" chime for everybody in the room. The audible
// symptom of a problem that had already been fixed everywhere else.
//
// Holding the departure briefly costs nothing (a real leave is announced a beat
// later) and makes a flap silent: if they are back before the timer fires, both
// sounds are cancelled, because nothing actually happened.
const MEMBER_LEFT_HOLD_MS = 2_000;

export function useWorkspaceAudioCues({
  activeLobbyId,
  currentUserId,
  lobbyMembers,
}: UseWorkspaceAudioCuesProps) {
  const observedLobbyIdRef = useRef<string | null>(null);
  const previousLobbyMembersRef = useRef<Map<string, LobbyStateMember>>(new Map());
  const pendingLeaveTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const pendingLeaveTimers = pendingLeaveTimersRef.current;

    const cancelPendingLeave = (userId: string): boolean => {
      const timer = pendingLeaveTimers.get(userId);
      if (timer === undefined) {
        return false;
      }
      window.clearTimeout(timer);
      pendingLeaveTimers.delete(userId);
      return true;
    };

    const clearAllPendingLeaves = (): void => {
      for (const timer of pendingLeaveTimers.values()) {
        window.clearTimeout(timer);
      }
      pendingLeaveTimers.clear();
    };

    if (!activeLobbyId) {
      observedLobbyIdRef.current = null;
      previousLobbyMembersRef.current = new Map();
      clearAllPendingLeaves();
      return;
    }

    const currentMembers = new Map<string, LobbyStateMember>(
      lobbyMembers.map((member) => [member.userId, member]),
    );

    if (observedLobbyIdRef.current !== activeLobbyId) {
      observedLobbyIdRef.current = activeLobbyId;
      previousLobbyMembersRef.current = currentMembers;
      clearAllPendingLeaves();
      return;
    }

    const previousMembers = previousLobbyMembersRef.current;
    for (const [userId, member] of currentMembers) {
      const previousMember = previousMembers.get(userId);

      if (!previousMember) {
        if (userId !== currentUserId) {
          // Back inside the hold window: this was a blink, not an arrival.
          // Swallow the pending "left" instead of adding a "joined" to it.
          if (!cancelPendingLeave(userId)) {
            soundEffectManager.playMemberJoined();
          }
        }
        continue;
      }

      if (userId === currentUserId) {
        continue;
      }

      if (!previousMember.cameraEnabled && member.cameraEnabled) {
        soundEffectManager.playCameraEnabled();
      }

      if (!previousMember.screenSharing && member.screenSharing) {
        soundEffectManager.playScreenEnabled();
      }
    }

    for (const [userId] of previousMembers) {
      if (currentMembers.has(userId) || userId === currentUserId) {
        continue;
      }
      if (pendingLeaveTimers.has(userId)) {
        continue;
      }

      const timer = window.setTimeout(() => {
        pendingLeaveTimers.delete(userId);
        soundEffectManager.playMemberLeft();
      }, MEMBER_LEFT_HOLD_MS);
      pendingLeaveTimers.set(userId, timer);
    }

    previousLobbyMembersRef.current = currentMembers;
  }, [activeLobbyId, currentUserId, lobbyMembers]);

  // Unmounting mid-hold must not fire a chime into a workspace that is gone.
  useEffect(() => {
    const pendingLeaveTimers = pendingLeaveTimersRef.current;
    return () => {
      for (const timer of pendingLeaveTimers.values()) {
        window.clearTimeout(timer);
      }
      pendingLeaveTimers.clear();
    };
  }, []);
}



