import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ChatMessage } from "@shared/auth-contracts";
import type {
  ChatAttachmentUpload,
  DesktopResult,
  LobbyStateMember,
} from "@shared/desktop-api-types";
import workspaceService from "../../services";
import { getApiErrorMessage } from "../../workspace-utils";
import type { PendingAttachment } from "../chat/use-direct-messages";

interface UseLobbyRoomParams {
  activeLobbyId: string | null;
  workspaceSection: "users" | "lobbies" | "settings";
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
}

type LobbyMemberStatePatch = Partial<
  Pick<
    LobbyStateMember,
    "muted" | "deafened" | "cameraEnabled" | "screenSharing"
  >
>;

// upsertMessage replaces by id when the message is already known and appends
// otherwise. Shared shape with the direct-message hook.
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

export interface UseLobbyRoomResult {
  lobbyStateQuery: UseQueryResult<
    DesktopResult<{
      lobbyId: string;
      members: LobbyStateMember[];
      size: number;
      revision: number;
    }>,
    Error
  >;
  lobbyMessagesQuery: UseQueryResult<
    DesktopResult<{ messages: ChatMessage[] }>,
    Error
  >;
  lobbyMembers: LobbyStateMember[];
  lobbyMessages: ChatMessage[];
  lobbyMessageDraft: string;
  setLobbyMessageDraft: (value: string) => void;
  sendLobbyMessage: () => void;
  deleteLobbyMessage: (messageId: string) => void;
  isSendingLobbyMessage: boolean;
  deletingLobbyMessageId: string | null;
  patchLobbyMemberState: (userId: string, patch: LobbyMemberStatePatch) => void;
  lobbyReplyTo: ChatMessage | null;
  setLobbyReplyTo: (value: ChatMessage | null) => void;
  lobbyPendingAttachment: PendingAttachment | null;
  setLobbyPendingAttachment: (value: PendingAttachment | null) => void;
  editLobbyMessage: (messageId: string, body: string) => void;
  toggleLobbyReaction: (
    messageId: string,
    emoji: string,
    add: boolean,
  ) => void;
  lobbySearchQuery: string;
  lobbySearchResults: ChatMessage[] | null;
  isSearchingLobbyMessages: boolean;
  runLobbySearch: (query: string) => void;
  clearLobbySearch: () => void;
}

