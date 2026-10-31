import type { CSSProperties, JSX, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast, type ToastItem, type ToastTone } from "@/services/toast";

const LineIcon = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const TONE_ICON: Record<ToastTone, JSX.Element> = {
  success: (
    <LineIcon>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.5 2.75 2.75L16.5 9.5" />
    </LineIcon>
  ),
  info: (
    <LineIcon>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 16.5v-5" />
      <path d="M12 7.75h.01" />
    </LineIcon>
  ),
  warning: (
    <LineIcon>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </LineIcon>
  ),
  error: (
    <LineIcon>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </LineIcon>
  ),
  progress: (
    <LineIcon>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </LineIcon>
  ),
};

// Long enough for the exit animation (odak-bildirim.css) to finish before the
// card leaves the DOM.
const EXIT_MS = 180;
// The deck: how far each card behind the front one shows below it, how much
// smaller it is, and how many edges show at all. Spread, cards sit GAP apart.
const PEEK_PX = 10;
const SHRINK = 0.05;
const PEEK_COUNT = 2;
const GAP_PX = 8;

interface ToastCardProps {
  item: ToastItem;
  index: number;
  count: number;
  y: number;
  expanded: boolean;
  frontHeight: number;
  bodyRef: (element: HTMLDivElement | null) => void;
}

