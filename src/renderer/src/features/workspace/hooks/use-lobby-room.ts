import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ChatMessage } from "../../../../../shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "../../../../../shared/desktop-api-types";
import workspaceService from "../../../services/workspace-service";
import { getApiErrorMessage } from "../workspace-utils";

interface UseLobbyRoomParams {
  activeLobbyId: string | null;
  workspaceSection: "users" | "lobbies" | "settings";
  setStatus: (message: string, tone: "ok" | "warn" | "error") => void;
}

type LobbyMemberStatePatch = Partial<
  Pick<
    LobbyStateMember,
    "muted" | "deafened" | "speaking" | "cameraEnabled" | "screenSharing"
  >
>;

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
}

export const useLobbyRoom = ({
  activeLobbyId,
  workspaceSection,
  setStatus,
}: UseLobbyRoomParams): UseLobbyRoomResult => {
  const [lobbyMessageDraft, setLobbyMessageDraft] = useState("");
  const queryClient = useQueryClient();

  const lobbyStateQuery = useQuery({
    queryKey: ["lobby-state", activeLobbyId],
    queryFn: () =>
      workspaceService.getLobbyState({
        lobbyId: activeLobbyId as string,
      }),
    enabled: workspaceSection === "lobbies" && Boolean(activeLobbyId),
    refetchInterval: 1_200,
    refetchIntervalInBackground: true,
    staleTime: 600,
  });

  const lobbyMessagesQuery = useQuery({
    queryKey: ["lobby-messages", activeLobbyId],
    queryFn: () =>
      workspaceService.listLobbyMessages({
        lobbyId: activeLobbyId as string,
        limit: 150,
      }),
    enabled: workspaceSection === "lobbies" && Boolean(activeLobbyId),
    refetchInterval: 3_000,
    staleTime: 1_500,
  });

  const lobbyMembers =
    lobbyStateQuery.data?.ok && lobbyStateQuery.data.data
      ? lobbyStateQuery.data.data.members
      : [];

  const lobbyMessages =
    lobbyMessagesQuery.data?.ok && lobbyMessagesQuery.data.data
      ? lobbyMessagesQuery.data.data.messages
      : [];

  const sendLobbyMessageMutation = useMutation({
    mutationFn: (payload: { lobbyId: string; body: string }) => {
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

      queryClient.setQueryData<DesktopResult<{ messages: ChatMessage[] }>>(
        ["lobby-messages", activeLobbyId],
        (previous) => {
          const currentMessages =
            previous?.ok && previous.data ? previous.data.messages : [];

          const exists = currentMessages.some(
            (message) => message.id === sentMessage.id,
          );

          if (exists) {
            return previous;
          }

          return {
            ok: true,
            data: {
              messages: [...currentMessages, sentMessage],
            },
          };
        },
      );

      setLobbyMessageDraft("");
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
      return workspaceService.deleteChatMessage(payload);
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
        (previous) => {
          if (!previous?.ok || !previous.data) {
            return previous;
          }

          return {
            ok: true,
            data: {
              messages: previous.data.messages.filter(
                (message) => message.id !== variables.messageId,
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
    if (!activeLobbyId || !body) {
      return;
    }

    sendLobbyMessageMutation.mutate({
      lobbyId: activeLobbyId,
      body,
    });
  };

  const deleteLobbyMessage = (messageId: string): void => {
    const normalizedMessageID = messageId.trim();
    if (!activeLobbyId || !normalizedMessageID) {
      return;
    }

    deleteLobbyMessageMutation.mutate({ messageId: normalizedMessageID });
  };

  useEffect(() => {
    setLobbyMessageDraft("");
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
          revision: previous.data.revision + 1,
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
  };
};
