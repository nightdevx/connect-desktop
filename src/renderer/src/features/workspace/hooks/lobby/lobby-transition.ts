// Whether a deliberate room change is under way.
//
// Claimed by the manual join/leave paths in use-workspace-lobby-actions and
// read by the background reconnect scheduler in use-workspace-lobbies, so the
// two can never run at the same time. Every server-side join is exclusive — it
// removes the user from every other lobby — so a reconnect landing in the
// middle of a switch does not merely duplicate work, it can pull the user back
// out of the room they are moving into.
//
// A ref rather than React state for two reasons. The owners live in different
// hooks that are instantiated in a fixed order, and one of them was
// consequently wired with the literals `joiningLobbyId: null` and
// `isLeavingLobby: false`, which left the interlock permanently open. And the
// reconnect fires from a timer: state would only reach it after a commit, while
// this has to read true from the instant a transition begins.
export interface LobbyTransitionState {
  joiningLobbyId: string | null;
  isLeaving: boolean;
}

export const createLobbyTransitionState = (): LobbyTransitionState => ({
  joiningLobbyId: null,
  isLeaving: false,
});

export const isLobbyTransitionBusy = (state: LobbyTransitionState): boolean =>
  state.joiningLobbyId !== null || state.isLeaving;

/**
 * What has to happen to the room the user is in before they enter the next one.
 *
 * Pure, and separate from the hook that acts on it, because getting it wrong is
 * silent and expensive: this used to answer "leave-lobby" for a lobby-to-lobby
 * switch, so clicking a room that then refused the join — a password prompt the
 * user cancels, a full room, a ban, a timeout — left them in no room at all,
 * having been removed from the one they were happily sitting in.
 *
 * Lobby-to-lobby is "none" on purpose. The server's join is exclusive: it
 * removes the user from every other lobby as part of admitting them, and the
 * media session replaces its room in the same call. Leaving up front bought
 * nothing and made every refusal destructive.
 */
export type RoomTransitionAction = "none" | "leave-lobby" | "teardown-call";

const CALL_ROOM_PREFIX = "call_";

export const resolveRoomTransition = (
  currentRoomId: string | null,
  nextRoomId: string | null,
): RoomTransitionAction => {
  if (!currentRoomId || currentRoomId === nextRoomId) {
    return "none";
  }

  // A call has another person on the other end who must be told, whatever comes
  // next — including another call.
  if (currentRoomId.startsWith(CALL_ROOM_PREFIX)) {
    return "teardown-call";
  }

  // Lobby -> lobby: the join itself is the switch.
  if (nextRoomId && !nextRoomId.startsWith(CALL_ROOM_PREFIX)) {
    return "none";
  }

  // Lobby -> nothing, or lobby -> call: nothing else will let go of this room.
  return "leave-lobby";
};
