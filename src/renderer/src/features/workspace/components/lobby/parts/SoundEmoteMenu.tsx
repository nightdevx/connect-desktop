import {
  useCallback,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from "react";
import { Button, Modal, Popover, Tooltip } from "antd";
import { VolumeSlider } from "@/ui/volume-slider";
import { NotificationOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { MenuIcon, type OdakMenuIcon } from "@/ui/odak-menu";
import {
  CUSTOM_EMOTE_PREFIX,
  LOBBY_SOUND_EMOTES,
  type LobbySoundEmote,
} from "@shared/desktop-api-types";
import {
  canDeleteEmote,
  playCustomEmote,
  useEmoteLibrary,
  EMOTE_ACCEPTED_MIME_TYPES,
  EMOTE_MAX_FILE_BYTES,
  EMOTE_MAX_NAME_LENGTH,
  EMOTE_MAX_SECONDS,
} from "../../../hooks/lobby/use-emote-library";
import { emoteSeconds, soundEffectManager } from "@/features/sound-effects";
import { MAX_EMOTE_VOLUME_PERCENT } from "@/store/emote-volume";
import { useUiStore } from "@/store/ui-store";
import { toast } from "@/services/toast";
import "@/styles/modules/features/odak-pencereler.css";

// Label and line icon per built-in emote. The ids come from the shared set so
// this cannot offer one the server would refuse; the board breaks at compile
// time if the set grows and a label is forgotten.
const EMOTE_LABELS: Record<LobbySoundEmote, { icon: OdakMenuIcon; label: string }> = {
  clap: { icon: "hand", label: "Alkış" },
  laugh: { icon: "laugh", label: "Kahkaha" },
  drum: { icon: "drum", label: "Trampet" },
  airhorn: { icon: "megaphone", label: "Korna" },
  wow: { icon: "sparkles", label: "Vay" },
  sad: { icon: "frown", label: "Üzgün" },
};

const MAX_KB = Math.floor(EMOTE_MAX_FILE_BYTES / 1024);
const RULES = `MP3, OGG, WAV veya WEBM; en çok ${MAX_KB} KB ve ${EMOTE_MAX_SECONDS} saniye`;
// Past this many sounds the board gets a search box.
const SEARCH_FROM = 8;

const formatSeconds = (seconds: number): string =>
  `${seconds.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sn`;

const normalize = (text: string): string => text.toLocaleLowerCase("tr-TR").trim();

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
  bytes: number;
}

/** One sound on the board, built-in or uploaded. */
interface SoundRow {
  /** What goes on the wire: the built-in id, or custom:<id>. */
  reference: string;
  name: string;
  icon: OdakMenuIcon;
  /** Under the name: the length, and for an upload whose it is. */
  meta: string;
  ownerLabel?: string;
  /** Set for an upload this user may delete. */
  deletableId?: string;
  /** For the length, read once the clip has been decoded. */
  sampleId?: string;
}

// Reads the file and measures it, so a rejection can say which rule it broke
// rather than "upload failed". Duration needs a decode, which is also the only
// honest way to know the file is really playable audio.
const readEmoteFile = async (file: File): Promise<PendingUpload> => {
  if (!EMOTE_ACCEPTED_MIME_TYPES.includes(file.type)) {
    throw new Error("Yalnızca MP3, OGG, WAV veya WEBM ses dosyaları yüklenebilir.");
  }
  if (file.size > EMOTE_MAX_FILE_BYTES) {
    throw new Error(`Dosya en fazla ${MAX_KB} KB olabilir.`);
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
    bytes: file.size,
  };
};

/**
 * The soundboard button: the six synthesised emotes, plus everything the server
 * has been uploaded, as one list in three groups (built-in, yours, everybody
 * else's). A row sends; its play button previews for this user alone.
 *
 * Sending does NOT play anything locally: the sound arrives back over the lobby
 * stream like it does for everyone else, so what the sender hears is what the
 * room heard. A local echo would fire even when the server refused the
 * broadcast (rate limit, no longer a member), which is the one case where the
 * sender most needs to notice. The preview is the deliberate exception: asked
 * for, and labelled as heard by you alone.
 *
 * Keyboard: the board takes focus when it opens (the search box, or the first
 * sound); ↑↓ walk the sounds, Enter sends, Esc closes and returns focus to the
 * button. Enter in the search box sends the first match.
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
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  // Bumped when a preview has decoded an upload, so its length shows.
  const [, setDecoded] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const previewTimer = useRef<number | undefined>(undefined);
  const library = useEmoteLibrary();
  const queryClient = useQueryClient();

  // Not memoised: a handful of rows, and an upload's length comes from the
  // audio manager's cache, which no dependency list can see change.
  const groups = (() => {
    const builtIn: SoundRow[] = LOBBY_SOUND_EMOTES.map((emote) => ({
      reference: emote,
      name: EMOTE_LABELS[emote].label,
      icon: EMOTE_LABELS[emote].icon,
      meta: formatSeconds(emoteSeconds(emote)),
    }));
    const mine: SoundRow[] = [];
    const others: SoundRow[] = [];
    for (const emote of library.emotes) {
      const seconds = soundEffectManager.sampleSeconds(emote.id);
      const length = seconds === null ? null : formatSeconds(seconds);
      const isMine = emote.ownerId === currentUserId;
      const row: SoundRow = {
        reference: `${CUSTOM_EMOTE_PREFIX}${emote.id}`,
        name: emote.name,
        icon: "waveform",
        meta: isMine
          ? (length ?? "Yüklediğin ses")
          : [`@${emote.ownerUsername}`, length].filter(Boolean).join(" · "),
        ownerLabel: isMine ? undefined : `@${emote.ownerUsername}`,
        deletableId: canDeleteEmote(emote, currentUserId, currentUserRole)
          ? emote.id
          : undefined,
        sampleId: emote.id,
      };
      (isMine ? mine : others).push(row);
    }

    const needle = normalize(query);
    const match = (row: SoundRow): boolean =>
      needle === "" ||
      normalize(row.name).includes(needle) ||
      (row.ownerLabel !== undefined && normalize(row.ownerLabel).includes(needle));

    return [
      { key: "built-in", title: "Hazır sesler", hint: "", rows: builtIn.filter(match) },
      {
        key: "mine",
        title: "Senin seslerin",
        hint: `${library.used}/${library.quota}`,
        rows: mine.filter(match),
      },
      { key: "others", title: "Herkesin yükledikleri", hint: "", rows: others.filter(match) },
    ];
  })();

  const total = LOBBY_SOUND_EMOTES.length + library.emotes.length;
  const showSearch = total > SEARCH_FROM;
  const firstMatch = groups.flatMap((group) => group.rows)[0];
  const noMatches = query.trim() !== "" && !firstMatch;

  const close = useCallback((returnFocus: boolean): void => {
    setIsOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const handlePick = useCallback(
    (emote: string): void => {
      close(true);
      onSend(emote);
    },
    [close, onSend],
  );

  const handlePreview = useCallback(
    (row: SoundRow): void => {
      window.clearTimeout(previewTimer.current);
      setPreviewing(row.reference);
      const done = (): void => {
        const seconds = row.sampleId
          ? (soundEffectManager.sampleSeconds(row.sampleId) ?? 1)
          : emoteSeconds(row.reference);
        previewTimer.current = window.setTimeout(() => {
          setPreviewing(null);
          setDecoded((value) => value + 1);
        }, Math.max(400, seconds * 1000));
      };
      if (row.sampleId) {
        void playCustomEmote(queryClient, row.reference).then(done);
      } else {
        soundEffectManager.playEmote(row.reference);
        done();
      }
    },
    [queryClient],
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
        toast.error(
          error instanceof Error ? error.message : "Ses dosyası okunamadı.",
        );
      }
    },
    [],
  );

  const confirmUpload = useCallback(async (): Promise<void> => {
    const name = pendingName.trim();
    if (!pending || name === "") {
      return;
    }

    // One toast under one key: it shows the upload, then becomes its answer.
    toast.progress({ key: "ct-emote-upload", title: "Ses yükleniyor", description: name });
    try {
      await library.upload(name, pending.dataUrl);
      toast.success({ key: "ct-emote-upload", title: "Ses eklendi", description: name });
      setPending(null);
    } catch (error) {
      toast.error({
        key: "ct-emote-upload",
        title: error instanceof Error ? error.message : "Ses yüklenemedi",
      });
    }
  }, [library, pending, pendingName]);

  const handleDelete = useCallback(
    async (emoteId: string): Promise<void> => {
      try {
        await library.remove(emoteId);
        toast.success("Ses silindi");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Ses silinemedi");
      }
    },
    [library],
  );

  // ↑↓ between the sounds (and up into the search box), Home/End to the ends,
  // Esc out. Tab still reaches every button, the preview and delete ones too.
  const handleBoardKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    const stops = [
      ...(searchRef.current ? [searchRef.current] : []),
      ...(boardRef.current?.querySelectorAll<HTMLButtonElement>(".ct-emote-send") ?? []),
    ];
    if (stops.length === 0) {
      return;
    }
    const target = event.target as HTMLElement;
    const row = target.closest(".ct-emote-row")?.querySelector<HTMLElement>(".ct-emote-send");
    const index = stops.indexOf((row ?? target) as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? stops.length - 1
          : event.key === "ArrowDown"
            ? Math.min(stops.length - 1, index + 1)
            : Math.max(0, index - 1);
    event.preventDefault();
    stops[next]?.focus();
    stops[next]?.scrollIntoView({ block: "nearest" });
  };

  const board = (
    <div className="ct-emote-board" ref={boardRef} onKeyDown={handleBoardKeyDown}>
      <header className="ct-emote-board-head">
        <strong>Ses efektleri</strong>
        <span>Seçtiğin ses odadaki herkese çalar.</span>
      </header>

      {showSearch && (
        <label className="ct-emote-search">
          <MenuIcon name="search" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Ses ara"
            aria-label="Ses ara"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && firstMatch) {
                event.preventDefault();
                handlePick(firstMatch.reference);
              }
            }}
          />
        </label>
      )}

      <div className="ct-emote-list">
        {noMatches && (
          <p className="ct-emote-empty">“{query.trim()}” ile eşleşen ses yok.</p>
        )}
        {groups.map((group) =>
          group.rows.length === 0 && !(group.key === "mine" && query.trim() === "") ? null : (
            <section key={group.key} className="ct-emote-group" aria-label={group.title}>
              <h3 className="ct-emote-group-title">
                {group.title}
                {group.hint && <span>{group.hint}</span>}
              </h3>
              {group.key === "mine" && group.rows.length === 0 && (
                <p className="ct-emote-empty">Henüz ses yüklemedin.</p>
              )}
              {group.rows.map((row) => (
                <div
                  key={row.reference}
                  className={`ct-emote-row${previewing === row.reference ? " previewing" : ""}`}
                >
                  <button
                    type="button"
                    className="ct-emote-send"
                    onClick={() => handlePick(row.reference)}
                    aria-label={`${row.name} sesini odaya çal`}
                  >
                    <span className="ct-emote-glyph" aria-hidden="true">
                      <MenuIcon name={row.icon} />
                    </span>
                    <span className="ct-emote-text">
                      <span className="ct-emote-name">{row.name}</span>
                      <span className="ct-emote-meta">{row.meta}</span>
                    </span>
                  </button>
                  <Tooltip title="Dinle · yalnız sen duyarsın" mouseEnterDelay={0.4}>
                    <button
                      type="button"
                      className="ct-emote-action"
                      onClick={() => handlePreview(row)}
                      aria-label={`${row.name} sesini dinle`}
                    >
                      <MenuIcon name={previewing === row.reference ? "volume" : "play"} />
                    </button>
                  </Tooltip>
                  {row.deletableId && (
                    <Tooltip title="Sil" mouseEnterDelay={0.4}>
                      <button
                        type="button"
                        className="ct-emote-action danger"
                        onClick={() => void handleDelete(row.deletableId as string)}
                        aria-label={`${row.name} sesini sil`}
                      >
                        <MenuIcon name="trash" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              ))}
            </section>
          ),
        )}
      </div>

      <footer className="ct-emote-board-foot">
        <button
          type="button"
          className="ct-emote-upload"
          disabled={!library.canUploadMore}
          onClick={() => {
            // Shut first: the board would otherwise sit above the naming
            // dialog that follows the file picker.
            close(false);
            fileInputRef.current?.click();
          }}
        >
          <span className="ct-emote-glyph" aria-hidden="true">
            <MenuIcon name="upload" />
          </span>
          <span className="ct-emote-text">
            <span className="ct-emote-name">
              {library.canUploadMore ? "Ses yükle" : `Yükleme hakkın doldu (${library.quota})`}
            </span>
            <span className="ct-emote-meta">
              {library.canUploadMore ? RULES : "Yeni ses için yüklediklerinden birini sil."}
            </span>
          </span>
        </button>

        <div className="ct-emote-volume">
          <label htmlFor="ct-emote-volume">
            Sende ses seviyesi
            <span>%{emoteVolumePercent}</span>
          </label>
          <VolumeSlider
            id="ct-emote-volume"
            max={MAX_EMOTE_VOLUME_PERCENT}
            value={emoteVolumePercent}
            onChange={setEmoteVolumePercent}
          />
        </div>
      </footer>
    </div>
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
            setQuery("");
            library.refresh();
          }
        }}
        afterOpenChange={(open) => {
          if (open) {
            (searchRef.current ?? boardRef.current?.querySelector<HTMLElement>(".ct-emote-send"))?.focus();
          }
        }}
        trigger="click"
        placement="top"
        arrow={false}
        rootClassName="ct-emote-popover"
        content={board}
      >
        {/* Hidden while open: tooltip and board both open above the button. */}
        <Tooltip title="Ses efektleri" open={isOpen ? false : undefined}>
          <Button
            ref={triggerRef}
            size="large"
            className={`ct-lobby-action-btn ${isOpen ? "active" : ""}`}
            data-label="Tepki"
            icon={<NotificationOutlined />}
            disabled={disabled}
            aria-label="Sesli emote gönder"
            aria-expanded={isOpen}
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
        title={
          <ModalHeading
            icon={<MenuIcon name="waveform" size={19} />}
            title="Sesi adlandır"
            description="Panoda herkesin göreceği adı yaz."
          />
        }
        open={pending !== null}
        onOk={() => void confirmUpload()}
        onCancel={() => setPending(null)}
        okText={library.isUploading ? "Yükleniyor…" : "Yükle"}
        cancelText="Vazgeç"
        width={MODAL_WIDTH.s}
        okButtonProps={{
          loading: library.isUploading,
          disabled: pendingName.trim().length === 0,
        }}
        destroyOnHidden
      >
        <div className="ct-modal-form">
          {pending && <UploadFileCard upload={pending} />}
          <label className="ct-field" htmlFor="emote-name">
            <span className="ct-field-label-row">
              Ses adı
              <span className="ct-field-count">
                {pendingName.length}/{EMOTE_MAX_NAME_LENGTH}
              </span>
            </span>
            <input
              id="emote-name"
              type="text"
              className={`ct-input${pendingName.trim() === "" ? " invalid" : ""}`}
              value={pendingName}
              onChange={(event) => setPendingName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void confirmUpload();
                }
              }}
              maxLength={EMOTE_MAX_NAME_LENGTH}
              placeholder="Örn. Korna"
              autoFocus
              aria-invalid={pendingName.trim() === "" ? true : undefined}
              aria-describedby="emote-name-hint"
            />
            {pendingName.trim() === "" ? (
              <small id="emote-name-hint" className="ct-field-error" role="alert">
                <MenuIcon name="alert" size={14} />
                Sese bir ad ver.
              </small>
            ) : (
              <small id="emote-name-hint" className="ct-field-hint">
                Sunucudaki herkes bu sesi panosunda görür ve çalabilir.
              </small>
            )}
          </label>
        </div>
      </Modal>
    </>
  );
}

function UploadFileCard({ upload }: { upload: PendingUpload }): JSX.Element {
  return (
    <div className="ct-emote-file">
      <span className="ct-emote-glyph" aria-hidden="true">
        <MenuIcon name="waveform" />
      </span>
      <span className="ct-emote-text">
        <span className="ct-emote-name">{upload.fileName}</span>
        <span className="ct-emote-meta">
          {formatSeconds(upload.seconds)} · {Math.max(1, Math.round(upload.bytes / 1024))} KB
        </span>
      </span>
    </div>
  );
}
