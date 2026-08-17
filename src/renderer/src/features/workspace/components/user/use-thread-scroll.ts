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
}: ThreadScrollOptions): { handleChatScroll: () => void } {
  const atBottomRef = useRef(true);
  // Distance from the bottom, captured before a prepend so the same message can
  // be put back under the cursor once the page lands.
  const prependAnchorRef = useRef<number | null>(null);
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
      prependAnchorRef.current === null &&
      messageCount > 0
    ) {
      prependAnchorRef.current = container.scrollHeight - container.scrollTop;
      onLoadOlderMessages?.();
    }
  }, [
    containerRef,
    hasMoreMessages,
    isLoadingOlderMessages,
    onLoadOlderMessages,
    messageCount,
  ]);

  // Layout effect, not effect: the correction has to land in the same frame as
  // the prepend, or the thread visibly jumps before snapping back.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!peerUserId || !container) {
      return;
    }

    if (lastPeerIdRef.current !== peerUserId) {
      lastPeerIdRef.current = peerUserId;
      prependAnchorRef.current = null;
      atBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
      return;
    }

    const anchor = prependAnchorRef.current;
    if (anchor !== null) {
      prependAnchorRef.current = null;
      container.scrollTop = container.scrollHeight - anchor;
      return;
    }

    if (atBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
    // Keyed on the id, not the user object: an unstable identity would re-run
    // this every render and pin the thread to the bottom.
  }, [containerRef, messageCount, peerUserId]);

  // A request that came back empty (or failed) leaves the anchor set, which
  // would freeze the next attempt. Clear it once the load settles.
  useEffect(() => {
    if (!isLoadingOlderMessages) {
      prependAnchorRef.current = null;
    }
  }, [isLoadingOlderMessages]);

  return { handleChatScroll };
}
