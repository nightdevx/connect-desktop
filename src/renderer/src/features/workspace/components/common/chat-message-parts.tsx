import type { JSX } from "react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Button,
  Image,
  Popover,
  Tooltip,
} from "antd";
import {
  DownloadOutlined,
  EllipsisOutlined,
  EnterOutlined,
  ExpandOutlined,
  FileOutlined,
  PaperClipOutlined,
  SmileOutlined,
} from "@ant-design/icons";
import type {
  ChatAttachment,
  ChatMessage,
  ChatReplyPreview,
  ChatReaction,
} from "@shared/auth-contracts";
import { discardSend, retrySend } from "../../hooks/chat/pending-sends";
import type { ChatAttachmentUpload } from "@shared/desktop-api-types";
import { isAutoLoadableImageUrl } from "@shared/gif-hosts";
import { useUiStore } from "@/store/ui-store";
import { MenuIcon, OdakMenu, type OdakMenuEntry } from "@/ui/odak-menu";
import chatService from "../../services/chat-service";
import { toast } from "@/services/toast";

// Shared message furniture for both conversation surfaces (direct messages and
// lobby chat). They render the same message shape, so the reply quote,
// attachment and reaction bar live here rather than being written twice.

// Matches the backend's maxAttachmentBytes. Checked here too so a 40 MB video
// fails instantly instead of after a 60-second upload.
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * In place of the actions on a message of ours the server does not have yet:
 * "sending", or "failed" with a retry (same nonce, so never a second copy)
 * and a way to drop it.
 */
export function PendingSendStatus({ message }: { message: ChatMessage }): JSX.Element {
  const nonce = message.clientNonce ?? "";
  if (message.localState !== "failed") {
    return <span className="ct-chat-pending">Gönderiliyor…</span>;
  }
  return (
    <span className="ct-chat-pending failed">
      Gönderilemedi
      <button type="button" className="ct-link" onClick={() => void retrySend(nonce)}>
        Tekrar dene
      </button>
      <button type="button" className="ct-link" onClick={() => discardSend(nonce)}>
        Vazgeç
      </button>
    </span>
  );
}

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

// ONE line, always: name and the quoted text side by side, both truncated.
// Stacked, this was two lines of chrome above every reply — and above the
// composer it made the reply chip twice the height of the attachment one for no
// extra information. The arrow is the same glyph the row's "Yanıtla" button
// uses, so the quote and the action that produced it read as one gesture.
export function ChatReplyQuote({ replyTo }: ChatReplyQuoteProps): JSX.Element {
  return (
    <div className="ct-chat-reply-quote">
      <EnterOutlined className="ct-chat-reply-quote-icon" rotate={180} />

      {replyTo.deleted ? (
        <em>Silinmiş mesaj</em>
      ) : (
        <>
          <strong>{replyTo.username}</strong>
          <span>{replyTo.body}</span>
        </>
      )}
    </div>
  );
}

// A message whose entire body is an image URL renders as the image. That is how
// a GIF arrives: the send endpoint takes a body string and nothing else, so the
// picker posts the URL and the bubble turns it back into a picture here.
//
// Anchored at both ends on purpose. Only http/https ever matches, so a body of
// "data:image/svg+xml,<script>…" or a file:// path stays inert text, and a URL
// with words around it is a link the user typed, not a GIF they sent.
const BARE_IMAGE_URL_PATTERN =
  /^https?:\/\/\S+\.(?:gif|png|jpe?g|webp)(?:\?\S*)?$/i;

export const bareImageUrl = (body: string): string | null => {
  const trimmed = body.trim();
  return BARE_IMAGE_URL_PATTERN.test(trimmed) ? trimmed : null;
};

