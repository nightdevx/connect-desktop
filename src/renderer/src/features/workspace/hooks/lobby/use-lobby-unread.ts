import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import workspaceService from "../../services";
import { mentionsUser } from "../../mentions";

interface UseLobbyUnreadParams {
  currentUserId: string;
  currentUsername: string;
  /** The room whose chat is on screen — a text room, or the joined lobby. */
  visibleLobbyId: string | null;
  /** Whether that chat column is actually rendered right now. */
  isChatVisible: boolean;
  /** Names the toast: "Genel · ayse" reads better than a bare room id. */
  lobbyNameById: Record<string, string>;
  /** "Rahatsız etmeyin". Being named by @username overrides it, as in DMs. */
  suppressNotifications?: boolean;
}

export interface LobbyUnreadState {
  unreadByLobbyId: Record<string, number>;
  totalUnread: number;
}

const isWindowFocused = (): boolean => {
  if (typeof document === "undefined") {
    return false;
  }
  return document.visibilityState === "visible" && document.hasFocus();
};

/**
 * Unread counts and toasts for lobby chat.
 *
 * Lobby chat announced itself in exactly one case — being named by @username —
 * and only for the room already on screen. Everything else was silent: no
 * badge, no toast, no sidebar hint. A message written while the user sat in
 * Arkadaşlar, or in another room, or with the chat column collapsed, was
 * discoverable only by going and looking.
 *
 * The lobby websocket already carries every room's messages (the room panel
 * throws away the ones that are not its own), so counting them costs one more
 * listener on a channel that is already open — no new socket, no polling.
 *
 * Toasts stay deliberately narrow, because a busy room is exactly where this
 * turns into noise: the room you are actually in, or anywhere you are named.
 * Every other room gets a badge and nothing else. The main process drops the
 * toast while the window is focused, so this does not re-check that.
 */
export const useLobbyUnread = ({
  currentUserId,
  currentUsername,
  visibleLobbyId,
  isChatVisible,
  lobbyNameById,
  suppressNotifications = false,
}: UseLobbyUnreadParams): LobbyUnreadState => {
  const [unreadByLobbyId, setUnreadByLobbyId] = useState<
    Record<string, number>
  >({});

  // The stream subscription is registered once and must not be torn down and
  // rebuilt every time the user opens a panel or a name arrives, so everything
  // it reads goes through refs.
  const readRef = useRef({
    currentUserId,
    currentUsername,
    visibleLobbyId,
    isChatVisible,
    lobbyNameById,
    suppressNotifications,
  });
  readRef.current = {
    currentUserId,
    currentUsername,
    visibleLobbyId,
    isChatVisible,
    lobbyNameById,
    suppressNotifications,
  };

  const clearLobbyUnread = useCallback((lobbyId: string): void => {
    setUnreadByLobbyId((previous) => {
      if (!previous[lobbyId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[lobbyId];
      return next;
    });
  }, []);

  useEffect(() => {
    return workspaceService.onLobbyStreamEvent((event) => {
      if (event.type !== "lobby-message") {
        return;
      }

      const {
        currentUserId: userId,
        currentUsername: username,
        visibleLobbyId: onScreenLobbyId,
        isChatVisible: chatVisible,
        lobbyNameById: names,
        suppressNotifications: suppressed,
      } = readRef.current;

      const message = event.message;

      // An edit or a reaction re-publishes an existing message. It is not new
      // mail: badging it would mean someone reacting to yesterday's message
      // lit the room up as if they had written.
      if (message.updated || message.userId === userId) {
        return;
      }

      // Call rooms borrow the lobby machinery under `call_<id>`; their chat is
      // the call's own thread and has its own place on screen.
      if (event.lobbyId.startsWith("call_")) {
        return;
      }

      const named = mentionsUser(message.body, username);
      const isOnScreen =
        event.lobbyId === onScreenLobbyId && chatVisible && isWindowFocused();

      if (isOnScreen) {
        return;
      }

      setUnreadByLobbyId((previous) => ({
        ...previous,
        [event.lobbyId]: (previous[event.lobbyId] ?? 0) + 1,
      }));

      const isCurrentRoom = event.lobbyId === onScreenLobbyId;
      if (!named && !isCurrentRoom) {
        return;
      }
      if (suppressed && !named) {
        return;
      }

      const lobbyName = names[event.lobbyId] ?? "Lobi";
      const sender = message.username || "Biri";

      void workspaceService.notify({
        kind: "lobby-message",
        title: named
          ? `${sender} · ${lobbyName} içinde sizden bahsetti`
          : `${lobbyName} · ${sender}`,
        body: message.body.slice(0, 240) || "Yeni mesaj",
        peerUserId: message.userId,
        lobbyId: event.lobbyId,
      });
    });
  }, []);

  // Reading the room clears it — including the case where the user was already
  // on the room and simply came back to the window.
  useEffect(() => {
    if (!visibleLobbyId || !isChatVisible) {
      return;
    }

    const clearIfFocused = (): void => {
      if (isWindowFocused()) {
        clearLobbyUnread(visibleLobbyId);
      }
    };

    clearIfFocused();
    window.addEventListener("focus", clearIfFocused);
    document.addEventListener("visibilitychange", clearIfFocused);

    return () => {
      window.removeEventListener("focus", clearIfFocused);
      document.removeEventListener("visibilitychange", clearIfFocused);
    };
  }, [visibleLobbyId, isChatVisible, clearLobbyUnread, unreadByLobbyId]);

  const totalUnread = useMemo(() => {
    return Object.values(unreadByLobbyId).reduce((sum, count) => sum + count, 0);
  }, [unreadByLobbyId]);

  return { unreadByLobbyId, totalUnread };
};
