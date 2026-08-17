import { useCallback, useRef, useState } from "react";
import { Button, Input, Modal, Popover, Tooltip, message } from "antd";
import {
  DeleteOutlined,
  NotificationOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  CUSTOM_EMOTE_PREFIX,
  LOBBY_SOUND_EMOTES,
  type LobbySoundEmote,
} from "@shared/desktop-api-types";
import {
  canDeleteEmote,
  useEmoteLibrary,
  EMOTE_ACCEPTED_MIME_TYPES,
  EMOTE_MAX_FILE_BYTES,
  EMOTE_MAX_SECONDS,
} from "../../../hooks/lobby/use-emote-library";

// Label and glyph per built-in emote. The ids come from the shared set so this
// cannot offer one the server would refuse; the picker breaks at compile time
// if the set grows and a label is forgotten.
const EMOTE_LABELS: Record<LobbySoundEmote, { icon: string; label: string }> = {
  clap: { icon: "👏", label: "Alkış" },
  laugh: { icon: "😂", label: "Kahkaha" },
  drum: { icon: "🥁", label: "Trampet" },
  airhorn: { icon: "📣", label: "Korna" },
  wow: { icon: "😮", label: "Vay" },
  sad: { icon: "😢", label: "Üzgün" },
};

interface SoundEmoteMenuProps {
  onSend: (emote: string) => void;
  currentUserId: string;
  currentUserRole: string;
  disabled?: boolean;
}

interface PendingUpload {
  fileName: string;
  dataUrl: string;
  seconds: number;
}

