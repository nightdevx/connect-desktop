import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ChatMessage } from "@shared/auth-contracts";
import type {
  ChatAttachmentUpload,
  DesktopResult,
  DirectMessagesStreamEvent,
} from "@shared/desktop-api-types";

// The picked file kept alongside its encoded payload, so the composer can show
// a name and size without re-reading the file.
export interface PendingAttachment {
  upload: ChatAttachmentUpload;
  name: string;
  size: number;
}
import workspaceService from "../../services";
import { getApiErrorMessage } from "../../workspace-utils";
import { mentionsUser } from "../../mentions";

const DIRECT_STREAM_RECONNECT_BASE_MS = 1_000;
const DIRECT_STREAM_RECONNECT_MAX_MS = 10_000;
const DIRECT_STREAM_RECONNECT_MAX_EXPONENT = 5;
const DIRECT_STREAM_RECONNECT_JITTER_MAX_MS = 350;

const getDirectStreamReconnectDelayMs = (attempt: number): number => {
  const baseDelay = Math.min(
    DIRECT_STREAM_RECONNECT_MAX_MS,
    DIRECT_STREAM_RECONNECT_BASE_MS *
      2 ** Math.min(attempt, DIRECT_STREAM_RECONNECT_MAX_EXPONENT),
  );

  return (
    baseDelay +
    Math.floor(Math.random() * DIRECT_STREAM_RECONNECT_JITTER_MAX_MS)
  );
};

interface UseDirectMessagesParams {
  currentUserId: string;
  // Needed to spot @mentions of you, which are the one thing allowed past
  // "Rahatsız etmeyin".
  currentUsername: string;
  // Every peer in the directory. Used once, to seed the unread badges from the
  // server; the live socket keeps them current after that.
  peerUserIds?: string[];
  selectedUserId: string | null;
  workspaceSection: "users" | "lobbies" | "settings";
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
  // Do-not-disturb suppresses the OS toast, EXCEPT when the message names you.
  // Unread badges always update — the point of DND is not being interrupted,
  // not losing messages.
  suppressNotifications?: boolean;
}

export interface UseDirectMessagesResult {
  directMessagesQuery: UseQueryResult<
    DesktopResult<{ messages: ChatMessage[] }>,
    Error
  >;
  directMessages: ChatMessage[];
  messageDraft: string;
  setMessageDraft: Dispatch<SetStateAction<string>>;
  isSendingMessage: boolean;
  // Sends the draft. With a body it sends that instead and leaves the composer
  // untouched -- that is the GIF picker's path.
  handleSendMessage: (bodyOverride?: string) => void;
  handleDeleteMessage: (messageId: string) => void;
  deletingMessageId: string | null;
  unreadByPeerId: Record<string, number>;
  // Usernames learned from incoming messages, keyed by peer. The only source
  // that names a stranger who writes while the app is open.
  peerNamesById: Record<string, string>;
  // Peer ids currently typing. The server sends no "stopped" signal, so each
  // entry expires on its own.
  typingPeerIds: string[];
  notifyTyping: () => void;
  // Older-than paging for the open conversation.
  loadOlderMessages: () => void;
  isLoadingOlderMessages: boolean;
  hasMoreMessages: boolean;
  // Composer extras.
  pendingAttachment: PendingAttachment | null;
  setPendingAttachment: (value: PendingAttachment | null) => void;
  replyTo: ChatMessage | null;
  setReplyTo: (value: ChatMessage | null) => void;
  handleEditMessage: (messageId: string, body: string) => void;
  handleToggleReaction: (
    messageId: string,
    emoji: string,
    add: boolean,
  ) => void;
  // Server-side search across the whole conversation, not just the loaded page.
  searchQuery: string;
  searchResults: ChatMessage[] | null;
  isSearching: boolean;
  runSearch: (query: string) => void;
  clearSearch: () => void;
}

// One ping per this window while the user keeps typing; the receiver clears the
// indicator a little after the last one, so the two must not be equal.
const TYPING_PING_INTERVAL_MS = 3_000;
const TYPING_EXPIRY_MS = 6_000;

// upsertMessage replaces by id when the message is already known and appends
// otherwise. Edits and reactions arrive as a re-publish of the same id, so a
// plain "skip if it exists" would silently drop every one of them.
const upsertMessage = (
  currentMessages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] => {
  const index = currentMessages.findIndex(
    (message) => message.id === incoming.id,
  );
  if (index < 0) {
    return [...currentMessages, incoming];
  }

  const next = [...currentMessages];
  next[index] = incoming;
  return next;
};

