import { useCallback, useEffect, useMemo, useRef } from "react";
import type { UserDirectoryEntry } from "@shared/auth-contracts";
import type { OpenConversation } from "@/features/workspace";
import type { WorkspaceSection } from "@/store/ui-store";

// Every route into a direct-message thread, in one place.
//
// There are six of them — a rail button, a sidebar row, a lobby roster's "Mesaj
// Gönder", a desktop notification, an accepted call, and the profile card — and
// they used to be six separate pieces of logic spread down the shell, each with
// its own idea of what to do when the peer had no open row yet. Two of them got
// it wrong in opposite directions: one left the sidebar with nothing highlighted
// and no way back to the thread, the other reshuffled the list under the cursor
// on a plain click.

export interface ConversationRoutingOptions {
  currentUserId: string;
  /** Friends only, self excluded. Strangers are not in here. */
  directoryUsers: UserDirectoryEntry[];
  /** The same list with self, which is the only source for your own avatar. */
  directoryUsersWithSelf: UserDirectoryEntry[];
  /** The person on the other end of a live or ringing call, if any. */
  callPeerUser: OpenConversation | null;
  callStatus: string;
  conversations: OpenConversation[];
  isConversationOpen: (userId: string) => boolean;
  openConversation: (peer: OpenConversation) => void;
  closeConversation: (userId: string) => void;
  selectedUserId: string | null;
  setSelectedUserId: (userId: string | null) => void;
  selectedUser: UserDirectoryEntry | null;
  setWorkspaceSection: (section: WorkspaceSection) => void;
}

const toConversationPeer = (user: {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}): OpenConversation => ({
  userId: user.userId,
  username: user.username,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl ?? null,
});

