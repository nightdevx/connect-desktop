import { useState, useSyncExternalStore } from "react";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloseOutlined,
  ExclamationCircleFilled,
  InfoCircleFilled,
} from "@ant-design/icons";
import { toast, type ToastItem, type ToastTone } from "@/services/toast";

const TONE_ICON: Record<ToastTone, JSX.Element> = {
  success: <CheckCircleFilled />,
  info: <InfoCircleFilled />,
  warning: <ExclamationCircleFilled />,
  error: <CloseCircleFilled />,
};

// Long enough for the exit animation in overlays.css to finish before the
// card leaves the DOM.
const EXIT_MS = 180;

function ToastCard({ item }: { item: ToastItem }) {
  const [leaving, setLeaving] = useState(false);

  const close = (): void => {
    if (leaving) {
      return;
    }
    setLeaving(true);
    window.setTimeout(() => toast.dismiss(item.id), EXIT_MS);
  };

  return (
    <div
      className={`ct-toast ${item.tone}${leaving ? " leaving" : ""}`}
      role={item.tone === "error" ? "alert" : "status"}
    >
      <span className="ct-toast-icon" aria-hidden="true">
        {TONE_ICON[item.tone]}
      </span>

      <div className="ct-toast-text">
        <strong>{item.title}</strong>
        {item.description && <span>{item.description}</span>}
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
        <CloseOutlined />
      </button>

      {/* The countdown IS the timer: it pauses on hover (overlays.css) so a
          toast someone is reading does not vanish under the pointer, and its
          animationend is what closes the card. */}
      <span
        className="ct-toast-timer"
        style={{ animationDuration: `${item.duration}ms` }}
        onAnimationEnd={close}
      />
    </div>
  );
}

/** The one place toasts are drawn. Mounted once, by App. */
export function ToastHost(): JSX.Element {
  const items = useSyncExternalStore(toast.subscribe, toast.getSnapshot);

  return (
    <div className="ct-toasts" aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
