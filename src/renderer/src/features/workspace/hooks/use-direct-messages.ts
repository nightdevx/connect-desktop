import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ChatMessage } from "../../../../../shared/auth-contracts";
import type {
  DesktopResult,
  DirectMessagesStreamEvent,
} from "../../../../../shared/desktop-api-types";
import workspaceService from "../../../services/workspace-service";
import { getApiErrorMessage } from "../workspace-utils";

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
  peerUserIds: string[];
  selectedUserId: string | null;
  workspaceSection: "users" | "lobbies" | "settings";
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
}

export interface UseDirectMessagesResult {
  directMessagesQuery: UseQueryResult<
    DesktopResult<{ messages: ChatMessage[] }>,
    Error
  >;
  directMessages: ChatMessage[];
  messageDraft: string;
  setMessageDraft: (value: string) => void;
  isSendingMessage: boolean;
  handleSendMessage: () => void;
  handleDeleteMessage: (messageId: string) => void;
  deletingMessageId: string | null;
  unreadByPeerId: Record<string, number>;
}

export const useDirectMessages = ({
  currentUserId,
  peerUserIds,
  selectedUserId,
  workspaceSection,
  setStatus,
}: UseDirectMessagesParams): UseDirectMessagesResult => {
  const queryClient = useQueryClient();
  const [messageDraft, setMessageDraft] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const [unreadByPeerId, setUnreadByPeerId] = useState<Record<string, number>>(
    {},
  );
  const activePeerUserIdsRef = useRef<string[]>([]);
  const streamsWantedRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectInFlightRef = useRef(false);
  const reconnectWarnAtRef = useRef(0);
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

  const startAllDirectMessageStreams = async (): Promise<boolean> => {
    if (!streamsWantedRef.current) {
      return true;
    }

    if (reconnectInFlightRef.current) {
      return true;
    }

    const peerIDs = activePeerUserIdsRef.current;
    if (peerIDs.length === 0) {
      return true;
    }

    reconnectInFlightRef.current = true;
    try {
      let failedCount = 0;
      let lastErrorMessage: string | null = null;

      await Promise.all(
        peerIDs.map(async (peerUserId) => {
          const result = await workspaceService.startDirectMessagesStream({
            peerUserId,
          });

          if (result.ok) {
            return;
          }

          failedCount += 1;
          lastErrorMessage = getApiErrorMessage(result.error);
        }),
      );

      if (failedCount === 0) {
        reconnectAttemptRef.current = 0;
        return true;
      }

      if (shouldEmitWarnStatus(reconnectWarnAtRef, 10_000)) {
        setStatus(
          `Mesaj akışı yeniden bağlanamadı (${failedCount}/${peerIDs.length}): ${lastErrorMessage ?? "Bilinmeyen hata"}`,
          "warn",
        );
      }

      return false;
    } finally {
      reconnectInFlightRef.current = false;
    }
  };

  const scheduleDirectStreamReconnect = (immediate = false): void => {
    if (
      !streamsWantedRef.current ||
      activePeerUserIdsRef.current.length === 0
    ) {
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

      if (!streamsWantedRef.current) {
        return;
      }

      if (!isBrowserOnline()) {
        scheduleDirectStreamReconnect();
        return;
      }

      void startAllDirectMessageStreams().then((started) => {
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

  const unreadTotal = useMemo(() => {
    return Object.values(unreadByPeerId).reduce((sum, count) => sum + count, 0);
  }, [unreadByPeerId]);

  const normalizedPeerUserIds = useMemo(() => {
    return Array.from(
      new Set(
        peerUserIds
          .map((peerUserId) => peerUserId.trim())
          .filter((peerUserId) => peerUserId.length > 0),
      ),
    );
  }, [peerUserIds]);

  const sortedPeerUserIds = useMemo(() => {
    return [...normalizedPeerUserIds].sort((left, right) => {
      return left.localeCompare(right, "tr");
    });
  }, [normalizedPeerUserIds]);

  const peerUserIdsKey = useMemo(() => {
    return sortedPeerUserIds.join("|");
  }, [sortedPeerUserIds]);

  useEffect(() => {
    activePeerUserIdsRef.current = sortedPeerUserIds;
  }, [sortedPeerUserIds]);

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
    const peerUserId = streamEvent.peerUserId;
    if (!peerUserId) {
      return;
    }

    if (streamEvent.type === "direct-chat-history") {
      setDirectMessagesCache(peerUserId, () => streamEvent.messages);
      return;
    }

    if (streamEvent.type === "direct-chat-message") {
      setDirectMessagesCache(peerUserId, (currentMessages) => {
        const exists = currentMessages.some(
          (message) => message.id === streamEvent.message.id,
        );
        if (exists) {
          return currentMessages;
        }

        return [...currentMessages, streamEvent.message];
      });

      const isIncoming = streamEvent.message.userId !== currentUserId;
      if (!isIncoming) {
        return;
      }

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

    if (streamEvent.type === "system-error" && selectedUserId === peerUserId) {
      if (shouldEmitWarnStatus(selectedPeerWarnAtRef, 6_000)) {
        setStatus(`Mesaj akışı hatası: ${streamEvent.message}`, "error");
      }
    }

    if (streamEvent.type === "system-error") {
      scheduleDirectStreamReconnect();
      return;
    }

    if (
      streamEvent.type === "stream-status" &&
      streamEvent.status === "closed" &&
      selectedUserId === peerUserId
    ) {
      if (shouldEmitWarnStatus(selectedPeerWarnAtRef, 6_000)) {
        setStatus(
          `Mesaj akışı kapandı${streamEvent.detail ? `: ${streamEvent.detail}` : ""}`,
          "warn",
        );
      }
    }

    if (
      streamEvent.type === "stream-status" &&
      streamEvent.status === "closed"
    ) {
      scheduleDirectStreamReconnect();
    }
  };

  const sendDirectMessageMutation = useMutation({
    mutationFn: (payload: { peerUserId: string; body: string }) => {
      return workspaceService.sendDirectMessage(payload);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setStatus(
          `Mesaj gönderilemedi: ${getApiErrorMessage(result.error)}`,
          "error",
        );
        return;
      }

      if (result.data?.message && selectedUserId) {
        const nextMessage = result.data.message;
        setDirectMessagesCache(selectedUserId, (currentMessages) => {
          const exists = currentMessages.some(
            (message) => message.id === nextMessage.id,
          );
          if (exists) {
            return currentMessages;
          }

          return [...currentMessages, nextMessage];
        });
      }

      setMessageDraft("");
    },
    onError: (error) => {
      setStatus(
        `Mesaj gönderilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    },
  });

  const handleSendMessage = (): void => {
    const body = messageDraft.trim();
    if (!selectedUserId || !body) {
      return;
    }

    sendDirectMessageMutation.mutate({
      peerUserId: selectedUserId,
      body,
    });
  };

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

  useEffect(() => {
    const shouldStream =
      workspaceSection === "users" && sortedPeerUserIds.length > 0;
    streamsWantedRef.current = shouldStream;

    if (!shouldStream) {
      reconnectAttemptRef.current = 0;
      reconnectInFlightRef.current = false;
      clearReconnectTimer();
      void workspaceService.stopDirectMessagesStream();
      return;
    }

    let cancelled = false;

    void startAllDirectMessageStreams().then((started) => {
      if (cancelled || started) {
        return;
      }

      reconnectAttemptRef.current += 1;
      scheduleDirectStreamReconnect();
    });

    const handleOnline = (): void => {
      if (!streamsWantedRef.current) {
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
      streamsWantedRef.current = false;
      void workspaceService.stopDirectMessagesStream();
    };
  }, [peerUserIdsKey, setStatus, sortedPeerUserIds, workspaceSection]);

  useEffect(() => {
    setMessageDraft("");
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
  };
};
