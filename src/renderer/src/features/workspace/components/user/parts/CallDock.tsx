import { Tooltip } from "antd";
import { PhoneOutlined } from "@ant-design/icons";
import type { CallSessionState } from "../../../hooks/user/use-call-session";
import { getDisplayInitials } from "../../../workspace-utils";
import { ElapsedTime } from "../../common/elapsed-time";

interface CallDockProps {
  callState: CallSessionState;
  /** True when the call stage is already on screen, so the strip stays out of the way. */
  isStageVisible: boolean;
  /**
   * Where this copy lives. "floating" is the ringing card in the top-right
   * corner -- an incoming call only, since it is the one thing to answer from
   * anywhere. "strip" is the row in the quick dock under the sidebar, for a call
   * that is ringing out or running while the user is elsewhere in the app.
   */
  variant?: "floating" | "strip";
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onEnd: () => void;
  /** Stops this caller's calls ringing, now and later. */
  onMuteCaller?: () => void;
  /** Brings the peer's conversation — and with it the call stage — back up. */
  onOpenConversation: () => void;
}

// A call used to be a full-screen modal: fixed inset-0, z-index 999999,
// aria-modal, over the entire app. Ringing someone locked you out of your own
// workspace until they picked up. It is a card and a strip now, so the rest of
// the app stays usable and reachable during a call.
export function CallDock({
  callState,
  isStageVisible,
  variant = "floating",
  onAccept,
  onReject,
  onCancel,
  onEnd,
  onMuteCaller,
  onOpenConversation,
}: CallDockProps) {
  const { status, peerUser, callerName, isMuted, connectedAt } = callState;

  if (status === "idle") {
    return null;
  }

  const displayName = peerUser?.displayName || callerName || "Bilinmeyen Kullanıcı";

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

  if (variant === "floating") {
    // A muted caller still rings on the server; it just must not shout here.
    if (status !== "incoming" || isMuted) {
      return null;
    }

    return (
      <aside className="ct-call-dock incoming" role="region" aria-label="Gelen sesli arama">
        <div className="ct-call-dock-head">
          {avatar}
          <div className="ct-call-dock-text">
            <strong className="ct-call-dock-name" title={displayName}>
              {displayName}
            </strong>
            <span className="ct-call-dock-status">Gelen sesli arama</span>
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

        {onMuteCaller && (
          <button type="button" className="ct-call-dock-mute" onClick={onMuteCaller}>
            Bu kişinin aramalarını sessize al
          </button>
        )}
      </aside>
    );
  }

  // The strip. While the user is looking at the stage it would only repeat it:
  // the stage shows the ringing tile and its toolbar carries the hang-up.
  if (status === "incoming" || isStageVisible) {
    return null;
  }

  const hangUpLabel = status === "outgoing" ? "İptal et" : "Aramayı bitir";

  return (
    <div
      className={`ct-call-strip ${status}`}
      role="region"
      aria-label={status === "outgoing" ? "Aranıyor" : "Süren arama"}
    >
      {/* The whole left side goes back to the call. */}
      <button
        type="button"
        className="ct-call-strip-main"
        onClick={onOpenConversation}
        aria-label={`${displayName} ile aramaya dön`}
      >
        {avatar}
        <span className="ct-call-strip-text">
          <strong title={displayName}>{displayName}</strong>
          <span>
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
                Görüşme sürüyor
                {connectedAt && <ElapsedTime since={connectedAt} />}
              </>
            )}
          </span>
        </span>
      </button>

      <Tooltip title={hangUpLabel}>
        <button
          type="button"
          className="ct-call-dock-btn reject"
          onClick={status === "outgoing" ? onCancel : onEnd}
          aria-label={hangUpLabel}
        >
          <PhoneOutlined rotate={225} />
        </button>
      </Tooltip>
    </div>
  );
}
