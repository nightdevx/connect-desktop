import { PhoneOutlined, CloseOutlined, AudioOutlined } from "@ant-design/icons";
import type { CallSessionState } from "../../../hooks/user/use-call-session";
import { getDisplayInitials } from "../../../workspace-utils";

interface CallDockProps {
  callState: CallSessionState;
  /** True when the call stage is already on screen, so the dock stays out of the way. */
  isStageVisible: boolean;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onEnd: () => void;
  /** Brings the peer's conversation — and with it the call stage — back up. */
  onOpenConversation: () => void;
}

// A call used to be a full-screen modal: fixed inset-0, z-index 999999,
// aria-modal, over the entire app. Ringing someone locked you out of your own
// workspace until they picked up. This is the same information as a dock in the
// corner, so the rest of the app stays usable and reachable during a call.
export function CallDock({
  callState,
  isStageVisible,
  onAccept,
  onReject,
  onCancel,
  onEnd,
  onOpenConversation,
}: CallDockProps) {
  const { status, peerUser, callerName, isMuted } = callState;

  // A muted caller still rings on the server; it just must not shout here.
  if (status === "idle" || (status === "incoming" && isMuted)) {
    return null;
  }

  // While the user is looking at the stage the dock would only repeat it —
  // the stage already shows the dimmed "ringing" tile and its toolbar carries
  // the hang-up. An incoming call is exempt: the callee has not joined, so
  // there is no stage, and this is the only place to answer from.
  if (status !== "incoming" && isStageVisible) {
    return null;
  }

  const displayName = peerUser?.displayName || callerName || "Bilinmeyen Kullanıcı";
  const initials = getDisplayInitials(displayName);

  const statusLabel =
    status === "incoming"
      ? "Gelen sesli arama"
      : status === "outgoing"
        ? "Aranıyor…"
        : "Görüşme sürüyor";

  return (
    <aside
      className={`ct-call-dock ${status}`}
      role="region"
      aria-label={statusLabel}
    >
      <div className="ct-call-dock-avatar-wrap">
        {peerUser?.avatarUrl ? (
          <img
            className="ct-call-dock-avatar"
            src={peerUser.avatarUrl}
            alt=""
          />
        ) : (
          <div className="ct-call-dock-avatar fallback">{initials}</div>
        )}
      </div>

      <div className="ct-call-dock-text">
        <strong className="ct-call-dock-name" title={displayName}>
          {displayName}
        </strong>
        <span className="ct-call-dock-status">
          {status === "active" && <AudioOutlined />}
          {statusLabel}
        </span>
      </div>

      <div className="ct-call-dock-actions">
        {status === "incoming" ? (
          <>
            <button
              type="button"
              className="ct-call-dock-btn accept"
              onClick={onAccept}
              title="Kabul et"
              aria-label="Kabul et"
            >
              <PhoneOutlined />
            </button>
            <button
              type="button"
              className="ct-call-dock-btn reject"
              onClick={onReject}
              title="Reddet"
              aria-label="Reddet"
            >
              <CloseOutlined />
            </button>
          </>
        ) : (
          <>
            {status === "active" && (
              <button
                type="button"
                className="ct-call-dock-btn open"
                onClick={onOpenConversation}
                title="Aramaya dön"
                aria-label="Aramaya dön"
              >
                <PhoneOutlined />
              </button>
            )}
            <button
              type="button"
              className="ct-call-dock-btn reject"
              onClick={status === "outgoing" ? onCancel : onEnd}
              title={status === "outgoing" ? "İptal et" : "Aramayı bitir"}
              aria-label={status === "outgoing" ? "İptal et" : "Aramayı bitir"}
            >
              <CloseOutlined />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