function ToastCard({ item, index, count, y, expanded, frontHeight, bodyRef }: ToastCardProps) {
  // The version that is leaving: a replacement under the same key arrives
  // with a new rev and is not taken down with it.
  const [leavingRev, setLeavingRev] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const leaving = leavingRev === item.rev;

  const close = (): void => {
    if (leaving) {
      return;
    }
    const rev = item.rev;
    setLeavingRev(rev);
    window.setTimeout(() => toast.dismiss(item.id, rev), EXIT_MS);
  };

  const copyDetail = (): void => {
    if (!item.detail) {
      return;
    }
    void navigator.clipboard.writeText(item.detail).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  const isProgress = item.tone === "progress";
  // Behind the front card while the deck is closed: only its lower edge shows,
  // cut to the front card's height, and its words are hidden.
  const behind = !expanded && index > 0;
  const style = {
    "--toast-y": `${y}px`,
    "--toast-scale": expanded ? 1 : 1 - index * SHRINK,
    zIndex: count - index,
    height: behind && frontHeight ? `${frontHeight}px` : undefined,
  } as CSSProperties;

  return (
    <div
      className={`ct-toast ${item.tone}${leaving ? " leaving" : ""}`}
      role={item.tone === "error" ? "alert" : "status"}
      data-toast-id={item.id}
      data-behind={behind || undefined}
      data-hidden={(!expanded && index > PEEK_COUNT) || undefined}
      aria-hidden={behind || undefined}
      style={style}
    >
      <div ref={bodyRef} className="ct-toast-body">
        <span className="ct-toast-icon" aria-hidden="true">
          {TONE_ICON[item.tone]}
        </span>

        <div className="ct-toast-text">
          <strong>{item.title}</strong>
          {item.description && <span>{item.description}</span>}
          {isProgress && (
            <span
              className={`ct-toast-progress${item.value == null ? " indeterminate" : ""}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.value ?? undefined}
              aria-label={item.title}
            >
              <span
                className="ct-toast-progress-fill"
                style={item.value == null ? undefined : { transform: `scaleX(${Math.min(100, Math.max(0, item.value)) / 100})` }}
              />
            </span>
          )}
          {(item.action || item.detail) && (
            <div className="ct-toast-actions">
              {item.action && (
                <button
                  type="button"
                  className="ct-toast-action"
                  tabIndex={behind ? -1 : undefined}
                  onClick={() => {
                    item.action?.onClick();
                    close();
                  }}
                >
                  {item.action.label}
                </button>
              )}
              {item.detail && (
                <button
                  type="button"
                  className="ct-toast-detail"
                  tabIndex={behind ? -1 : undefined}
                  onClick={copyDetail}
                >
                  {copied ? "Kopyalandı" : "Ayrıntıyı kopyala"}
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="ct-toast-close"
          aria-label="Bildirimi kapat"
          tabIndex={behind ? -1 : undefined}
          onClick={close}
        >
          {/* The time left, as a ring around the X. The ring IS the timer: it
              stops while the deck is open (odak-bildirim.css) so a toast being
              read does not vanish under the pointer, and its animationend is
              what closes the card. Keyed by rev, so a replacement starts it
              over. A progress toast has none: it stays until done. */}
          {!isProgress && (
            <svg className="ct-toast-ring" viewBox="0 0 28 28" aria-hidden="true">
              <circle className="ct-toast-ring-track" cx="14" cy="14" r="12.5" />
              <circle
                key={item.rev}
                className="ct-toast-ring-time"
                cx="14"
                cy="14"
                r="12.5"
                pathLength={1}
                style={{ animationDuration: `${item.duration}ms` }}
                onAnimationEnd={close}
              />
            </svg>
          )}
          <LineIcon size={13}>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </LineIcon>
        </button>
      </div>
    </div>
  );
}

/**
 * The one place toasts are drawn. Mounted once, by App.
 *
 * A deck: the newest card in front, up to two edges of older ones showing
 * under it. Pointing at it, or tabbing into it, spreads the cards out and
 * stops their timers. Positions are transforms only, so cards glide when one
 * arrives or leaves.
 */
export function ToastHost(): JSX.Element {
  const items = useSyncExternalStore(toast.subscribe, toast.getSnapshot);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const [hovered, setHovered] = useState(false);
  // The card holding keyboard focus. By id, so a card that leaves while
  // focused takes the open state with it: removal fires no blur to undo it.
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const bodies = useRef(new Map<number, HTMLDivElement>());
  const focusWithin = focusedId !== null && items.some((item) => item.id === focusedId);
  const expanded = (hovered || focusWithin) && items.length > 0;

  const measure = useCallback((): void => {
    setHeights((previous) => {
      const next: Record<number, number> = {};
      let changed = Object.keys(previous).length !== bodies.current.size;
      for (const [id, body] of bodies.current) {
        next[id] = body.offsetHeight;
        if (previous[id] !== next[id]) {
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, []);

  // Before paint, so a new card is placed right on its first frame; again
  // whenever a card's text rewraps.
  useLayoutEffect(measure, [items, measure]);
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    for (const body of bodies.current.values()) {
      observer.observe(body);
    }
    return () => observer.disconnect();
  }, [items, measure]);

  // Spread out, each card starts where the ones in front of it end.
  const spreadTops = items.map((_, index) =>
    items.slice(0, index).reduce((sum, item) => sum + (heights[item.id] ?? 0) + GAP_PX, 0),
  );
  const placed = items.map((item, index) => ({
    item,
    index,
    y: expanded ? spreadTops[index] : index * PEEK_PX,
  }));
  const frontHeight = items[0] ? (heights[items[0].id] ?? 0) : 0;
  const lastItem = items[items.length - 1];
  const height = expanded
    ? (spreadTops[items.length - 1] ?? 0) + (lastItem ? (heights[lastItem.id] ?? 0) : 0)
    : frontHeight + Math.min(Math.max(items.length - 1, 0), PEEK_COUNT) * PEEK_PX;

  return (
    <div
      className="ct-toasts"
      aria-live="polite"
      data-expanded={expanded || undefined}
      style={{ height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(event) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>("[data-toast-id]");
        setFocusedId(card ? Number(card.dataset.toastId) : null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusedId(null);
        }
      }}
    >
      {placed.map(({ item, index, y }) => (
        <ToastCard
          key={item.id}
          item={item}
          index={index}
          count={items.length}
          y={y}
          expanded={expanded}
          frontHeight={frontHeight}
          bodyRef={(element) => {
            if (element) {
              bodies.current.set(item.id, element);
            } else {
              bodies.current.delete(item.id);
            }
          }}
        />
      ))}
    </div>
  );
}