export const useDirectMessages = ({
  currentUserId,
  currentUsername,
  peerUserIds,
  selectedUserId,
  workspaceSection,
  setStatus,
  suppressNotifications = false,
}: UseDirectMessagesParams): UseDirectMessagesResult => {
  const queryClient = useQueryClient();
  const [messageDraft, setMessageDraft] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const [unreadByPeerId, setUnreadByPeerId] = useState<Record<string, number>>(
    {},
  );
  const [typingByPeerId, setTypingByPeerId] = useState<Record<string, number>>(
    {},
  );
  const [peerNamesById, setPeerNamesById] = useState<Record<string, string>>({});
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  // Composer attachments: the picked file plus its base64 payload. Held here
  // rather than in the panel so switching conversations clears it with the
  // draft.
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAttachment | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // null = not searching; [] = searched and found nothing.
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  // Peers whose history is known to be fully loaded. Keyed rather than a single
  // flag so switching conversations does not reset the wrong one.
  const [exhaustedPeerIds, setExhaustedPeerIds] = useState<string[]>([]);
  const lastTypingPingRef = useRef(0);
  const streamWantedRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectInFlightRef = useRef(false);
  const selectedPeerWarnAtRef = useRef(0);

  const shouldEmitWarnStatus = (
    ref: { current: number },
    cooldownMs: number,
  ) => {
    const now = Date.now();
    if (now - ref.current < cooldownMs) {
      return false;
    }

    ref.current = now;
    return true;
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const isBrowserOnline = (): boolean => {
    if (typeof navigator === "undefined") {
      return true;
    }

    return navigator.onLine;
  };

  // One socket for every conversation. This used to fan out over the whole user
  // directory, opening (and independently reconnecting) a websocket per peer.
  const startDirectMessageStream = async (): Promise<boolean> => {
    if (!streamWantedRef.current || reconnectInFlightRef.current) {
      return true;
    }

    reconnectInFlightRef.current = true;
    try {
      const result = await workspaceService.startDirectMessagesStream();
      if (result.ok) {
        reconnectAttemptRef.current = 0;
        return true;
      }

      if (shouldEmitWarnStatus(selectedPeerWarnAtRef, 10_000)) {
        setStatus(
          `Mesaj akışı yeniden bağlanamadı: ${getApiErrorMessage(result.error)}`,
          "warn",
        );
      }

      return false;
    } finally {
      reconnectInFlightRef.current = false;
    }
  };

  const scheduleDirectStreamReconnect = (immediate = false): void => {
    if (!streamWantedRef.current) {
      return;
    }

    if (reconnectTimerRef.current !== null) {
      return;
    }

    const delay = immediate
      ? 0
      : getDirectStreamReconnectDelayMs(reconnectAttemptRef.current);

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;

      if (!streamWantedRef.current) {
        return;
      }

      if (!isBrowserOnline()) {
        scheduleDirectStreamReconnect();
        return;
      }

      void startDirectMessageStream().then((started) => {
        if (started) {
          return;
        }

        reconnectAttemptRef.current += 1;
        scheduleDirectStreamReconnect();
      });
    }, delay);
  };

  const clearUnreadForPeer = (peerUserId: string): void => {
    setUnreadByPeerId((previous) => {
      if (!previous[peerUserId]) {
        return previous;
      }

      const next = { ...previous };
      delete next[peerUserId];
      return next;
    });
  };

  const incrementUnreadForPeer = (peerUserId: string): void => {
    setUnreadByPeerId((previous) => {
      const currentCount = previous[peerUserId] ?? 0;
      return {
        ...previous,
        [peerUserId]: currentCount + 1,
      };
    });
  };

  // A stranger's message is the only thing that ever names them: the directory
  // holds friends only, and the conversation seed is fetched once at launch. So
  // the sender's own username is kept here, or a DM arriving from a non-friend
  // while the app is open opens a sidebar row reading "Bilinmeyen kullanıcı".
  const rememberPeerName = (peerUserId: string, username: string): void => {
    if (!username) {
      return;
    }

    setPeerNamesById((previous) =>
      previous[peerUserId] === username
        ? previous
        : { ...previous, [peerUserId]: username },
    );
  };

  const unreadTotal = useMemo(() => {
    return Object.values(unreadByPeerId).reduce((sum, count) => sum + count, 0);
  }, [unreadByPeerId]);

  const directMessagesQuery = useQuery({
    queryKey: ["direct-messages", selectedUserId],
    queryFn: () =>
      workspaceService.listDirectMessages({
        peerUserId: selectedUserId as string,
        limit: 120,
      }),
    enabled: workspaceSection === "users" && Boolean(selectedUserId),
    staleTime: 3_000,
  });

  const directMessages =
    directMessagesQuery.data?.ok && directMessagesQuery.data.data
      ? directMessagesQuery.data.data.messages
      : [];

  const setDirectMessagesCache = (
    peerUserId: string,
    updater: (currentMessages: ChatMessage[]) => ChatMessage[],
  ): void => {
    queryClient.setQueryData<DesktopResult<{ messages: ChatMessage[] }>>(
      ["direct-messages", peerUserId],
      (previous) => {
        const currentMessages =
          previous?.ok && previous.data ? previous.data.messages : [];

        return {
          ok: true,
          data: {
            messages: updater(currentMessages),
          },
        };
      },
    );
  };

  const handleDirectMessagesStreamEvent = (
    streamEvent: DirectMessagesStreamEvent,
  ): void => {
    if (streamEvent.type === "direct-chat-typing") {
      setTypingByPeerId((previous) => ({
        ...previous,
        [streamEvent.peerUserId]: Date.now(),
      }));
      return;
    }

    // Deletion used to be silent for everyone but the deleter. The DM query has
    // no refetchInterval and refetchOnWindowFocus is off, so a peer with this
    // conversation open kept rendering a deleted message until they switched
    // threads or restarted the app.
    if (streamEvent.type === "direct-chat-message-deleted") {
      setDirectMessagesCache(streamEvent.peerUserId, (currentMessages) =>
        currentMessages.filter(
          (message) => message.id !== streamEvent.message.id,
        ),
      );
      return;
    }

    if (streamEvent.type === "direct-chat-message") {
      const peerUserId = streamEvent.peerUserId;
      // A message that arrived is the end of typing.
      setTypingByPeerId((previous) => {
        if (!previous[peerUserId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[peerUserId];
        return next;
      });

      const incoming = streamEvent.message;
      setDirectMessagesCache(peerUserId, (currentMessages) =>
        upsertMessage(currentMessages, incoming),
      );

      // An edit or a reaction re-publishes an existing message. It is not new
      // mail: notifying and bumping the unread badge for it would mean someone
      // reacting to a week-old message pinged you as if they had written.
      if (incoming.updated) {
        return;
      }

      const isIncoming = incoming.userId !== currentUserId;
      if (!isIncoming) {
        return;
      }

      rememberPeerName(peerUserId, incoming.username);

      const isActivePeer =
        workspaceSection === "users" && selectedUserId === peerUserId;
      const isForegroundFocused =
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        document.hasFocus();

      if (isActivePeer && isForegroundFocused) {
        clearUnreadForPeer(peerUserId);
        return;
      }

      incrementUnreadForPeer(peerUserId);

      // Taskbar attention is all this used to do, and Windows drops that flash
      // after a few seconds. The main process suppresses the toast when the
      // window is focused, so this does not need to re-check.
      //
      // Being named by @username overrides "Rahatsız etmeyin". That setting is
      // for the ambient stream of messages; someone addressing you directly is
      // the case it is not meant to swallow.
      const named = mentionsUser(streamEvent.message.body, currentUsername);
      if (!suppressNotifications || named) {
        void workspaceService.notify({
          kind: "direct-message",
          title: named
            ? `${streamEvent.message.username || "Biri"} sizden bahsetti`
            : streamEvent.message.username || "Yeni mesaj",
          body: streamEvent.message.body.slice(0, 240),
          peerUserId,
        });
      }
      return;
    }

    if (
      streamEvent.type === "stream-status" &&
      streamEvent.status === "connected"
    ) {
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
      return;
    }

    if (streamEvent.type === "system-error") {
      if (shouldEmitWarnStatus(selectedPeerWarnAtRef, 6_000)) {
        setStatus(`Mesaj akışı hatası: ${streamEvent.message}`, "error");
      }
      scheduleDirectStreamReconnect();
      return;
    }

    if (
      streamEvent.type === "stream-status" &&
      streamEvent.status === "closed"
    ) {
      if (shouldEmitWarnStatus(selectedPeerWarnAtRef, 6_000)) {
        setStatus(
          `Mesaj akışı kapandı${streamEvent.detail ? `: ${streamEvent.detail}` : ""}`,
          "warn",
        );
      }
      scheduleDirectStreamReconnect();
    }
  };

  const sendDirectMessageMutation = useMutation({
    mutationFn: (payload: {
      peerUserId: string;
      body: string;
      replyToId?: string;
      attachment?: ChatAttachmentUpload;
      // Local flag, not part of the request. Field-by-field below rather than
      // passing `payload` through so it can never reach the IPC validator.
      keepComposer?: boolean;
    }) => {
      return workspaceService.sendDirectMessage({
        peerUserId: payload.peerUserId,
        body: payload.body,
        replyToId: payload.replyToId,
        attachment: payload.attachment,
      });
    },
    onSuccess: (result, variables) => {
      if (!result.ok) {
        setStatus(
          `Mesaj gönderilemedi: ${getApiErrorMessage(result.error)}`,
          "error",
        );
        return;
      }

      if (result.data?.message && selectedUserId) {
        const nextMessage = result.data.message;
        setDirectMessagesCache(selectedUserId, (currentMessages) =>
          upsertMessage(currentMessages, nextMessage),
        );
      }

      // A GIF send did not come out of the composer, so it must not empty it.
      // Clearing here unconditionally is what destroyed the user's half-typed
      // message the moment they picked a GIF.
      if (variables.keepComposer) {
        return;
      }

      setMessageDraft("");
      setReplyTo(null);
      setPendingAttachment(null);
    },
    onError: (error) => {
      setStatus(
        `Mesaj gönderilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    },
  });

  // bodyOverride is the GIF picker: the URL goes out as its own message and the
  // composer is left exactly as it was. Writing it into the draft instead is
  // what silently ate whatever the user had typed ("şuna bak" + a GIF sent
  // "şuna bak" and threw the GIF away).
  const handleSendMessage = (bodyOverride?: string): void => {
    const isOverride = typeof bodyOverride === "string";
    const body = (isOverride ? bodyOverride : messageDraft).trim();

    if (!selectedUserId) {
      return;
    }

    // An override is a body on its own, so the "empty unless a file is
    // attached" rule does not apply to it -- it must send with an empty draft
    // and no attachment. It still may not send an empty string.
    if (isOverride ? !body : !body && !pendingAttachment) {
      return;
    }

    sendDirectMessageMutation.mutate({
      peerUserId: selectedUserId,
      body,
      // The reply target is honoured (a GIF is a fine reply) but not consumed:
      // keepComposer leaves the chip up for the draft that is still sitting
      // there.
      replyToId: replyTo?.id,
      // A staged file belongs to the draft, not to the GIF.
      attachment: isOverride ? undefined : pendingAttachment?.upload,
      keepComposer: isOverride,
    });
  };

  const editMessageMutation = useMutation({
    mutationFn: (payload: { messageId: string; body: string }) => {
      return workspaceService.editChatMessage(payload);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setStatus(
          `Mesaj düzenlenemedi: ${getApiErrorMessage(result.error)}`,
          "error",
        );
        return;
      }

      if (result.data?.message && selectedUserId) {
        const edited = result.data.message;
        setDirectMessagesCache(selectedUserId, (currentMessages) =>
          upsertMessage(currentMessages, edited),
        );
      }
    },
  });

  const handleEditMessage = useCallback(
    (messageId: string, body: string): void => {
      const trimmed = body.trim();
      if (!messageId || !trimmed) {
        return;
      }
      editMessageMutation.mutate({ messageId, body: trimmed });
    },
    [editMessageMutation],
  );

  const reactionMutation = useMutation({
    mutationFn: (payload: {
      messageId: string;
      emoji: string;
      add: boolean;
    }) => {
      return workspaceService.setChatReaction(payload);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setStatus(
          `Tepki kaydedilemedi: ${getApiErrorMessage(result.error)}`,
          "error",
        );
        return;
      }

      if (result.data?.message && selectedUserId) {
        const reacted = result.data.message;
        setDirectMessagesCache(selectedUserId, (currentMessages) =>
          upsertMessage(currentMessages, reacted),
        );
      }
    },
  });

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string, add: boolean): void => {
      reactionMutation.mutate({ messageId, emoji, add });
    },
    [reactionMutation],
  );

  // Search runs against the server rather than the loaded page: the point of it
  // is to reach the history that is NOT on screen.
  const runSearch = useCallback(
    (query: string): void => {
      const trimmed = query.trim();
      setSearchQuery(trimmed);

      if (!selectedUserId || trimmed.length < 2) {
        setSearchResults(null);
        return;
      }

      setIsSearching(true);
      void workspaceService
        .searchDirectMessages({ peerUserId: selectedUserId, query: trimmed })
        .then((result) => {
          if (!result.ok || !result.data) {
            setSearchResults([]);
            return;
          }
          setSearchResults(result.data.messages);
        })
        .finally(() => {
          setIsSearching(false);
        });
    },
    [selectedUserId],
  );

  const clearSearch = useCallback((): void => {
    setSearchQuery("");
    setSearchResults(null);
  }, []);

  const deleteDirectMessageMutation = useMutation({
    mutationFn: (payload: { messageId: string }) => {
      return workspaceService.deleteChatMessage(payload);
    },
    onMutate: ({ messageId }) => {
      setDeletingMessageId(messageId);
    },
    onSuccess: (result, variables) => {
      if (!result.ok) {
        setStatus(
          `Mesaj silinemedi: ${getApiErrorMessage(result.error)}`,
          "error",
        );
        return;
      }

      if (!selectedUserId) {
        return;
      }

      setDirectMessagesCache(selectedUserId, (currentMessages) => {
        return currentMessages.filter(
          (message) => message.id !== variables.messageId,
        );
      });
    },
    onError: (error) => {
      setStatus(
        `Mesaj silinemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    },
    onSettled: () => {
      setDeletingMessageId(null);
    },
  });

  const handleDeleteMessage = (messageId: string): void => {
    if (!selectedUserId) {
      return;
    }

    const normalizedMessageID = messageId.trim();
    if (!normalizedMessageID) {
      return;
    }

    deleteDirectMessageMutation.mutate({
      messageId: normalizedMessageID,
    });
  };

  useEffect(() => {
    const unsubscribe = workspaceService.onDirectMessagesEvent(
      handleDirectMessagesStreamEvent,
    );

    return unsubscribe;
  }, [currentUserId, selectedUserId, setStatus, workspaceSection]);

  useEffect(() => {
    if (!selectedUserId || workspaceSection !== "users") {
      return;
    }

    clearUnreadForPeer(selectedUserId);
  }, [selectedUserId, workspaceSection]);

  useEffect(() => {
    void workspaceService.setWindowAttention({
      enabled: unreadTotal > 0,
    });
  }, [unreadTotal]);

  useEffect(() => {
    return () => {
      void workspaceService.setWindowAttention({
        enabled: false,
      });
    };
  }, []);

  // The socket is no longer keyed by peer, so this effect only re-runs when the
  // app moves in or out of a section that wants messages at all — not every
  // time the user directory changes.
  useEffect(() => {
    streamWantedRef.current = true;

    let cancelled = false;

    void startDirectMessageStream().then((started) => {
      if (cancelled || started) {
        return;
      }

      reconnectAttemptRef.current += 1;
      scheduleDirectStreamReconnect();
    });

    const handleOnline = (): void => {
      if (!streamWantedRef.current) {
        return;
      }

      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
      scheduleDirectStreamReconnect(true);
    };

    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      reconnectAttemptRef.current = 0;
      reconnectInFlightRef.current = false;
      clearReconnectTimer();
      streamWantedRef.current = false;
      void workspaceService.stopDirectMessagesStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching conversations resets the whole composer, not just the text: a
  // reply target or a staged file belonging to the previous thread would
  // otherwise be sent into this one.
  useEffect(() => {
    setMessageDraft("");
    setReplyTo(null);
    setPendingAttachment(null);
    setSearchQuery("");
    setSearchResults(null);
  }, [selectedUserId]);

  // Expire stale typing entries. Polling once a second is cheaper and simpler
  // than a timer per peer, and the indicator is not precision work.
  useEffect(() => {
    if (Object.keys(typingByPeerId).length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      const cutoff = Date.now() - TYPING_EXPIRY_MS;
      setTypingByPeerId((previous) => {
        const next: Record<string, number> = {};
        for (const [peerUserId, at] of Object.entries(previous)) {
          if (at > cutoff) {
            next[peerUserId] = at;
          }
        }
        return Object.keys(next).length === Object.keys(previous).length
          ? previous
          : next;
      });
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [typingByPeerId]);

  const typingPeerIds = useMemo(
    () => Object.keys(typingByPeerId),
    [typingByPeerId],
  );

  // Prepends the page immediately older than the oldest message on screen.
  // Conversations used to stop at the newest 120 messages with no way back.
  const loadOlderMessages = useCallback((): void => {
    if (!selectedUserId || isLoadingOlderMessages) {
      return;
    }
    if (exhaustedPeerIds.includes(selectedUserId)) {
      return;
    }

    const cached = queryClient.getQueryData<
      DesktopResult<{ messages: ChatMessage[] }>
    >(["direct-messages", selectedUserId]);
    const oldest =
      cached?.ok && cached.data ? cached.data.messages[0] : undefined;
    if (!oldest) {
      return;
    }

    const peerUserId = selectedUserId;
    setIsLoadingOlderMessages(true);
    void workspaceService
      .listDirectMessages({ peerUserId, limit: 80, before: oldest.id })
      .then((result) => {
        if (!result.ok || !result.data) {
          return;
        }

        const older = result.data.messages;
        if (older.length === 0) {
          setExhaustedPeerIds((previous) =>
            previous.includes(peerUserId) ? previous : [...previous, peerUserId],
          );
          return;
        }

        setDirectMessagesCache(peerUserId, (currentMessages) => {
          // The live socket may have inserted something while the page was in
          // flight; dedupe rather than trusting the two halves not to overlap.
          const known = new Set(currentMessages.map((message) => message.id));
          return [
            ...older.filter((message) => !known.has(message.id)),
            ...currentMessages,
          ];
        });

        if (result.data.hasMore === false) {
          setExhaustedPeerIds((previous) =>
            previous.includes(peerUserId) ? previous : [...previous, peerUserId],
          );
        }
      })
      .finally(() => {
        setIsLoadingOlderMessages(false);
      });
  }, [selectedUserId, isLoadingOlderMessages, exhaustedPeerIds, queryClient]);

  // Seed the badges once the directory is known. Unread state used to live only
  // in this component's state, so every restart showed zero unread even when
  // messages had arrived while the app was closed.
  const seededUnreadRef = useRef(false);
  useEffect(() => {
    if (seededUnreadRef.current || !peerUserIds || peerUserIds.length === 0) {
      return;
    }

    seededUnreadRef.current = true;
    void workspaceService
      .getDirectUnreadCounts({ peerUserIds })
      .then((result) => {
        if (!result.ok || !result.data) {
          return;
        }
        const seeded = result.data.unreadByPeerUserId;
        // Merge, not replace: a message may have landed on the socket while
        // this request was in flight.
        setUnreadByPeerId((previous) => ({ ...seeded, ...previous }));
      });
  }, [peerUserIds]);

  // Read state lives on the server now: opening a conversation clears the badge
  // for every device, and the unread markers survive a restart.
  useEffect(() => {
    if (!selectedUserId || workspaceSection !== "users") {
      return;
    }

    void workspaceService.markDirectRead({ peerUserId: selectedUserId });
  }, [selectedUserId, workspaceSection, directMessages.length]);

  const notifyTyping = useCallback((): void => {
    if (!selectedUserId) {
      return;
    }

    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_INTERVAL_MS) {
      return;
    }

    lastTypingPingRef.current = now;
    void workspaceService.sendDirectTyping({ peerUserId: selectedUserId });
  }, [selectedUserId]);

  return {
    directMessagesQuery,
    directMessages,
    messageDraft,
    setMessageDraft,
    isSendingMessage: sendDirectMessageMutation.isPending,
    handleSendMessage,
    handleDeleteMessage,
    deletingMessageId,
    unreadByPeerId,
    peerNamesById,
    typingPeerIds,
    notifyTyping,
    loadOlderMessages,
    isLoadingOlderMessages,
    hasMoreMessages: Boolean(
      selectedUserId && !exhaustedPeerIds.includes(selectedUserId),
    ),
    pendingAttachment,
    setPendingAttachment,
    replyTo,
    setReplyTo,
    handleEditMessage,
    handleToggleReaction,
    searchQuery,
    searchResults,
    isSearching,
    runSearch,
    clearSearch,
  };
};