export function useConversationRouting({
  currentUserId,
  directoryUsers,
  directoryUsersWithSelf,
  callPeerUser,
  callStatus,
  conversations,
  isConversationOpen,
  openConversation,
  closeConversation,
  selectedUserId,
  setSelectedUserId,
  selectedUser,
  setWorkspaceSection,
}: ConversationRoutingOptions) {
  // Filled by the shell from useDirectMessages, which is instantiated below this
  // hook: names learned from the messages strangers send. A ref, because
  // conversationPeer has to be able to read it from above that call site.
  const peerNamesRef = useRef<Record<string, string>>({});

  // Names a peer from whatever knows them, best source first: the directory has
  // the freshest profile but only for friends, the call signal names a stranger
  // who is ringing, the stored conversation is the snapshot taken the last time
  // either of those did, and a live message names whoever just wrote. A row that
  // is all four empty renders as "Bilinmeyen kullanıcı" rather than blocking the
  // selection.
  const conversationPeer = useCallback(
    (userId: string): OpenConversation => {
      const directoryUser = directoryUsers.find(
        (user) => user.userId === userId,
      );
      if (directoryUser) {
        return toConversationPeer(directoryUser);
      }

      if (callPeerUser?.userId === userId) {
        return toConversationPeer(callPeerUser);
      }

      const stored = conversations.find((entry) => entry.userId === userId);
      if (stored) {
        return stored;
      }

      // Last resort before the row reads "Bilinmeyen kullanıcı": a stranger who
      // messages while the app is open is in none of the sources above — the
      // directory holds friends only and the conversation seed was fetched at
      // launch — but their own message named them.
      const learned = peerNamesRef.current[userId];
      return {
        userId,
        username: learned ?? "",
        displayName: learned ?? "",
      };
    },
    [callPeerUser, conversations, directoryUsers],
  );

  // The single door into a conversation. Selecting a peer with no row would
  // leave the sidebar with nothing highlighted and no way back to the thread,
  // so the row is created here rather than at each of the call, notification
  // and click sites. Already-open rows are left alone: open() moves a peer to
  // the front, and a plain click must not reshuffle the list under the cursor.
  const selectConversation = useCallback(
    (peer: OpenConversation): void => {
      if (!isConversationOpen(peer.userId)) {
        openConversation(peer);
      }
      setWorkspaceSection("users");
      setSelectedUserId(peer.userId);
    },
    [
      isConversationOpen,
      openConversation,
      setSelectedUserId,
      setWorkspaceSection,
    ],
  );

  const selectConversationById = useCallback(
    (userId: string): void => {
      selectConversation(conversationPeer(userId));
    },
    [conversationPeer, selectConversation],
  );

  // "Mesaj Gönder" from a lobby roster row: switch sections, then select.
  //
  // Deliberately setWorkspaceSection rather than handleSectionChange — that one
  // clears the selection whenever it lands on "users", which is right for the
  // rail button and exactly wrong here: it would drop the person we just picked.
  const openConversationFromRoster = useCallback(
    (userId: string): void => {
      setWorkspaceSection("users");
      selectConversationById(userId);
    },
    [selectConversationById, setWorkspaceSection],
  );

  // Closing the row you are reading drops you back to the friends home. Leaving
  // the selection alone would keep the thread on screen with nothing in the
  // sidebar pointing at it, and no unread to bring the row back.
  const closeSelectedConversation = useCallback(
    (userId: string): void => {
      closeConversation(userId);
      if (selectedUserId === userId) {
        setSelectedUserId(null);
      }
    },
    [closeConversation, selectedUserId, setSelectedUserId],
  );

  // The sidebar's "Ana Sayfa" button. Deliberately NOT closeSelectedConversation:
  // going home must leave every open conversation exactly where it was.
  const openFriendsHome = useCallback((): void => {
    setSelectedUserId(null);
  }, [setSelectedUserId]);

  // Arkadaşlar always lands on the friends home. The selection lives in
  // component state that nothing else clears, so coming back to the section
  // used to resurrect whatever thread was open last time. Clicking a row still
  // selects it: those routes go through selectConversation, not through the
  // rail.
  const handleSectionChange = useCallback(
    (section: WorkspaceSection): void => {
      if (section === "users") {
        setSelectedUserId(null);
      }
      setWorkspaceSection(section);
    },
    [setSelectedUserId, setWorkspaceSection],
  );

  // selectedUser resolves through the friends-only directory, so it is null for
  // every conversation with a non-friend — and a null one would put the friends
  // home on screen instead of the thread, mid-call included. The row's own
  // snapshot names them; role and join date exist only in the directory, so the
  // profile drawer degrades to "Üye" and "Bilinmiyor".
  const resolvedSelectedUser = useMemo<UserDirectoryEntry | null>(() => {
    if (selectedUser || !selectedUserId) {
      return selectedUser;
    }

    const peer = conversationPeer(selectedUserId);
    return {
      userId: peer.userId,
      username: peer.username,
      displayName: peer.displayName || peer.username || "Bilinmeyen kullanıcı",
      avatarUrl: peer.avatarUrl ?? null,
      role: "member",
      createdAt: "",
    };
  }, [conversationPeer, selectedUser, selectedUserId]);

  // Both selectors change identity whenever the conversation list does, and the
  // effects below must not re-run for that: one would drag the user back to the
  // call peer every time an unrelated message arrived, the other would tear
  // down and re-register the notification listener.
  const selectConversationRef = useRef(selectConversation);
  const selectConversationByIdRef = useRef(selectConversationById);
  useEffect(() => {
    selectConversationRef.current = selectConversation;
    selectConversationByIdRef.current = selectConversationById;
  });

  useEffect(() => {
    if (callStatus === "active" && callPeerUser) {
      selectConversationRef.current(toConversationPeer(callPeerUser));
    }
  }, [callStatus, callPeerUser]);

  // Peer ids only, so the unread seed does not re-run every time an avatar or
  // presence flag changes in the directory. The open conversations are unioned
  // in because the directory is friends-only now: seeding from it alone lost
  // the badge for every non-friend you have history with.
  const directoryPeerUserIds = useMemo(() => {
    const peerIds = new Set([
      ...directoryUsersWithSelf.map((user) => user.userId),
      ...conversations.map((entry) => entry.userId),
    ]);
    peerIds.delete(currentUserId);
    return [...peerIds];
  }, [conversations, currentUserId, directoryUsersWithSelf]);

  // Avatars for FRIENDS and self — hence WithSelf, or the rail loses your own
  // picture. The directory is friends-only, so this map has nothing for the
  // strangers sitting in a voice room with you; the shell merges their public
  // cards over the top.
  const directoryAvatarByUserId = useMemo(() => {
    const byUserId: Record<string, string | null | undefined> = {};
    for (const user of directoryUsersWithSelf) {
      byUserId[user.userId] = user.avatarUrl;
    }
    return byUserId;
  }, [directoryUsersWithSelf]);

  return {
    peerNamesRef,
    conversationPeer,
    selectConversation,
    selectConversationById,
    selectConversationByIdRef,
    openConversationFromRoster,
    closeSelectedConversation,
    openFriendsHome,
    handleSectionChange,
    resolvedSelectedUser,
    directoryPeerUserIds,
    directoryAvatarByUserId,
    currentUserAvatarUrl: directoryAvatarByUserId[currentUserId] ?? null,
  };
}
