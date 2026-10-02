import { memo, useState } from "react";
import { Button, Input, Tooltip } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  EnterOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import type { ChatMessage } from "@shared/auth-contracts";
import { formatTimeLabel } from "../../workspace-utils";
import {
  callLogKind,
  formatCallDuration,
  type CallLogInfo,
  type CallLogKind,
} from "../../hooks/user/call-log";
import { renderMessageBody } from "../../mentions";
import {
  ChatAttachmentView,
  ChatMessageBody,
  ChatReactionBar,
  ChatReactionButton,
  ChatReplyQuote,
} from "../common/chat-message-parts";

export interface DirectChatMessageRowProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  isDeleting: boolean;
  deleteDisabled: boolean;
  peerLabel: string;
  currentUsername: string;
  currentUserId: string;
  onRequestDelete: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, body: string) => void;
  onToggleReaction: (messageId: string, emoji: string, add: boolean) => void;
  /** For a call entry: folded into the next one, or how long it ran. */
  callLog?: CallLogInfo;
  /** "Geri ara" on a missed or declined call; absent while it cannot ring. */
  onCallBack?: () => void;
}

// Every prop except the four callbacks. `message` is compared by reference
// because it comes straight out of the react-query cache, which replaces the
// object rather than mutating it — an edit or a new reaction is therefore a new
// identity and does re-render the row.
const areRowPropsEqual = (
  previous: DirectChatMessageRowProps,
  next: DirectChatMessageRowProps,
): boolean =>
  previous.message === next.message &&
  previous.isOwnMessage === next.isOwnMessage &&
  previous.isDeleting === next.isDeleting &&
  previous.deleteDisabled === next.deleteDisabled &&
  previous.peerLabel === next.peerLabel &&
  previous.currentUsername === next.currentUsername &&
  previous.currentUserId === next.currentUserId &&
  previous.callLog?.hidden === next.callLog?.hidden &&
  previous.callLog?.durationSeconds === next.callLog?.durationSeconds &&
  Boolean(previous.onCallBack) === Boolean(next.onCallBack);

/**
 * One rendered direct message.
 *
 * Memoized on primitives, and that is the entire reason it is a component
 * rather than a branch inside the panel's render: the composer draft, the call
 * state and the typing indicator all live in the panel, so without this every
 * keystroke re-rendered the whole conversation backlog.
 *
 * The comparator is explicit because three of the four callbacks are built as
 * inline arrows at the call site, so under the default shallow compare they are
 * new on every render and this memo never hit once — the cost above was still
 * being paid in full. Ignoring them is safe: they close over nothing but
 * `message`, which IS compared, and only forward to the panel's own handlers.
 */
// What a call entry says, from this side of it. The sender of a "missed" is
// the caller and of a "declined" the callee, so "own" decides the direction.
const describeCall = (
  kind: CallLogKind,
  isOwn: boolean,
  peer: string,
  durationSeconds: number | undefined,
): { label: string; detail: string; missed: boolean } => {
  switch (kind) {
    case "started":
      return {
        label: "Sesli arama başladı",
        detail: isOwn ? "Giden arama" : "Gelen arama",
        missed: false,
      };
    case "ended":
      return {
        label: "Sesli arama",
        detail:
          durationSeconds !== undefined
            ? formatCallDuration(durationSeconds)
            : "Arama sona erdi",
        missed: false,
      };
    case "missed":
      return isOwn
        ? { label: `${peer || "Karşı taraf"} yanıt vermedi`, detail: "Giden arama", missed: true }
        : { label: "Cevapsız arama", detail: "Gelen arama", missed: true };
    case "declined":
      return isOwn
        ? { label: "Aramayı reddettin", detail: "Gelen arama", missed: true }
        : { label: `${peer || "Karşı taraf"} aramayı reddetti`, detail: "Giden arama", missed: true };
  }
};

function CallLogEntry({
  kind,
  isOwn,
  peerLabel,
  durationSeconds,
  time,
  onCallBack,
}: {
  kind: CallLogKind;
  isOwn: boolean;
  peerLabel: string;
  durationSeconds?: number;
  time: string;
  onCallBack?: () => void;
}) {
  const { label, detail, missed } = describeCall(kind, isOwn, peerLabel, durationSeconds);

  return (
    <div className="ct-chat-row-system">
      <div className={`ct-call-log ${missed ? "missed" : ""}`}>
        <span className="ct-call-log-icon" aria-hidden="true">
          <PhoneOutlined rotate={missed ? 225 : 0} />
        </span>
        <span className="ct-call-log-text">
          <strong>{label}</strong>
          <span>
            {detail} · {time}
          </span>
        </span>
        {missed && onCallBack && (
          <Button size="small" icon={<PhoneOutlined />} onClick={onCallBack}>
            Geri ara
          </Button>
        )}
      </div>
    </div>
  );
}

