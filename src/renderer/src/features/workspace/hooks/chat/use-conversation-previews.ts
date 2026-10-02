import { useQueries } from "@tanstack/react-query";
import type { ChatMessage } from "@shared/auth-contracts";
import workspaceService from "../../services";

export const conversationPreviewKey = (peerUserId: string) =>
  ["direct-message-preview", peerUserId] as const;

/**
 * The newest message of each open conversation, for the sidebar row's second
 * line. Read once per thread, one message each; after that the direct-message
 * stream keeps the entry current -- use-direct-messages writes every message it
 * sees into the same key, and re-reads them after a reconnect.
 */
export function useConversationPreviews(
  peerUserIds: string[],
): Record<string, ChatMessage | null | undefined> {
  return useQueries({
    queries: peerUserIds.map((peerUserId) => ({
      queryKey: conversationPreviewKey(peerUserId),
      queryFn: async (): Promise<ChatMessage | null> => {
        const result = await workspaceService.listDirectMessages({
          peerUserId,
          limit: 1,
        });
        const messages = result.ok && result.data ? result.data.messages : [];
        return messages[messages.length - 1] ?? null;
      },
      staleTime: Infinity,
    })),
    combine: (results) =>
      Object.fromEntries(
        peerUserIds.map((peerUserId, index) => [peerUserId, results[index]?.data]),
      ),
  });
}
