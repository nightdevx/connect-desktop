/**
 * The one decision about getting back into a room.
 *
 * Three things can say the media membership may be gone -- LiveKit giving up on
 * its connection, the network coming back (or the machine waking) with no
 * session left, the roster dropping us -- and each used to be followed by its
 * own checks before a re-join. They all feed the one reconnect scheduler now,
 * and this is what it asks: once when a trigger arrives (whether to schedule at
 * all) and again when its timer fires (whether the attempt still applies, has
 * to wait, or is moot). The state it compares is the room the user wants, what
 * the server's own decisions say (kicked), and what is in progress (a manual
 * join or leave, an attempt already out, no network).
 *
 * A full re-join is still only for the final disconnect: LiveKit resuming by
 * itself never reaches here (use-livekit-session stops at "reconnecting"), and
 * the network path asks media-recovery-check first.
 *
 * Pure, so the rules are held by check-room-session.cjs rather than by a
 * running app.
 */

export interface RoomSessionState {
  /** The room the user is in, as the shell knows it. */
  activeRoomId: string | null;
  /** The room the server last removed this user from by decision. */
  kickedRoomId: string | null;
  /** A manual join or leave is changing rooms. */
  transitionBusy: boolean;
  online: boolean;
  /** A re-join attempt is already out. */
  attemptInFlight: boolean;
}

/** On a trigger: whether a re-join is worth scheduling at all. */
export type TriggerDecision =
  | { schedule: true; roomId: string }
  | { schedule: false; why: "no-room" | "kicked" };

/** When the scheduled attempt's timer fires. */
export type AttemptDecision =
  | { action: "rejoin"; roomId: string; kind: "call" | "lobby" }
  | { action: "wait"; why: "transition" | "offline" | "in-flight" }
  | { action: "drop"; why: "no-room" | "moved" | "kicked" };

const CALL_ROOM_PREFIX = "call_";

export const decideOnTrigger = (state: RoomSessionState): TriggerDecision => {
  if (!state.activeRoomId) {
    return { schedule: false, why: "no-room" };
  }
  // Re-joining a room the server just removed us from would undo the kick. A
  // deliberate manual join clears this.
  if (state.kickedRoomId === state.activeRoomId) {
    return { schedule: false, why: "kicked" };
  }
  return { schedule: true, roomId: state.activeRoomId };
};

export const decideOnAttempt = (
  scheduledFor: string,
  state: RoomSessionState,
): AttemptDecision => {
  if (!state.activeRoomId) {
    return { action: "drop", why: "no-room" };
  }
  // Every join is exclusive server-side: re-joining the room the attempt was
  // armed for, after the user moved, would pull them out of the one they are in.
  if (state.activeRoomId !== scheduledFor) {
    return { action: "drop", why: "moved" };
  }
  if (state.kickedRoomId === state.activeRoomId) {
    return { action: "drop", why: "kicked" };
  }
  // A deliberate join or leave owns the outcome; stand down and look again.
  if (state.transitionBusy) {
    return { action: "wait", why: "transition" };
  }
  if (!state.online) {
    return { action: "wait", why: "offline" };
  }
  if (state.attemptInFlight) {
    return { action: "wait", why: "in-flight" };
  }
  return {
    action: "rejoin",
    roomId: state.activeRoomId,
    kind: state.activeRoomId.startsWith(CALL_ROOM_PREFIX) ? "call" : "lobby",
  };
};
