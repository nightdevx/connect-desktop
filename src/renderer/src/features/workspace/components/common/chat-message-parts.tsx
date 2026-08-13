import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Tooltip, message as antdMessage } from "antd";
import {
  DownloadOutlined,
  FileOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import type { ChatAttachment, ChatReplyPreview, ChatReaction } from "@shared/auth-contracts";
import type { ChatAttachmentUpload } from "@shared/desktop-api-types";
import chatService from "../../services/chat-service";

// Shared message furniture for both conversation surfaces (direct messages and
// lobby chat). They render the same message shape, so the reply quote,
// attachment and reaction bar live here rather than being written twice.

// The picker offers a small fixed set instead of a full emoji keyboard: a
// picker is a component with its own search, virtualised grid and skin-tone
// state, and nobody has asked for one.
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢"] as const;

// Matches the backend's maxAttachmentBytes. Checked here too so a 40 MB video
// fails instantly instead of after a 60-second upload.
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const formatAttachmentSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// readFileAsUpload turns a picked File into the inline base64 payload the send
// endpoint takes. The result of readAsDataURL is "data:<mime>;base64,<data>";
// the backend tolerates the prefix, so it is passed through untouched.
export const readFileAsUpload = (file: File): Promise<ChatAttachmentUpload> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.onload = () => {
      resolve({
        name: file.name,
        mimeType: file.type,
        dataBase64: String(reader.result ?? ""),
      });
    };
    reader.readAsDataURL(file);
  });
};

interface ChatReplyQuoteProps {
  replyTo: ChatReplyPreview;
}

export function ChatReplyQuote({ replyTo }: ChatReplyQuoteProps): JSX.Element {
  return (
    <div
      className="ct-chat-reply-quote"
      style={{
        borderLeft: "2px solid rgba(147, 197, 253, 0.6)",
        paddingLeft: 8,
        marginBottom: 6,
        opacity: 0.75,
        fontSize: 12,
        lineHeight: 1.35,
      }}
    >
      {replyTo.deleted ? (
        <em style={{ opacity: 0.7 }}>Silinmiş mesaj</em>
      ) : (
        <>
          <strong style={{ display: "block", fontSize: 11 }}>
            {replyTo.username}
          </strong>
          <span>{replyTo.body}</span>
        </>
      )}
    </div>
  );
}

interface ChatAttachmentViewProps {
  attachment: ChatAttachment;
}

// Images load their bytes lazily through IPC and render from a data URL: the
// renderer holds no bearer token, so it cannot fetch the endpoint itself.
export function ChatAttachmentView({
  attachment,
}: ChatAttachmentViewProps): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  // Guards a setState after the row unmounts mid-fetch, which a fast scroll
  // through a long history does constantly.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!attachment.isImage) {
      return;
    }

    let cancelled = false;
    void chatService
      .getChatAttachment({ attachmentId: attachment.id })
      .then((result) => {
        if (cancelled || !mountedRef.current) {
          return;
        }
        if (result.ok && result.data) {
          setDataUrl(result.data.dataUrl);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.isImage]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const result = await chatService.saveChatAttachment({
        attachmentId: attachment.id,
        fileName: attachment.name,
      });
      if (!result.ok) {
        antdMessage.error(result.error?.message ?? "Dosya kaydedilemedi");
      } else if (result.data?.saved) {
        antdMessage.success("Dosya kaydedildi");
      }
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }, [attachment.id, attachment.name]);

  return (
    <div className="ct-chat-attachment" style={{ marginTop: 6 }}>
      {attachment.isImage && !failed ? (
        <div style={{ position: "relative" }}>
          {dataUrl ? (
            <img
              src={dataUrl}
              alt={attachment.name}
              style={{
                maxWidth: "100%",
                maxHeight: 280,
                borderRadius: 8,
                display: "block",
                cursor: "pointer",
              }}
              onClick={() => void handleSave()}
              title="Kaydetmek için tıklayın"
            />
          ) : (
            <div
              style={{
                width: 180,
                height: 110,
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                opacity: 0.6,
              }}
            >
              Görsel yükleniyor…
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <FileOutlined />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={attachment.name}
            >
              {attachment.name}
            </div>
            <div style={{ fontSize: 10, opacity: 0.55 }}>
              {formatAttachmentSize(attachment.size)}
            </div>
          </div>
          <Button
            size="small"
            type="text"
            icon={<DownloadOutlined />}
            loading={saving}
            onClick={() => void handleSave()}
            aria-label="Dosyayı kaydet"
          />
        </div>
      )}
    </div>
  );
}

interface ChatReactionBarProps {
  reactions: ChatReaction[];
  currentUserId: string;
  onToggle: (emoji: string, add: boolean) => void;
  disabled?: boolean;
}

export function ChatReactionBar({
  reactions,
  currentUserId,
  onToggle,
  disabled,
}: ChatReactionBarProps): JSX.Element | null {
  if (reactions.length === 0) {
    return null;
  }

  return (
    <div
      className="ct-chat-reactions"
      style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}
    >
      {reactions.map((reaction) => {
        // "mine" is derived here rather than sent by the server: the same
        // payload is broadcast to every client.
        const mine = reaction.userIds.includes(currentUserId);
        return (
          <button
            key={reaction.emoji}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(reaction.emoji, !mine)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              lineHeight: 1,
              padding: "3px 7px",
              borderRadius: 10,
              cursor: disabled ? "default" : "pointer",
              border: mine
                ? "1px solid rgba(147, 197, 253, 0.8)"
                : "1px solid rgba(255,255,255,0.1)",
              background: mine
                ? "rgba(147, 197, 253, 0.18)"
                : "rgba(255,255,255,0.05)",
              color: "inherit",
            }}
          >
            <span>{reaction.emoji}</span>
            <span>{reaction.count}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ChatQuickReactionPickerProps {
  onPick: (emoji: string) => void;
}

export function ChatQuickReactionPicker({
  onPick,
}: ChatQuickReactionPickerProps): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
            padding: 2,
          }}
          aria-label={`${emoji} tepkisi ekle`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

interface ChatAttachButtonProps {
  onSelect: (upload: ChatAttachmentUpload, file: File) => void;
  disabled?: boolean;
}

// A hidden <input type="file"> driven by a button. Electron's own dialog would
// mean another IPC round trip and a second permission surface for no gain.
export function ChatAttachButton({
  onSelect,
  disabled,
}: ChatAttachButtonProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset immediately so picking the SAME file twice in a row still fires
      // a change event.
      event.target.value = "";
      if (!file) {
        return;
      }

      if (file.size > MAX_ATTACHMENT_BYTES) {
        antdMessage.error("Dosya en fazla 5 MB olabilir");
        return;
      }

      try {
        onSelect(await readFileAsUpload(file), file);
      } catch {
        antdMessage.error("Dosya okunamadı");
      }
    },
    [onSelect],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        onChange={(event) => void handleChange(event)}
      />
      <Tooltip title="Dosya ekle (en fazla 5 MB)">
        <Button
          type="text"
          disabled={disabled}
          icon={<PaperClipOutlined />}
          onClick={() => inputRef.current?.click()}
          aria-label="Dosya ekle"
        />
      </Tooltip>
    </>
  );
}