export const DirectChatMessageRow = memo(function DirectChatMessageRow({
  message,
  isOwnMessage,
  isDeleting,
  deleteDisabled,
  peerLabel,
  currentUsername,
  currentUserId,
  onRequestDelete,
  onReply,
  onEdit,
  onToggleReaction,
  callLog,
  onCallBack,
}: DirectChatMessageRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.body);
  const callKind = callLogKind(message.body);

  if (callKind) {
    if (callLog?.hidden) {
      return null;
    }
    return (
      <CallLogEntry
        kind={callKind}
        isOwn={isOwnMessage}
        peerLabel={peerLabel}
        durationSeconds={callLog?.durationSeconds}
        time={formatTimeLabel(message.createdAt)}
        onCallBack={onCallBack}
      />
    );
  }

  const commitEdit = (): void => {
    const trimmed = editDraft.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== message.body) {
      onEdit(message.id, trimmed);
    }
  };

  return (
    <div className={`ct-chat-row ${isOwnMessage ? "own" : ""}`}>
      <div className={`ct-chat-bubble ${isOwnMessage ? "own" : ""}`}>
        {message.replyTo && <ChatReplyQuote replyTo={message.replyTo} />}

        {isEditing ? (
          <Input.TextArea
            autoFocus
            value={editDraft}
            autoSize={{ minRows: 1, maxRows: 6 }}
            onChange={(event) => setEditDraft(event.target.value)}
            onBlur={commitEdit}
            onPressEnter={(event) => {
              if (event.shiftKey) {
                return;
              }
              event.preventDefault();
              commitEdit();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEditDraft(message.body);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          message.body && (
            <ChatMessageBody body={message.body}>
              {renderMessageBody(message.body, currentUsername)}
            </ChatMessageBody>
          )
        )}

        {message.attachment && (
          <ChatAttachmentView attachment={message.attachment} />
        )}

        <ChatReactionBar
          reactions={message.reactions ?? []}
          currentUserId={currentUserId}
          onToggle={(emoji, add) => onToggleReaction(message.id, emoji, add)}
        />

        <div className="ct-chat-bubble-meta">
          <span>
            {isOwnMessage ? "Sen" : peerLabel} •{" "}
            {formatTimeLabel(message.createdAt)}
            {message.editedAt ? " • düzenlendi" : ""}
          </span>

          <span className="ct-chat-message-actions">
            <ChatReactionButton
              onPick={(emoji) => {
                const existing = (message.reactions ?? []).find(
                  (reaction) => reaction.emoji === emoji,
                );
                // Picking an emoji you already used removes it, so the picker
                // doubles as a toggle rather than being a one-way action.
                const mine = existing?.userIds.includes(currentUserId) ?? false;
                onToggleReaction(message.id, emoji, !mine);
              }}
            />

            <Tooltip title="Yanıtla">
              <button
                type="button"
                className="ct-chat-action"
                onClick={() => onReply(message)}
                aria-label="Yanıtla"
              >
                <EnterOutlined />
              </button>
            </Tooltip>

            {isOwnMessage && message.body && (
              <Tooltip title="Düzenle">
                <button
                  type="button"
                  className="ct-chat-action"
                  onClick={() => {
                    setEditDraft(message.body);
                    setIsEditing(true);
                  }}
                  aria-label="Mesajı düzenle"
                >
                  <EditOutlined />
                </button>
              </Tooltip>
            )}

            {isOwnMessage && (
              <Tooltip title={isDeleting ? "Siliniyor" : "Sil"}>
                <button
                  type="button"
                  className="ct-chat-action danger"
                  onClick={() => onRequestDelete(message.id)}
                  disabled={deleteDisabled}
                  aria-label="Mesajı sil"
                >
                  {isDeleting ? (
                    <div className="ct-spinner-small" />
                  ) : (
                    <DeleteOutlined />
                  )}
                </button>
              </Tooltip>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}, areRowPropsEqual);