// Looking like an image is not enough to be FETCHED like one.
//
// Rendering any bare image URL as an <img> made every message an IP harvester:
// the renderer issues an unattended GET to an attacker-chosen host the moment
// the message scrolls into view, so a stranger posting "https://attacker.tld/
// t.png" into a lobby collects every viewer's public IP, User-Agent and exact
// read time with no interaction at all -- and can answer with 50 MB to burn
// their bandwidth. Only the GIF provider's own CDN is auto-loaded now; see
// GIF_CDN_DOMAIN in src/shared/gif-hosts.ts and the CSP that backs it.
//
// This also fixes the auth-protected case: an intranet image URL used to render
// as an empty broken-image box with the address readable only in alt/title.
// As text it is selectable and copyable again, exactly as before GIFs existed.
const autoLoadableImageUrl = (body: string): string | null => {
  const candidate = bareImageUrl(body);
  return candidate && isAutoLoadableImageUrl(candidate) ? candidate : null;
};

interface ChatImageProps {
  src: string;
  alt: string;
  className: string;
  // Runs on "İndir". Async so the caller can await its own IPC round trip.
  onDownload: () => Promise<void>;
}

// Whether this source can animate at all, and so whether the "play on hover"
// preference has anything to say about it. Matched on the URL extension for a
// posted GIF and on the media type for an uploaded attachment, which arrives as a
// data URL.
const isAnimatedSource = (src: string): boolean =>
  /^data:image\/(gif|webp|apng)\b/i.test(src) ||
  /\.(gif|webp|apng)(\?|#|$)/i.test(src);

/**
 * Captures an animated image's first frame onto a canvas.
 *
 * The frame is taken by drawing the loaded image to the canvas. Drawing a
 * cross-origin image is allowed — only READING the pixels back is not — so this
 * needs no CORS cooperation from the GIF CDN, which is why the poster stays a
 * canvas element instead of becoming a data URL.
 */
function useFirstFramePoster(
  src: string,
  enabled: boolean,
): {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  captured: boolean;
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    setCaptured(false);

    const canvas = canvasRef.current;
    if (!enabled || !canvas) {
      return;
    }

    // createElement, not `new Image()`: antd's Image component shadows the DOM
    // constructor in this module.
    const image = document.createElement("img");
    let cancelled = false;

    image.onload = () => {
      if (cancelled) {
        return;
      }
      // An image that has only just loaded is showing frame one, which is the
      // frame worth freezing on.
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      setCaptured(true);
    };

    // No onerror handling: a source that cannot load has no frame to freeze, and
    // the <img> already shows the browser's broken-image state.
    image.src = src;

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [enabled, src]);

  return { canvasRef, captured };
}

