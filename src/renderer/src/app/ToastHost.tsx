import type { JSX, ReactNode } from "react";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast, type ToastItem, type ToastTone } from "@/services/toast";

const LineIcon = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </LineIcon>
  ),
  info: (
    <LineIcon>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
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
      <circle cx="12" cy="12" r="10" />
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

// Long enough for the exit animation in overlays.css to finish before the
// card leaves the DOM.
const EXIT_MS = 180;
// The stack's reflow (odak-hareket.css: --odak-dur-3, --odak-ease-out).
const REFLOW_MS = 260;
const REFLOW_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function ToastCard({ item }: { item: ToastItem }) {
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

  return (
    <div
      className={`ct-toast ${item.tone}${leaving ? " leaving" : ""}`}
      role={item.tone === "error" ? "alert" : "status"}
      data-toast-id={item.id}
    >
      <span className="ct-toast-icon" aria-hidden="true">
        {TONE_ICON[item.tone]}
      </span>

      <div className="ct-toast-text">
        <strong>{item.title}</strong>
        {item.description && <span>{item.description}</span>}
        {item.detail && (
          <button type="button" className="ct-toast-detail" onClick={copyDetail}>
            {copied ? "Kopyalandı" : "Ayrıntıyı kopyala"}
          </button>
        )}
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
      </div>

      {item.action && (
        <button
          type="button"
          className="ct-toast-action"
          onClick={() => {
            item.action?.onClick();
            close();
          }}
        >
          {item.action.label}
        </button>
      )}

      <button
        type="button"
        className="ct-toast-close"
        aria-label="Bildirimi kapat"
        onClick={close}
      >
        <LineIcon size={14}>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </LineIcon>
      </button>

      {/* The countdown IS the timer: it pauses on hover (overlays.css) so a
          toast someone is reading does not vanish under the pointer, and its
          animationend is what closes the card. Keyed by rev, so a replacement
          starts it over. A progress toast has none: it stays until done. */}
      {!isProgress && (
        <span
          key={item.rev}
          className="ct-toast-timer"
          style={{ animationDuration: `${item.duration}ms` }}
          onAnimationEnd={close}
        />
      )}
    </div>
  );
}

/** The one place toasts are drawn. Mounted once, by App. */
export function ToastHost(): JSX.Element {
  const items = useSyncExternalStore(toast.subscribe, toast.getSnapshot);
  const listRef = useRef<HTMLDivElement>(null);
  const tops = useRef(new Map<string, number>());

  // FLIP: when a toast arrives or leaves, the others glide to their new place
  // (transform only) instead of jumping there.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    for (const card of list.querySelectorAll<HTMLElement>(":scope > [data-toast-id]")) {
      const id = card.dataset.toastId ?? "";
      const top = card.offsetTop;
      next.set(id, top);
      const before = tops.current.get(id);
      if (!still && before !== undefined && before !== top) {
        card.animate([{ translate: `0 ${before - top}px` }, { translate: "0 0" }], {
          duration: REFLOW_MS,
          easing: REFLOW_EASE,
        });
      }
    }
    tops.current = next;
  }, [items]);

  return (
    <div ref={listRef} className="ct-toasts" aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
