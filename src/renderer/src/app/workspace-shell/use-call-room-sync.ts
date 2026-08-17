import { useEffect, useRef, type MutableRefObject } from "react";

// Bringing a 1-to-1 call's media room up, exactly once per room.
//
// performPostJoinSynchronization is read through a ref rather than listed as a
// dependency: it changes identity on every render (see
// use-workspace-media-controls), so this effect used to re-run on every render —
// at least 1 Hz from the media-stats tick and up to 10 Hz while anyone was
// speaking — minting a fresh LiveKit token each time. While the room was still
// `connecting` the idempotency check in connect() did not short-circuit either,
// so the second call tore the half-built room down and rebuilt it: a join loop
// that never settled on a slow network.
//
// The ref is returned rather than kept private because the membership watchdog
// needs the same escape hatch for the same reason.

export interface CallRoomSyncOptions {
  activeLobbyId: string | null;
  performPostJoinSynchronization: (lobbyId: string) => Promise<void>;
}

export function useCallRoomSync({
  activeLobbyId,
  performPostJoinSynchronization,
}: CallRoomSyncOptions): MutableRefObject<(lobbyId: string) => Promise<void>> {
  const performPostJoinSyncRef = useRef(performPostJoinSynchronization);
  useEffect(() => {
    performPostJoinSyncRef.current = performPostJoinSynchronization;
  });

  const syncedCallLobbyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeLobbyId || !activeLobbyId.startsWith("call_")) {
      syncedCallLobbyRef.current = null;
      return;
    }

    if (syncedCallLobbyRef.current === activeLobbyId) {
      return;
    }
    syncedCallLobbyRef.current = activeLobbyId;

    performPostJoinSyncRef.current(activeLobbyId).catch((error) => {
      // Let a failed connect be retried on the next entry into this room.
      syncedCallLobbyRef.current = null;
      console.error(
        "[call-room-sync] automatic LiveKit synchronization failed:",
        error,
      );
    });
  }, [activeLobbyId]);

  return performPostJoinSyncRef;
}