// One image renderer for both chat surfaces: a posted GIF and an uploaded
// attachment. Click enlarges, right-click offers a download.
//
// antd's Image carries the enlarge behaviour — a mask, a full-screen preview,
// Esc and click-outside to close, and zoom. Hand-rolling a lightbox would mean
// re-implementing focus trapping and scroll locking for no gain, and antd is
// already the app's component library.
//
// The download is its own action rather than a click on the picture, which is
// what the attachment used to do: clicking a picture to open a save dialog is
// nobody's expectation, and it made looking at an image impossible.
function ChatImage({
  src,
  alt,
  className,
  onDownload,
}: ChatImageProps): JSX.Element {
  const [saving, setSaving] = useState(false);
  const gifPlayback = useUiStore((state) => state.gifPlayback);
  const [hovered, setHovered] = useState(false);
  const canFreeze = gifPlayback === "hover" && isAnimatedSource(src);
  const { canvasRef, captured } = useFirstFramePoster(src, canFreeze);

  // The picture is REPLACED by its poster rather than covered by it.
  //
  // Covering it left the animation running underneath: with the canvas laid over
  // the image, any difference between the two boxes — a rounded corner, a
  // sub-pixel rounding in how each is scaled to the same max-width — showed a rim
  // of moving picture around a still one, and the decode kept costing what the
  // preference was meant to stop. An <img> that is not in the render tree is not
  // painted, and an image that is not painted does not advance its animation.
  const frozen = canFreeze && captured && !hovered;

  const handleDownload = useCallback(() => {
    if (saving) {
      return;
    }
    setSaving(true);
    void onDownload().finally(() => {
      setSaving(false);
    });
  }, [onDownload, saving]);

  return (
    // The picture's own menu, over the message's: the panel keeps the click
    // from the bubble underneath, which selects the message.
    <OdakMenu
      trigger="contextMenu"
      items={[
        {
          key: "download",
          icon: "download",
          label: saving ? "İndiriliyor…" : "Görseli indir",
          disabled: saving,
          onSelect: handleDownload,
        },
      ]}
    >
      {/* The span is not decoration. Dropdown attaches its contextmenu handler
          to the child through a ref, and antd's Image does not forward one to a
          DOM node — so right-click would silently do nothing. A plain element
          always takes the ref. */}
      <span
        className="ct-chat-image-root"
        // The message's own menu is on the row around it.
        onContextMenu={(event) => event.stopPropagation()}
        // Only bound when the preference is in play, so the common case does not
        // re-render a message row on every pointer crossing.
        onMouseEnter={canFreeze ? () => setHovered(true) : undefined}
        onMouseLeave={canFreeze ? () => setHovered(false) : undefined}
      >
        {/* Own wrapper, so `display: none` can be applied without depending on
            how antd names its internal one. */}
        <span className={`ct-chat-image-live ${frozen ? "is-hidden" : ""}`}>
          <Image
            src={src}
            alt={alt}
            title={alt}
            loading="lazy"
            className={className}
            preview={{
              mask: (
                <span className="ct-chat-image-mask">
                  <ExpandOutlined /> Büyüt
                </span>
              ),
            }}
          />
        </span>

        {/* Same class as the image, so the poster occupies exactly the same box
            and hovering does not shift the row. Kept mounted once the preference
            is on: unmounting it would re-capture the frame on every pointer exit.

            Click-to-enlarge is not lost by hiding the image: a click can only
            arrive while the pointer is over the picture, and that is precisely
            when the real image is the one on screen. */}
        {canFreeze && (
          <canvas
            ref={canvasRef}
            aria-hidden
            className={`${className} ct-chat-image-poster ${frozen ? "" : "is-hidden"}`}
          />
        )}
      </span>
    </OdakMenu>
  );
}

interface ChatMessageBodyProps {
  body: string;
  // The direct-message surface highlights @mentions in the same text; it hands
  // the decorated nodes in, and they are used for everything that is not an
  // image URL.
  children?: ReactNode;
}

export function ChatMessageBody({
  body,
  children,
}: ChatMessageBodyProps): JSX.Element {
  const imageUrl = autoLoadableImageUrl(body);

  if (imageUrl) {
    return (
      <ChatImage
        src={imageUrl}
        alt={body}
        className="ct-chat-inline-image"
        onDownload={async () => {
          const result = await chatService.saveChatImage({ url: imageUrl });
          if (!result.ok) {
            toast.error(result.error?.message ?? "Görsel indirilemedi");
          } else if (result.data?.saved) {
            toast.success("Görsel kaydedildi");
          }
        }}
      />
    );
  }

  return <p>{children ?? body}</p>;
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
        toast.error(result.error?.message ?? "Dosya kaydedilemedi");
      } else if (result.data?.saved) {
        toast.success("Dosya kaydedildi");
      }
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }, [attachment.id, attachment.name]);

  return (
    <div className="ct-chat-attachment">
      {attachment.isImage && !failed ? (
        <div>
          {dataUrl ? (
            <ChatImage
              src={dataUrl}
              alt={attachment.name}
              className="ct-chat-attachment-image"
              onDownload={handleSave}
            />
          ) : (
            <div className="ct-chat-attachment-loading">
              Görsel yükleniyor…
            </div>
          )}
        </div>
      ) : (
        <div className="ct-chat-attachment-file">
          <FileOutlined />
          <div className="ct-chat-attachment-meta">
            <div className="ct-chat-attachment-name" title={attachment.name}>
              {attachment.name}
            </div>
            <div className="ct-chat-attachment-size">
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
    <div className="ct-chat-reactions">
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
            className={`ct-chat-reaction ${mine ? "mine" : ""}`}
            aria-pressed={mine}
            // The glyph alone is announced as its unicode name with no count and
            // no clue that it can be pressed.
            aria-label={`${reaction.emoji} tepkisi, ${reaction.count} kişi${
              mine ? " (sen dahil)" : ""
            }`}
            title={mine ? "Tepkini geri al" : "Aynı tepkiyi ver"}
          >
            {/* Classed, not bare spans. `.ct-chat-bubble span` is (0,1,1) and
                sets display:block, 11px and the muted grey -- it was winning
                over the chip's own rule, so a reaction rendered smaller and
                fainter than the message it hung under. Two classes beat it
                outright instead of relying on which rule comes later. */}
            <span className="ct-chat-reaction-emoji">{reaction.emoji}</span>
            <span className="ct-chat-reaction-count">{reaction.count}</span>
          </button>
        );
      })}
    </div>
  );
}

