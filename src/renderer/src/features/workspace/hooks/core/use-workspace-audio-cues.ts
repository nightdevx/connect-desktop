import { useEffect, useRef } from "react";
import type { LobbyStateMember } from "@shared/desktop-api-types";
import {
  useScreenWatchersStore,
  type ParticipantMediaMap,
} from "@/features/livekit";
import { soundEffectManager } from "@/features/sound-effects";

interface UseWorkspaceAudioCuesProps {
  activeLobbyId: string | null;
  currentUserId: string;
  lobbyMembers: LobbyStateMember[];
  /**
   * LiveKit's own view of the room, which is where the camera and screen cues
   * come from now.
   *
   * The roster is the authority on WHO is in a room, and it arrives on a
   * snapshot about once a second — fine for an arrival, and a second late for
   * "somebody just went live", which is a thing you are meant to look up at.
   * Publications reach this client as events instead, so the media map knows
   * within a frame of it happening.
   */
  remoteParticipantStreams: ParticipantMediaMap;
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
  remoteParticipantStreams,
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

    // Arrivals only. Camera and screen used to be diffed here as well, off this
    // same once-a-second snapshot; they are LiveKit publications now — see the
    // effect below — because a cue that means "look up, something just started"
    // is worth nothing a second after it started.
    const previousMembers = previousLobbyMembersRef.current;
    for (const [userId] of currentMembers) {
      if (previousMembers.has(userId) || userId === currentUserId) {
        continue;
      }

      // Back inside the hold window: this was a blink, not an arrival. Swallow
      // the pending "left" instead of adding a "joined" to it.
      if (!cancelPendingLeave(userId)) {
        soundEffectManager.playMemberJoined();
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

  // Camera and screen, straight off LiveKit.
  //
  // Publications arrive as events, so this fires within a frame of somebody
  // going live rather than on the next roster snapshot. It reads screen
  // AVAILABILITY, not subscription: watching a share is opt-in, so screenEnabled
  // stays false until this user opens it, and a cue keyed to that would only
  // ever announce your own click.
  //
  // Somebody who was ALREADY sharing when they appeared gets no cue: their
  // arrival is its own sound, and stacking two on one event is the noise this
  // pass is meant to remove.
  const previousMediaRef = useRef<Map<string, { camera: boolean; screen: boolean }>>(
    new Map(),
  );

  useEffect(() => {
    if (!activeLobbyId) {
      previousMediaRef.current = new Map();
      return;
    }

    const previous = previousMediaRef.current;
    const next = new Map<string, { camera: boolean; screen: boolean }>();

    for (const [userId, media] of Object.entries(remoteParticipantStreams)) {
      const state = {
        camera: Boolean(media.cameraEnabled),
        screen: Boolean(media.screenAvailable),
      };
      next.set(userId, state);

      if (userId === currentUserId) {
        continue;
      }

      const before = previous.get(userId);
      if (!before) {
        continue;
      }

      if (!before.camera && state.camera) {
        soundEffectManager.playCameraEnabled();
      }
      if (!before.screen && state.screen) {
        soundEffectManager.playScreenEnabled();
      }
    }

    previousMediaRef.current = next;
  }, [activeLobbyId, currentUserId, remoteParticipantStreams]);

  // Who is watching whose share.
  //
  // Two different cues, because the two sides of it are different events: you
  // opening somebody's stream is a confirmation of your own click, and somebody
  // opening yours is news. The second one is heard by the broadcaster AND by
  // everyone already watching — a share is a place people gather, and arrivals
  // there are worth the same announcement arrivals in the room are.
  const watchersByUserId = useScreenWatchersStore(
    (state) => state.watchersByUserId,
  );
  const observedWatchLobbyIdRef = useRef<string | null>(null);
  const previousWatchersRef = useRef<Record<string, string[]>>({});

  useEffect(() => {
    if (!activeLobbyId) {
      observedWatchLobbyIdRef.current = null;
      previousWatchersRef.current = {};
      return;
    }

    // First map of a room announces nothing: people already watching a share
    // when you walk in did not just start.
    if (observedWatchLobbyIdRef.current !== activeLobbyId) {
      observedWatchLobbyIdRef.current = activeLobbyId;
      previousWatchersRef.current = watchersByUserId;
      return;
    }

    const previous = previousWatchersRef.current;
    previousWatchersRef.current = watchersByUserId;

    let selfStartedWatching = false;
    let someoneElseStartedWatching = false;

    for (const [ownerUserId, viewers] of Object.entries(watchersByUserId)) {
      const before = previous[ownerUserId] ?? [];
      const arrived = viewers.filter((viewer) => !before.includes(viewer));
      if (arrived.length === 0) {
        continue;
      }

      // Only the two parties the change concerns hear anything: the person
      // sharing, and the people who are in that share's audience. A third
      // party's viewer count is not this user's business.
      const isOwnShare = ownerUserId === currentUserId;
      if (!isOwnShare && !viewers.includes(currentUserId)) {
        continue;
      }

      if (arrived.includes(currentUserId)) {
        selfStartedWatching = true;
      }
      if (arrived.some((viewer) => viewer !== currentUserId)) {
        someoneElseStartedWatching = true;
      }
    }

    if (selfStartedWatching) {
      soundEffectManager.playStreamWatchStarted();
    }
    if (someoneElseStartedWatching) {
      soundEffectManager.playStreamViewerJoined();
    }
  }, [activeLobbyId, currentUserId, watchersByUserId]);

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



