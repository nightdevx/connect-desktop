import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import type { ChatMessage } from "@shared/auth-contracts";

// A row's height before it has been measured: one line of text under the name.
// Only rows that are drawn get measured, so this is what the rest of the history
// counts as until the reader scrolls to it.
const ESTIMATED_ROW_PX = 64;
// .ct-chat-message-list's gap-1. Rows are absolutely positioned, so the flex gap
// no longer reaches them; the virtualizer leaves it between rows instead.
const ROW_GAP_PX = 4;
// Rows drawn past each edge of the viewport, so a quick flick lands on rows that
// already exist.
const OVERSCAN_ROWS = 8;

const estimateRowSize = (): number => ESTIMATED_ROW_PX;

export interface VirtualChatListProps {
  /** The thread's scroller. State, not a ref: the list needs a render once it exists. */
  scrollElement: HTMLElement | null;
  messages: ChatMessage[];
  renderMessage: (message: ChatMessage) => ReactNode;
}

/**
 * A message history that only draws the rows on screen.
 *
 * Every message used to be in the DOM. A long direct-message thread, scrolled
 * back far enough, held thousands of rows with an antd Tooltip and Button each:
 * measured with 5 000 messages, mounting took about ten seconds and the panel
 * held some 98 000 elements, and every new message laid all of them out again.
 *
 * The scroller stays with the panel, and so does landing on the newest message
 * and following new ones. That works unchanged because this keeps the list's
 * full height — measured rows at their size, the rest at the estimate — so
 * scrollHeight means what it always did. Rows are keyed by message id, so a
 * prepended page does not throw away the heights already measured. Keeping the
 * reader's place is done here, by key: when an older page lands, and when a row
 * above the viewport changes height (a picture arriving).
 *
 * measure-chat-history.cjs holds all of this against a 5 000-message history.
 */
export function VirtualChatList({ scrollElement, ...props }: VirtualChatListProps) {
  // Rows only once the scroller exists, and a fresh virtualizer for each
  // scroller. One that is handed its scroller later scrolls it back to the
  // offset it started with — the top — which undid the panel's jump to the
  // newest message.
  return scrollElement ? (
    <VirtualRows key={scrollerKey(scrollElement)} scrollElement={scrollElement} {...props} />
  ) : null;
}

const scrollerKeys = new WeakMap<HTMLElement, number>();
let lastScrollerKey = 0;
const scrollerKey = (element: HTMLElement): number => {
  let key = scrollerKeys.get(element);
  if (key === undefined) {
    lastScrollerKey += 1;
    key = lastScrollerKey;
    scrollerKeys.set(element, key);
  }
  return key;
};

function VirtualRows({
  scrollElement,
  messages,
  renderMessage,
}: VirtualChatListProps & { scrollElement: HTMLElement }) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Where the rows start inside the scroller: its padding, and whatever sits
  // above them in the list (the "load older" line).
  const [scrollMargin, setScrollMargin] = useState(0);
  // The row holding focus is drawn even when scrolled out of view. A message
  // being edited lives in its row's state, and unmounting the row would drop
  // the edit without a blur to commit it.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const getItemKey = useCallback((index: number) => messages[index].id, [messages]);

  const focusedIndex = focusedKey
    ? messages.findIndex((message) => message.id === focusedKey)
    : -1;
  const rangeExtractor = useCallback(
    (range: Range): number[] => {
      const indexes = defaultRangeExtractor(range);
      if (focusedIndex < 0 || indexes.includes(focusedIndex)) {
        return indexes;
      }
      return [...indexes, focusedIndex].sort((a, b) => a - b);
    },
    [focusedIndex],
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElement,
    // Wherever the panel has already put it, so attaching is not a scroll.
    initialOffset: () => scrollElement.scrollTop,
    estimateSize: estimateRowSize,
    getItemKey,
    rangeExtractor,
    overscan: OVERSCAN_ROWS,
    gap: ROW_GAP_PX,
    scrollMargin,
    // When rows are added or removed at either end, the row being read keeps
    // its place: an older page prepended, a message deleted above the
    // viewport. By key, so it holds even while the rows above are estimates.
    anchorTo: "end",
  });

  const marginMeasuredRef = useRef(false);
  // Every render, no dependency list: what moves the rows is the panel's markup
  // above them, which no prop here describes. It settles after one update,
  // because it only sets state when the offset actually changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const top = boxRef.current?.offsetTop ?? 0;
    if (top === scrollMargin) {
      return;
    }
    // Something above the rows changed height — the "load older" line goes
    // away with the last page. Move with it so the rows on screen stay put.
    // Not on the first measurement: nothing is being read yet.
    if (marginMeasuredRef.current) {
      scrollElement.scrollTop += top - scrollMargin;
    }
    marginMeasuredRef.current = true;
    setScrollMargin(top);
  });

  const keyOfRow = (target: EventTarget | null): string | null => {
    const row = target instanceof Element ? target.closest<HTMLElement>("[data-index]") : null;
    const index = row ? Number(row.dataset.index) : -1;
    return messages[index]?.id ?? null;
  };

  return (
    <div
      ref={boxRef}
      style={{ position: "relative", height: virtualizer.getTotalSize() }}
      onFocus={(event: FocusEvent) => setFocusedKey(keyOfRow(event.target))}
      onBlur={(event: FocusEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusedKey(null);
        }
      }}
    >
      {virtualizer.getVirtualItems().map((item) => (
        <div
          key={item.key}
          data-index={item.index}
          ref={virtualizer.measureElement}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${item.start - scrollMargin}px)`,
          }}
        >
          {renderMessage(messages[item.index])}
        </div>
      ))}
    </div>
  );
}
