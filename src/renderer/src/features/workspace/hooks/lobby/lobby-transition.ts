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