// Loaded the first time somebody opens a picker, not at launch. See
// ./emoji-keyboard for why that is worth a lazy boundary.
const EmojiKeyboard = lazy(() => import("./emoji-keyboard"));

// Placeholder sized exactly like the real grid, so the popover does not open
// small and then jump to full height a frame later.
function EmojiKeyboardFallback(): JSX.Element {
  return <div className="ct-emoji-picker-loading" aria-busy="true" />;
}

interface LazyEmojiKeyboardProps {
  onPick: (emoji: string) => void;
}

function LazyEmojiKeyboard({ onPick }: LazyEmojiKeyboardProps): JSX.Element {
  return (
    <Suspense fallback={<EmojiKeyboardFallback />}>
      <EmojiKeyboard onPick={onPick} />
    </Suspense>
  );
}

interface ChatReactionButtonProps {
  onPick: (emoji: string) => void;
  /** Controlled, so the message menu's "+" can open the full set here. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// One button that opens the set, rather than six emoji sitting in every
// message row. Six glyphs per message read as decoration and crowded out the
// reply/edit/delete actions next to them.
export function ChatReactionButton({
  onPick,
  open: openProp,
  onOpenChange,
}: ChatReactionButtonProps): JSX.Element {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (next: boolean): void => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="top"
      rootClassName="ct-emoji-popover"
      content={
        <LazyEmojiKeyboard
          onPick={(emoji) => {
            onPick(emoji);
            setOpen(false);
          }}
        />
      }
    >
      {/* Hidden while open: tooltip and picker both open above the button. */}
      <Tooltip title="Tepki ekle" open={open ? false : undefined}>
        <button
          type="button"
          className="ct-chat-action"
          aria-label="Tepki ekle"
          aria-haspopup="true"
        >
          <SmileOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}

/** The quick reactions on a message's menu: six, fixed (the owner's decision). */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "🎉"];

interface MessageMenuOptions {
  message: ChatMessage;
  currentUserId: string;
  isOwnMessage: boolean;
  isDeleting: boolean;
  deleteDisabled: boolean;
  onToggleReaction: (emoji: string, add: boolean) => void;
  /** The "+" at the end of the reactions: the full picker. */
  onOpenReactionPicker: () => void;
  onReply: () => void;
  /** Own text messages only. */
  onEdit?: () => void;
  onRequestDelete: () => void;
}

const copyMessageText = async (text: string): Promise<void> => {
  // The clipboard and the status line "Kullanıcı adını kopyala" uses.
  const { setStatus } = useUiStore.getState();
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Metin kopyalandı", "ok");
  } catch (error) {
    console.error("[copy-message]", error);
    setStatus("Metin kopyalanamadı.", "warn");
  }
};

/**
 * A message's menu, on right-click and on the ⋯ over it (F10.2): the quick
 * reactions, then reply, edit, copy, and deleting last and apart. Deleting
 * left the hover bar for it, where it sat beside "Düzenle". Every row calls
 * the handler the bar's buttons call.
 */
