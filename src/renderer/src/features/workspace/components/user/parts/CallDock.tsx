import { Tooltip } from "antd";
import { BellOutlined, PhoneOutlined } from "@ant-design/icons";
import type { CallSessionState } from "../../../hooks/user/use-call-session";
import { hueStyle } from "../../../workspace-utils";
import { BlankFace } from "@/ui/blank-face";
import { ElapsedTime } from "../../common/elapsed-time";
import { CallEncryptionBadge } from "./CallEncryptionBadge";

interface CallDockProps {
  callState: CallSessionState;
  /**
   * True when the peer's conversation is on screen: it holds the call stage,
   * and while the phone rings, its own banner with the same two answers.
   */
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
        <span
          className="ct-call-dock-avatar fallback"
          style={hueStyle(peerUser?.userId ?? callState.callerId ?? displayName)}
        >
          <BlankFace />
        </span>
      )}
    </span>
  );

  if (variant === "floating") {
    // A muted caller still rings on the server; it just must not shout here.
    // With the caller's conversation open its banner asks the same question
    // where the user is already looking, and in a small window this card sat
    // on top of that banner and the conversation's header.
    if (status !== "incoming" || isMuted || isStageVisible) {
      return null;
    }

    // Enter answers and Esc declines only while the card has focus (a click
    // on it, or Tab): typing in a conversation must never pick up a call.
    return (
      <aside
        className="ct-call-dock incoming"
        role="region"
        aria-label="Gelen sesli arama"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onReject();
          } else if (event.key === "Enter" && event.target === event.currentTarget) {
            event.preventDefault();
            onAccept();
          }
        }}
      >
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
          <button
            type="button"
            className="ct-call-answer reject"
            onClick={onReject}
            aria-keyshortcuts="Escape"
          >
            <PhoneOutlined rotate={225} />
            Reddet
            <kbd className="ct-kbd" aria-hidden="true">Esc</kbd>
          </button>
          <button
            type="button"
            className="ct-call-answer accept"
            onClick={onAccept}
            aria-keyshortcuts="Enter"
          >
            <PhoneOutlined />
            Kabul et
            <kbd className="ct-kbd" aria-hidden="true">Enter</kbd>
          </button>
        </div>

        {onMuteCaller && (
          <button type="button" className="ct-call-dock-mute" onClick={onMuteCaller}>
            <BellOutlined aria-hidden="true" />
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
                <CallEncryptionBadge />
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
