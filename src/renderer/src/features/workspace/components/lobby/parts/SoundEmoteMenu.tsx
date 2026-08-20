import { useCallback, useRef, useState } from "react";
import { Button, Input, Modal, Popover, Slider, Tooltip, message } from "antd";
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
  EMOTE_MAX_NAME_LENGTH,
  EMOTE_MAX_SECONDS,
} from "../../../hooks/lobby/use-emote-library";
import { MAX_EMOTE_VOLUME_PERCENT } from "@/store/emote-volume";
import { useUiStore } from "@/store/ui-store";

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
  // This user's own knob for how loud everyone else's soundboard is. It lives
  // here rather than in Ayarlar because this is the panel people are looking at
  // when the answer stops being right.
  const emoteVolumePercent = useUiStore((state) => state.emoteVolumePercent);
  const setEmoteVolumePercent = useUiStore(
    (state) => state.setEmoteVolumePercent,
  );
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
        // Clipped here, not left to maxLength: that only bounds what a person
        // types, so a long filename went to the server whole and came back a
        // validation error the user had done nothing to cause.
        setPendingName(upload.fileName.slice(0, EMOTE_MAX_NAME_LENGTH));
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
        onOpenChange={(open) => {
          setIsOpen(open);
          // The board is shared and nothing pushes an update when somebody else
          // uploads. Opening it is the only moment its contents are looked at,
          // so it is also the only moment worth a request.
          if (open) {
            library.refresh();
          }
        }}
        trigger="click"
        placement="top"
        content={
          <div className="ct-sound-emote-board">
            <div className="ct-sound-emote-volume">
              <label htmlFor="ct-emote-volume">
                Emote ses seviyesi
                <strong>%{emoteVolumePercent}</strong>
              </label>
              <Slider
                id="ct-emote-volume"
                min={0}
                max={MAX_EMOTE_VOLUME_PERCENT}
                step={5}
                value={emoteVolumePercent}
                onChange={setEmoteVolumePercent}
                tooltip={{ formatter: (value) => `%${value}` }}
              />
            </div>

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
              /* One per row, not a two-column grid. A 232px board split in two
                 left about 50px for the label, so an uploaded sound's name was
                 the one thing on the board you could not read -- and the
                 uploader was hidden in a title attribute nobody hovers. */
              <div className="ct-sound-emote-list">
                {library.emotes.map((emote) => (
                  <div key={emote.id} className="ct-sound-emote-custom">
                    <button
                      type="button"
                      className="ct-sound-emote-row"
                      onClick={() =>
                        handlePick(`${CUSTOM_EMOTE_PREFIX}${emote.id}`)
                      }
                      // The full name, for the one that still does not fit.
                      title={`${emote.name} · @${emote.ownerUsername}`}
                    >
                      <span aria-hidden>🔊</span>
                      <span className="ct-sound-emote-name">{emote.name}</span>
                      <span className="ct-sound-emote-owner">
                        @{emote.ownerUsername}
                      </span>
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
              maxLength={EMOTE_MAX_NAME_LENGTH}
              // The count is the point: the field silently refused the 25th
              // character with nothing on screen to explain why.
              showCount
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