export function buildMessageMenu(options: MessageMenuOptions): OdakMenuEntry[] {
  const { message, currentUserId } = options;
  const mine = (emoji: string): boolean =>
    (message.reactions ?? [])
      .find((reaction) => reaction.emoji === emoji)
      ?.userIds.includes(currentUserId) ?? false;

  return [
    {
      type: "strip",
      key: "react",
      items: [
        ...QUICK_REACTIONS.map((emoji) => ({
          key: emoji,
          label: emoji,
          ariaLabel: mine(emoji) ? `${emoji} tepkini geri al` : `${emoji} tepkisi ver`,
          // Your own reaction again takes it back, as in the picker.
          onSelect: () => options.onToggleReaction(emoji, !mine(emoji)),
        })),
        {
          key: "more",
          label: <MenuIcon name="plus" size={14} />,
          ariaLabel: "Başka tepki seç",
          onSelect: options.onOpenReactionPicker,
        },
      ],
    },
    { type: "divider" },
    { key: "reply", icon: "reply", label: "Yanıtla", onSelect: options.onReply },
    options.onEdit && { key: "edit", icon: "pencil", label: "Düzenle", onSelect: options.onEdit },
    Boolean(message.body) && {
      key: "copy",
      icon: "copy",
      label: "Metni kopyala",
      onSelect: () => void copyMessageText(message.body),
    },
    options.isOwnMessage && { type: "divider" },
    options.isOwnMessage && {
      key: "delete",
      icon: "trash",
      label: "Mesajı sil",
      opensDialog: true,
      danger: true,
      disabled: options.isDeleting ? "siliniyor" : options.deleteDisabled ? "şimdi olmaz" : false,
      onSelect: options.onRequestDelete,
    },
  ];
}

/** The ⋯ on a message's hover bar: the same menu as a right-click. */
export function ChatMessageMoreButton({ items }: { items: OdakMenuEntry[] }): JSX.Element {
  return (
    <OdakMenu trigger="click" items={items} placement="bottomRight">
      <Tooltip title="Diğer seçenekler">
        <button
          type="button"
          className="ct-chat-action"
          aria-label="Diğer seçenekler"
          aria-haspopup="menu"
        >
          <EllipsisOutlined />
        </button>
      </Tooltip>
    </OdakMenu>
  );
}

interface ChatComposerEmojiButtonProps {
  onPick: (emoji: string) => void;
  disabled?: boolean;
}

export function ChatComposerEmojiButton({
  onPick,
  disabled,
}: ChatComposerEmojiButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={setOpen}
      trigger="click"
      placement="topLeft"
      rootClassName="ct-emoji-popover"
      content={
        // Deliberately stays open. A reaction is one choice, but a message is
        // written with several -- closing after the first meant reopening the
        // picker (and losing the recents scroll position) for every emoji after
        // it. Click outside or the button itself to dismiss.
        <LazyEmojiKeyboard onPick={onPick} />
      }
    >
      {/* Hidden while open: tooltip and picker both open above the button. */}
      <Tooltip title="Emoji ekle" open={open ? false : undefined}>
        <Button
          type="text"
          size="small"
          disabled={disabled}
          icon={<SmileOutlined />}
          aria-label="Emoji ekle"
        />
      </Tooltip>
    </Popover>
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
        toast.error("Dosya en fazla 5 MB olabilir");
        return;
      }

      try {
        onSelect(await readFileAsUpload(file), file);
      } catch {
        toast.error("Dosya okunamadı");
      }
    },
    [onSelect],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(event) => void handleChange(event)}
      />
      <Tooltip title="Dosya ekle (en fazla 5 MB)">
        <Button
          type="text"
          size="small"
          disabled={disabled}
          icon={<PaperClipOutlined />}
          onClick={() => inputRef.current?.click()}
          aria-label="Dosya ekle"
        />
      </Tooltip>
    </>
  );
}
