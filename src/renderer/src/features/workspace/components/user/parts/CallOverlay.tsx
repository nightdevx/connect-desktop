import { PhoneOutlined, CloseOutlined } from "@ant-design/icons";
import type { CallSessionState } from "../../../hooks/user/use-call-session";
import { getDisplayInitials } from "../../../workspace-utils";

interface CallOverlayProps {
  callState: CallSessionState;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
}

export function CallOverlay({
  callState,
  onAccept,
  onReject,
  onCancel,
}: CallOverlayProps) {
  const { status, peerUser, callerName, isMuted } = callState;

  if (status === "idle" || status === "active" || (status === "incoming" && isMuted)) {
    return null;
  }

  const displayName = peerUser?.displayName || callerName || "Bilinmeyen Kullanıcı";
  const initials = getDisplayInitials(displayName);
  const isIncoming = status === "incoming";

  return (
    <div
      className="ct-call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isIncoming ? "Gelen arama" : "Giden arama"}
    >
      <div className={`ct-call-card ${isIncoming ? "incoming" : "outgoing"}`}>
        {/* Expanding rings behind the avatar; decorative only. */}
        <div className="ct-call-waves" aria-hidden="true">
          <span className="ct-call-wave" />
          <span className="ct-call-wave" />
          <span className="ct-call-wave" />
        </div>

        <div className="ct-call-avatar-wrap">
          {peerUser?.avatarUrl ? (
            <img
              className="ct-call-avatar"
              src={peerUser.avatarUrl}
              alt={displayName}
            />
          ) : (
            <div className="ct-call-avatar fallback">{initials}</div>
          )}
        </div>

        <h2 className="ct-call-name">{displayName}</h2>
        <p className="ct-call-status">
          {isIncoming ? "Gelen Sesli Arama..." : "Aranıyor..."}
        </p>

        <div className="ct-call-actions">
          {isIncoming ? (
            <>
              <button
                type="button"
                className="ct-call-btn accept"
                onClick={onAccept}
                title="Kabul Et"
                aria-label="Kabul Et"
              >
                <PhoneOutlined />
              </button>

              <button
                type="button"
                className="ct-call-btn reject"
                onClick={onReject}
                title="Reddet"
                aria-label="Reddet"
              >
                <CloseOutlined />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ct-call-btn reject"
              onClick={onCancel}
              title="İptal Et"
              aria-label="İptal Et"
            >
              <CloseOutlined />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