export const useLobbyRoom = ({
  activeLobbyId,
  workspaceSection,
  setStatus,
}: UseLobbyRoomParams): UseLobbyRoomResult => {
  const [lobbyMessageDraft, setLobbyMessageDraft] = useState("");
  const [lobbyReplyTo, setLobbyReplyTo] = useState<ChatMessage | null>(null);
  const [lobbyPendingAttachment, setLobbyPendingAttachment] =
    useState<PendingAttachment | null>(null);
  const [lobbySearchQuery, setLobbySearchQuery] = useState("");
  // null = not searching; [] = searched and found nothing.
  const [lobbySearchResults, setLobbySearchResults] = useState<
    ChatMessage[] | null
  >(null);
  const [isSearchingLobbyMessages, setIsSearchingLobbyMessages] =
    useState(false);
  const queryClient = useQueryClient();

  const lobbyStateQuery = useQuery({
    queryKey: ["lobby-state", activeLobbyId],
    queryFn: () =>
      workspaceService.getLobbyState({
        lobbyId: activeLobbyId as string,
      }),
    // Not gated on the visible tab: the roster is also needed for the call
    // overlay and the quick controls, which live outside the Lobbies section.
    enabled: activeLobbyId !== null && !activeLobbyId.startsWith("call_"),
    // Roster comes primarily from the lobby WS snapshot (~1s) and liveness is
    // now driven by that same socket, so this REST poll is purely a fallback
    // for when the stream is down and can run slowly.
    refetchInterval: 8_000,
    refetchIntervalInBackground: true,
    staleTime: 4_000,
  });

  const lobbyMessagesQuery = useQuery({
    queryKey: ["lobby-messages", activeLobbyId],
    queryFn: () =>
      workspaceService.listLobbyMessages({
        lobbyId: activeLobbyId as string,
        limit: 150,
      }),
    enabled: workspaceSection === "lobbies" && activeLobbyId !== null && !activeLobbyId.startsWith("call_"),
    // Messages arrive over the lobby websocket now; this only backfills after a
    // stream drop, so it no longer needs to run every 3 seconds.
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  // Live chat push. Appending to the cache directly keeps the message list from
  // waiting on a refetch round trip.
  useEffect(() => {
    if (!activeLobbyId || activeLobbyId.startsWith("call_")) {
      return;
    }

    return workspaceService.onLobbyStreamEvent((event) => {
      // The roster used to come only from the 8-second REST poll, so another
      // member's mic or headphone state could be up to 8 seconds stale on
      // everyone else's screen — long enough to read as "their mic is stuck".
      // The websocket already pushes a full snapshot about once a second;
      // feeding it into the same query cache makes it the single source and
      // removes the lag.
      if (event.type === "lobbies-snapshot") {
        const snapshot = event.lobbies.find(
          (lobby) => lobby.id === activeLobbyId,
        );
        if (!snapshot) {
          return;
        }

        queryClient.setQueryData<
          DesktopResult<{
            lobbyId: string;
            members: LobbyStateMember[];
            size: number;
            revision: number;
          }>
        >(["lobby-state", activeLobbyId], (previous) => {
          // Revisions only ever increase, so an out-of-order or replayed frame
          // cannot rewind the roster over a newer optimistic patch.
          if (
            previous?.ok &&
            previous.data &&
            previous.data.revision > snapshot.revision
          ) {
            return previous;
          }

          return {
            ok: true,
            data: {
              lobbyId: snapshot.id,
              members: snapshot.members,
              size: snapshot.size,
              revision: snapshot.revision,
            },
          };
        });
        return;
      }

      if (event.type !== "lobby-message" && event.type !== "lobby-message-deleted") {
        return;
      }

      if (event.lobbyId !== activeLobbyId) {
        return;
      }

      // Removals arrive as their own frame, so a delete no longer waits out the
      // 30s refetch on every other client.
      if (event.type === "lobby-message-deleted") {
        queryClient.setQueryData<DesktopResult<{ messages: ChatMessage[] }>>(
          ["lobby-messages", activeLobbyId],
          (previous) => {
            if (!previous?.ok || !previous.data) {
              return previous;
            }

            return {
              ok: true,
              data: {
                messages: previous.data.messages.filter(
                  (message) => message.id !== event.message.id,
                ),
              },
            };
          },
        );
        return;
      }

      queryClient.setQueryData<DesktopResult<{ messages: ChatMessage[] }>>(
        ["lobby-messages", activeLobbyId],
        (previous) => {
          const current = previous?.ok && previous.data ? previous.data.messages : [];
          // Upsert, not append-if-absent: an edit or a reaction re-publishes the
          // same id, and "skip if it exists" silently dropped every one.
          return {
            ok: true,
            data: { messages: upsertMessage(current, event.message) },
          };
        },
      );
    });
  }, [activeLobbyId, queryClient]);

  const lobbyMembers =
    lobbyStateQuery.data?.ok && lobbyStateQuery.data.data
      ? lobbyStateQuery.data.data.members
      : [];

  const lobbyMessages =
    lobbyMessagesQuery.data?.ok && lobbyMessagesQuery.data.data
      ? lobbyMessagesQuery.data.data.messages
      : [];

  const setLobbyMessagesCache = (
    updater: (currentMessages: ChatMessage[]) => ChatMessage[],
  ): void => {
    if (!activeLobbyId) {
      return;
    }

    queryClient.setQueryData<DesktopResult<{ messages: ChatMessage[] }>>(
      ["lobby-messages", activeLobbyId],
      (previous) => {
        const currentMessages =
          previous?.ok && previous.data ? previous.data.messages : [];
        return { ok: true, data: { messages: updater(currentMessages) } };
      },
    );
  };

  const sendLobbyMessageMutation = useMutation({
    mutationFn: (payload: {
      lobbyId: string;
      body: string;
      replyToId?: string;
      attachment?: ChatAttachmentUpload;
    }) => {
      return workspaceService.sendLobbyMessage(payload);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setStatus(
          `Lobi mesajı gönderilemedi: ${getApiErrorMessage(result.error)}`,
          "error",
        );
        return;
      }

      const sentMessage = result.data?.message;
      if (!sentMessage || !activeLobbyId) {
        return;
      }

      setLobbyMessagesCache((currentMessages) =>
        upsertMessage(currentMessages, sentMessage),
      );

      setLobbyMessageDraft("");
      setLobbyReplyTo(null);
      setLobbyPendingAttachment(null);
    },
    onError: (error) => {
      setStatus(
        `Lobi mesajı gönderilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    },
  });

  const [deletingLobbyMessageId, setDeletingLobbyMessageId] = useState<
    string | null
  >(null);

  const deleteLobbyMessageMutation = useMutation({
    mutationFn: (payload: { messageId: string }) => {
      return workspaceService.deleteChatMessage(payload) as Promise<
        DesktopResult<any>
      >;
    },
    onMutate: (variables) => {
      setDeletingLobbyMessageId(variables.messageId);
    },
    onSuccess: (result, variables) => {
      if (!result.ok) {
        setStatus(
          `Mesaj silinemedi: ${getApiErrorMessage(result.error)}`,
          "error",
        );
        return;
      }

      if (!activeLobbyId) {
        return;
      }

      queryClient.setQueryData<DesktopResult<{ messages: ChatMessage[] }>>(
        ["lobby-messages", activeLobbyId],
        (previous: DesktopResult<{ messages: ChatMessage[] }> | undefined) => {
          if (!previous?.ok || !previous.data) {
            return previous;
          }

          return {
            ok: true,
            data: {
              messages: previous.data.messages.filter(
                (message: ChatMessage) => message.id !== variables.messageId,
              ),
            },
          };
        },
      );
    },
    onError: (error) => {
      setStatus(
        `Mesaj silinemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        "error",
      );
    },
    onSettled: () => {
      setDeletingLobbyMessageId(null);
    },
  });

  const sendLobbyMessage = (): void => {
    const body = lobbyMessageDraft.trim();
    // Attachment-only messages are allowed, so an empty body is fine when a
    // file is staged.
    if (!activeLobbyId || (!body && !lobbyPendingAttachment)) {
      return;
    }

    sendLobbyMessageMutation.mutate({
      lobbyId: activeLobbyId,
      body,
      replyToId: lobbyReplyTo?.id,
      attachment: lobbyPendingAttachment?.upload,
    });
  };

  const editLobbyMessageMutation = useMutation({
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
      if (result.data?.message) {
        const edited = result.data.message;
        setLobbyMessagesCache((currentMessages) =>
          upsertMessage(currentMessages, edited),
        );
      }
    },
  });

  const lobbyReactionMutation = useMutation({
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
      if (result.data?.message) {
        const reacted = result.data.message;
        setLobbyMessagesCache((currentMessages) =>
          upsertMessage(currentMessages, reacted),
        );
      }
    },
  });

  const editLobbyMessage = (messageId: string, body: string): void => {
    const trimmed = body.trim();
    if (!messageId || !trimmed) {
      return;
    }
    editLobbyMessageMutation.mutate({ messageId, body: trimmed });
  };

  const toggleLobbyReaction = (
    messageId: string,
    emoji: string,
    add: boolean,
  ): void => {
    lobbyReactionMutation.mutate({ messageId, emoji, add });
  };

  const runLobbySearch = (query: string): void => {
    const trimmed = query.trim();
    setLobbySearchQuery(trimmed);

    if (!activeLobbyId || trimmed.length < 2) {
      setLobbySearchResults(null);
      return;
    }

    const lobbyId = activeLobbyId;
    setIsSearchingLobbyMessages(true);
    void workspaceService
      .searchLobbyMessages({ lobbyId, query: trimmed })
      .then((result) => {
        setLobbySearchResults(
          result.ok && result.data ? result.data.messages : [],
        );
      })
      .finally(() => {
        setIsSearchingLobbyMessages(false);
      });
  };

  const clearLobbySearch = (): void => {
    setLobbySearchQuery("");
    setLobbySearchResults(null);
  };

  const deleteLobbyMessage = (messageId: string): void => {
    const normalizedMessageID = messageId.trim();
    if (!activeLobbyId || !normalizedMessageID) {
      return;
    }

    deleteLobbyMessageMutation.mutate({ messageId: normalizedMessageID });
  };

  // Changing rooms resets the whole composer: a reply target or a staged file
  // from the previous room must not be sent into this one.
  useEffect(() => {
    setLobbyMessageDraft("");
    setLobbyReplyTo(null);
    setLobbyPendingAttachment(null);
    setLobbySearchQuery("");
    setLobbySearchResults(null);
  }, [activeLobbyId]);

  const patchLobbyMemberState = (
    userId: string,
    patch: LobbyMemberStatePatch,
  ): void => {
    if (!activeLobbyId) {
      return;
    }

    queryClient.setQueryData<
      DesktopResult<{
        lobbyId: string;
        members: LobbyStateMember[];
        size: number;
        revision: number;
      }>
    >(["lobby-state", activeLobbyId], (previous) => {
      if (!previous?.ok || !previous.data) {
        return previous;
      }

      const members = previous.data.members.map((member) => {
        if (member.userId !== userId) {
          return member;
        }

        return {
          ...member,
          ...patch,
        };
      });

      return {
        ok: true,
        data: {
          ...previous.data,
          members,
          // Deliberately NOT bumped. This is a local guess, not a new server
          // revision, and inflating it made the guess outrank the next
          // websocket snapshot — which is the thing that would have corrected
          // it. react-query re-renders on the new object either way.
          revision: previous.data.revision,
        },
      };
    });
  };

  return {
    lobbyStateQuery,
    lobbyMessagesQuery,
    lobbyMembers,
    lobbyMessages,
    lobbyMessageDraft,
    setLobbyMessageDraft,
    sendLobbyMessage,
    deleteLobbyMessage,
    isSendingLobbyMessage: sendLobbyMessageMutation.isPending,
    deletingLobbyMessageId,
    patchLobbyMemberState,
    lobbyReplyTo,
    setLobbyReplyTo,
    lobbyPendingAttachment,
    setLobbyPendingAttachment,
    editLobbyMessage,
    toggleLobbyReaction,
    lobbySearchQuery,
    lobbySearchResults,
    isSearchingLobbyMessages,
    runLobbySearch,
    clearLobbySearch,
  };
};