// Reads the file and measures it, so a rejection can say which rule it broke
// rather than "upload failed". Duration needs a decode, which is also the only
// honest way to know the file is really playable audio.
const readEmoteFile = async (file: File): Promise<PendingUpload> => {
  if (!EMOTE_ACCEPTED_MIME_TYPES.includes(file.type)) {
    throw new Error("Yalnızca MP3, OGG, WAV veya WEBM ses dosyaları yüklenebilir.");
  }
  if (file.size > EMOTE_MAX_FILE_BYTES) {
    throw new Error(
      `Dosya en fazla ${Math.floor(EMOTE_MAX_FILE_BYTES / 1024)} KB olabilir.`,
    );
  }

  const buffer = await file.arrayBuffer();

  // decodeAudioData both validates and measures. A file that fails here would
  // have been silence on everyone else's machine too.
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let seconds = 0;
  if (AudioCtx) {
    const context = new AudioCtx();
    try {
      // decodeAudioData detaches the buffer, so it gets its own copy.
      const decoded = await context.decodeAudioData(buffer.slice(0));
      seconds = decoded.duration;
    } catch {
      throw new Error("Ses dosyası çözümlenemedi.");
    } finally {
      void context.close();
    }
  }

  if (seconds > EMOTE_MAX_SECONDS) {
    throw new Error(
      `Ses en fazla ${EMOTE_MAX_SECONDS} saniye olabilir (bu dosya ${Math.round(seconds)} sn).`,
    );
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return {
    fileName: file.name.replace(/\.[^.]+$/, "").slice(0, 24),
    dataUrl: `data:${file.type};base64,${btoa(binary)}`,
    seconds,
  };
};

/**
 * The soundboard button: the six synthesised emotes, plus everything the server
 * has been uploaded.
 *
 * Sending does NOT play anything locally: the sound arrives back over the lobby
 * stream like it does for everyone else, so what the sender hears is what the
 * room heard. A local preview would fire even when the server refused the
 * broadcast (rate limit, no longer a member), which is the one case where the
 * sender most needs to notice.
 */
export function SoundEmoteMenu({
  onSend,
  currentUserId,
  currentUserRole,
  disabled,
}: SoundEmoteMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [pendingName, setPendingName] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const library = useEmoteLibrary();

  const handlePick = useCallback(
    (emote: string): void => {
      setIsOpen(false);
      onSend(emote);
    },
    [onSend],
  );

  const handleFileChosen = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.target.files?.[0];
      // Cleared immediately so picking the same file twice still fires a change.
      event.target.value = "";
      if (!file) {
        return;
      }

      try {
        const upload = await readEmoteFile(file);
        setPending(upload);
        setPendingName(upload.fileName);
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "Ses dosyası okunamadı.",
        );
      }
    },
    [],
  );

  const confirmUpload = useCallback(async (): Promise<void> => {
    if (!pending) {
      return;
    }

    try {
      await library.upload(pendingName.trim(), pending.dataUrl);
      message.success("Ses eklendi");
      setPending(null);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Ses yüklenemedi",
      );
    }
  }, [library, pending, pendingName]);

  const handleDelete = useCallback(
    async (emoteId: string): Promise<void> => {
      try {
        await library.remove(emoteId);
        message.success("Ses silindi");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "Ses silinemedi");
      }
    },
    [library],
  );

  return (
    <>
      <Popover
        open={disabled ? false : isOpen}
        onOpenChange={setIsOpen}
        trigger="click"
        placement="top"
        rootClassName="ct-sound-emote-popover"
        content={
          <div className="ct-sound-emote-board">
            <div className="ct-sound-emote-grid">
              {LOBBY_SOUND_EMOTES.map((emote) => (
                <button
                  key={emote}
                  type="button"
                  className="ct-sound-emote-item"
                  onClick={() => handlePick(emote)}
                  aria-label={EMOTE_LABELS[emote].label}
                >
                  <span aria-hidden>{EMOTE_LABELS[emote].icon}</span>
                  <span>{EMOTE_LABELS[emote].label}</span>
                </button>
              ))}
            </div>

            <div className="ct-sound-emote-section">
              <span>Yüklenen sesler</span>
              <span className="ct-sound-emote-quota">
                {library.used}/{library.quota}
              </span>
            </div>

            {library.emotes.length === 0 ? (
              <p className="ct-sound-emote-empty">
                Henüz kimse ses yüklememiş.
              </p>
            ) : (
              <div className="ct-sound-emote-grid">
                {library.emotes.map((emote) => (
                  <div key={emote.id} className="ct-sound-emote-custom">
                    <button
                      type="button"
                      className="ct-sound-emote-item"
                      onClick={() =>
                        handlePick(`${CUSTOM_EMOTE_PREFIX}${emote.id}`)
                      }
                      title={`@${emote.ownerUsername}`}
                    >
                      <span aria-hidden>🔊</span>
                      <span>{emote.name}</span>
                    </button>

                    {canDeleteEmote(emote, currentUserId, currentUserRole) && (
                      <Button
                        type="text"
                        size="small"
                        danger
                        className="ct-sound-emote-delete"
                        icon={<DeleteOutlined />}
                        onClick={() => void handleDelete(emote.id)}
                        aria-label={`${emote.name} sesini sil`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button
              block
              size="small"
              icon={<UploadOutlined />}
              disabled={!library.canUploadMore}
              onClick={() => fileInputRef.current?.click()}
            >
              {library.canUploadMore
                ? "Ses Yükle"
                : `Hakkın doldu (${library.quota})`}
            </Button>
          </div>
        }
      >
        <Tooltip title="Sesli Emote">
          <Button
            size="large"
            className={`ct-lobby-action-btn ${isOpen ? "active" : ""}`}
            icon={<NotificationOutlined />}
            disabled={disabled}
            aria-label="Sesli emote gönder"
          />
        </Tooltip>
      </Popover>

      {/* Outside the popover: the popover unmounts on pick, and an input that
          unmounts mid-dialog never fires its change event. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={EMOTE_ACCEPTED_MIME_TYPES.join(",")}
        hidden
        onChange={(event) => void handleFileChosen(event)}
      />

      <Modal
        rootClassName="ct-modal"
        title="Sesi Adlandır"
        open={pending !== null}
        onOk={() => void confirmUpload()}
        onCancel={() => setPending(null)}
        okText="Yükle"
        cancelText="İptal"
        okButtonProps={{
          loading: library.isUploading,
          disabled: pendingName.trim().length === 0,
        }}
        destroyOnHidden
      >
        <div className="ct-modal-form">
          <label className="ct-field" htmlFor="emote-name">
            <span>Ses Adı</span>
            <Input
              id="emote-name"
              value={pendingName}
              onChange={(event) => setPendingName(event.target.value)}
              maxLength={24}
              placeholder="Korna"
            />
          </label>
          <p className="ct-field-hint">
            {pending ? `${pending.seconds.toFixed(1)} sn · ` : ""}
            Bu ses sunucudaki herkes tarafından kullanılabilir.
          </p>
        </div>
      </Modal>
    </>
  );
}
