import { PhoneOutlined } from "@ant-design/icons";
import type { CallSessionState } from "../../../hooks/user/use-call-session";
import { getDisplayInitials } from "../../../workspace-utils";
import { CallElapsed } from "./CallElapsed";

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
  const { status, peerUser, callerName, isMuted, connectedAt } = callState;

  // A muted caller still rings on the server; it just must not shout here.
  if (status === "idle" || (status === "incoming" && isMuted)) {
    return null;
  }

  // While the user is looking at the stage the dock would only repeat it —
  // the stage already shows the ringing tile and its toolbar carries the
  // hang-up. An incoming call is exempt: the callee has not joined, so there
  // is no stage, and this is the only place to answer from.
  if (status !== "incoming" && isStageVisible) {
    return null;
  }

  const displayName = peerUser?.displayName || callerName || "Bilinmeyen Kullanıcı";

  const statusLabel =
    status === "incoming"
      ? "Gelen sesli arama"
      : status === "outgoing"
        ? "Aranıyor…"
        : "Görüşme sürüyor";

  // The rings open out while the phone rings, in either direction; once the
  // call connects the face holds still.
  const avatar = (
    <span className={`ct-call-dock-avatar-wrap ${status === "active" ? "" : "ct-ring-ripple"}`}>
      {peerUser?.avatarUrl ? (
        <img className="ct-call-dock-avatar" src={peerUser.avatarUrl} alt="" />
      ) : (
        <span className="ct-call-dock-avatar fallback">
          {getDisplayInitials(displayName)}
        </span>
      )}
    </span>
  );

  if (status === "incoming") {
    return (
      <aside className="ct-call-dock incoming" role="region" aria-label={statusLabel}>
        <div className="ct-call-dock-head">
          {avatar}
          <div className="ct-call-dock-text">
            <strong className="ct-call-dock-name" title={displayName}>
              {displayName}
            </strong>
            <span className="ct-call-dock-status">{statusLabel}</span>
          </div>
        </div>

        {/* Spelled out and the width of the card: the one decision this card
            asks for, in the phone's own colours -- red hangs up, green
            answers, answer on the right. */}
        <div className="ct-call-dock-answer">
          <button type="button" className="ct-call-answer reject" onClick={onReject}>
            <PhoneOutlined rotate={225} />
            Reddet
          </button>
          <button type="button" className="ct-call-answer accept" onClick={onAccept}>
            <PhoneOutlined />
            Kabul et
          </button>
        </div>
      </aside>
    );
  }

  const hangUpLabel = status === "outgoing" ? "İptal et" : "Aramayı bitir";

  return (
    <aside className={`ct-call-dock ${status}`} role="region" aria-label={statusLabel}>
      {avatar}

      <div className="ct-call-dock-text">
        <strong className="ct-call-dock-name" title={displayName}>
          {displayName}
        </strong>
        <span className="ct-call-dock-status">
          {status === "outgoing" ? (
            <>
              Aranıyor
              <span className="ct-ring-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </>
          ) : (
            <>
              <span className="ct-online-dot" aria-hidden="true" />
              Görüşme sürüyor
              {connectedAt && <CallElapsed since={connectedAt} />}
            </>
          )}
        </span>
      </div>

      <div className="ct-call-dock-actions">
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
          title={hangUpLabel}
          aria-label={hangUpLabel}
        >
          <PhoneOutlined rotate={225} />
        </button>
      </div>
    </aside>
  );
}
