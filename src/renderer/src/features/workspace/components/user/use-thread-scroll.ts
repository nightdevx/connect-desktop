import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";

// Three behaviours share one scroll container: jump to the newest message when a
// conversation opens, follow new messages only while the reader is already at
// the bottom, and pull the previous page in when they reach the top.
//
// The version this replaced forced scrollTop to the bottom on every length
// change, which is why older messages needed a button: prepending a page would
// otherwise have thrown the reader straight back to the newest message.

/** How close to the bottom still counts as "following the conversation". */
const AT_BOTTOM_SLACK_PX = 80;
/** How close to the top asks for the previous page. */
const LOAD_OLDER_TRIGGER_PX = 120;

export interface ThreadScrollOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  /** Changing this is what counts as "a different conversation opened". */
  peerUserId: string | null;
  messageCount: number;
  hasMoreMessages: boolean;
  isLoadingOlderMessages: boolean;
  onLoadOlderMessages?: () => void;
}

export function useThreadScroll({
  containerRef,
  peerUserId,
  messageCount,
  hasMoreMessages,
  isLoadingOlderMessages,
  onLoadOlderMessages,
}: ThreadScrollOptions): {
  handleChatScroll: () => void;
  attachMessageList: (node: HTMLDivElement | null) => void;
} {
  const atBottomRef = useRef(true);
  // Set from the moment the previous page is asked for until it lands, so one
  // gesture asks once, and the landing is not mistaken for a new message.
  const olderRequestedRef = useRef(false);
  const lastPeerIdRef = useRef<string | null>(null);

  const handleChatScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    atBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      AT_BOTTOM_SLACK_PX;

    if (
      container.scrollTop < LOAD_OLDER_TRIGGER_PX &&
      hasMoreMessages &&
      !isLoadingOlderMessages &&
      !olderRequestedRef.current &&
      messageCount > 0
    ) {
      olderRequestedRef.current = true;
      onLoadOlderMessages?.();
    }
  }, [
    containerRef,
    hasMoreMessages,
    isLoadingOlderMessages,
    onLoadOlderMessages,
    messageCount,
  ]);

  // Layout effect, not effect: a jump to the bottom has to land in the same
  // frame as the message, or the thread visibly jumps.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!peerUserId || !container) {
      return;
    }

    if (lastPeerIdRef.current !== peerUserId) {
      lastPeerIdRef.current = peerUserId;
      olderRequestedRef.current = false;
      atBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
      return;
    }

    // The previous page landed. The message being read stays where it was:
    // VirtualChatList anchors it by key. This used to put it back from the
    // distance to the bottom, which is only right while every row's height is
    // known; with only the visible rows measured, a row measured between the
    // request and the landing moved the reader by its difference.
    if (olderRequestedRef.current) {
      olderRequestedRef.current = false;
      return;
    }

    if (atBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
    // Keyed on the id, not the user object: an unstable identity would re-run
    // this every render and pin the thread to the bottom.
  }, [containerRef, messageCount, peerUserId]);

  // A request that came back empty (or failed) leaves the flag set, which
  // would freeze the next attempt. Clear it once the load settles.
  useEffect(() => {
    if (!isLoadingOlderMessages) {
      olderRequestedRef.current = false;
    }
  }, [isLoadingOlderMessages]);

  // Stay on the newest message while the list grows under a reader who is
  // there. Only the rows on screen are drawn, and each is measured once drawn:
  // the jump to the bottom above is computed against estimated heights, and
  // the list settles to its real height a frame later. A picture arriving does
  // the same. Bound through a callback ref for the same reason as the lobby
  // chat's observer: the list node comes and goes with search and empty state.
  const listObserverRef = useRef<ResizeObserver | null>(null);
  const attachMessageList = useCallback(
    (node: HTMLDivElement | null): void => {
      listObserverRef.current?.disconnect();
      listObserverRef.current = null;
      if (!node) {
        return;
      }
      const observer = new ResizeObserver(() => {
        const container = containerRef.current;
        if (container && atBottomRef.current) {
          container.scrollTop = container.scrollHeight;
        }
      });
      observer.observe(node);
      listObserverRef.current = observer;
    },
    [containerRef],
  );

  return { handleChatScroll, attachMessageList };
}
