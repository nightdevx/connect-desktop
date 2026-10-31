import type { JSX, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Tooltip } from "antd";
import { VolumeSlider } from "@/ui/volume-slider";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { MenuIcon, type OdakMenuIcon } from "@/ui/odak-menu";
import { formatMusicDuration, type MusicLogLine } from "@shared/music";
import { musicSentence, useMusicRoom } from "./use-music-room";
import "@/styles/modules/features/odak-pencereler.css";

export interface MusicBotAudioDiagnostics {
  seen: boolean;
  publishing: boolean;
  subscribed: boolean;
  muted: boolean;
}

interface MusicModalProps {
  lobbyId: string | null;
  open: boolean;
  onClose: () => void;
  volumePercent: number;
  onVolumeChange: (volumePercent: number) => void;
  diagnostics: MusicBotAudioDiagnostics | null;
}

const logToneClass = (line: MusicLogLine): string => {
  if (line.kind === "error") {
    return "ct-music-log-line error";
  }
  if (line.kind === "command") {
    return "ct-music-log-line command";
  }
  return "ct-music-log-line";
};

// Whether this client is getting the bot's sound, in plain words. The checks
// are the same four the dialog always made; only the wording is new.
const describeDiagnostics = (
  diagnostics: MusicBotAudioDiagnostics,
): { ok: boolean; text: string } => {
  if (!diagnostics.seen) return { ok: false, text: "Bot sende görünmüyor; sesi sana ulaşmıyor." };
  if (!diagnostics.publishing) return { ok: false, text: "Bot bağlandı ama henüz ses göndermiyor." };
  if (diagnostics.muted) return { ok: false, text: "Botun yayını susturulmuş görünüyor." };
  if (!diagnostics.subscribed) return { ok: false, text: "Bot ses gönderiyor ama sana bağlanmadı." };
  return { ok: true, text: "Ses sana geliyor." };
};

function IconButton({
  label,
  icon,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  icon: OdakMenuIcon;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <Tooltip title={label} mouseEnterDelay={0.4}>
      <button
        type="button"
        className={`ct-music-icon-btn${danger ? " danger" : ""}`}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        <MenuIcon name={icon} />
      </button>
    </Tooltip>
  );
}

/**
 * The room's music bot.
 *
 * A dialog off the lobby toolbar rather than a strip docked above the chat. The
 * old panel only existed while the chat column was open, was collapsed by
 * default, and kept its transport buttons and its volume slider behind that
 * collapse — so somebody who never opened the chat had no music controls at
 * all, which is most of why "the volume does nothing" was the common report.
 *
 * Read top to bottom it answers, in order: what is playing (or that nothing
 * is), what to type to play something and what happens then, what is waiting,
 * and how loud it is for you. Who hears it is in the heading: everybody in the
 * room.
 *
 * The commands are still the contract underneath: every button here is
 * shorthand for one somebody could type. Nothing has to be typed, though — a
 * link or a song's name goes in the box and the buttons do the rest.
 */
export function MusicModal({
  lobbyId,
  open,
  onClose,
  volumePercent,
  onVolumeChange,
  diagnostics,
}: MusicModalProps): JSX.Element | null {
  const { state, isDj, available, isSending, lastReply, lastError, send } =
    useMusicRoom(lobbyId);

  const [draft, setDraft] = useState("");
  // What was asked for while the bot looks it up, for the "aranıyor" line.
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const playing = state.nowPlaying !== null && !state.paused;

  // Only while somebody is looking: a per-second timer behind a closed dialog
  // re-renders the lobby once a second to move a progress bar nobody can see.
  useEffect(() => {
    if (!playing || !open) {
      return;
    }
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [open, playing, state.revision]);

  useEffect(() => {
    setTick(0);
  }, [state.revision]);

  useEffect(() => {
    if (open) {
      logEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [open, state.log.length]);

  const position = useMemo(() => {
    if (!state.nowPlaying) {
      return 0;
    }
    const elapsed = state.positionSeconds + (playing ? tick : 0);
    if (state.nowPlaying.durationSeconds > 0) {
      return Math.min(elapsed, state.nowPlaying.durationSeconds);
    }
    return elapsed;
  }, [playing, state.nowPlaying, state.positionSeconds, tick]);

  const progressPercent = useMemo(() => {
    const total = state.nowPlaying?.durationSeconds ?? 0;
    if (total <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((position / total) * 100));
  }, [position, state.nowPlaying]);

  if (!lobbyId || !available) {
    return null;
  }

  const runCommand = (command: string): void => {
    void send(command);
  };

  const enqueueDraft = (): void => {
    const trimmed = draft.trim();
    if (trimmed === "" || isSending) {
      return;
    }
    setDraft("");
    setPendingQuery(trimmed);
    // A link OR a search phrase: the resolver decides which it got, so the box
    // needs neither a mode switch nor a typed command prefix.
    void send("play " + trimmed).then(() => setPendingQuery(null));
  };

  const nowPlaying = state.nowPlaying;
  const health = state.connected && diagnostics ? describeDiagnostics(diagnostics) : null;

  let feedback: ReactNode;
  if (pendingQuery !== null) {
    feedback = (
      <small className="ct-music-status busy" role="status">
        <span className="ct-music-spin" aria-hidden="true">
          <MenuIcon name="loader" size={14} />
        </span>
        “{pendingQuery}” aranıyor…
      </small>
    );
  } else if (lastError) {
    feedback = (
      <small className="ct-field-error" role="alert">
        <MenuIcon name="alert" size={14} />
        {lastError}
      </small>
    );
  } else if (lastReply) {
    feedback = (
      <small className="ct-music-status done" role="status">
        <MenuIcon name="check" size={14} />
        {musicSentence(lastReply)}
      </small>
    );
  } else {
    feedback = (
      <small className="ct-field-hint">
        Bağlantı yapıştırırsan o parça, ad yazarsan ilk arama sonucu çalınır.
        Çalan biterse sıradaki başlar.
      </small>
    );
  }

  return (
    <Modal
      rootClassName="ct-modal"
      title={
        <ModalHeading
          icon={<MenuIcon name="music" size={19} />}
          title="Müzik"
          description="Bot bu odaya katılıp çalar; odadaki herkes aynı anda duyar."
        />
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={MODAL_WIDTH.m}
      destroyOnHidden
    >
      <div className="ct-music-body">
        <section
          className={`ct-music-now${nowPlaying ? (state.paused ? " paused" : " playing") : ""}`}
          aria-label="Şu an çalan"
        >
          <div className="ct-music-now-row">
            <span className="ct-music-art" aria-hidden="true">
              <MenuIcon name={nowPlaying ? "waveform" : "music"} size={18} />
            </span>
            <span className="ct-music-now-text">
              <span className="ct-music-kicker">
                {nowPlaying ? (state.paused ? "Duraklatıldı" : "Şu an çalıyor") : "Sessiz"}
              </span>
              <span className="ct-music-title" title={nowPlaying?.title}>
                {nowPlaying ? nowPlaying.title : "Şu an bir şey çalmıyor"}
              </span>
              <span className="ct-music-subtitle">
                {nowPlaying
                  ? `${nowPlaying.requestedByName} istedi`
                  : isDj
                    ? "Aşağıya bir bağlantı ya da şarkı adı yaz."
                    : "Müziği DJ yetkisi olanlar başlatır."}
              </span>
            </span>
            {isDj && nowPlaying ? (
              <span className="ct-music-transport">
                <IconButton
                  label={state.paused ? "Devam et" : "Duraklat"}
                  icon={state.paused ? "play" : "pause"}
                  disabled={isSending}
                  onClick={() => runCommand(state.paused ? "resume" : "pause")}
                />
                <IconButton
                  label="Sonraki parça"
                  icon="skip"
                  disabled={isSending}
                  onClick={() => runCommand("skip")}
                />
                <IconButton
                  label="Durdur ve botu odadan çıkar"
                  icon="stop"
                  danger
                  disabled={isSending}
                  onClick={() => runCommand("stop")}
                />
              </span>
            ) : null}
          </div>

          {nowPlaying ? (
            <div className="ct-music-progress-row">
              <span className="ct-music-time">{formatMusicDuration(position)}</span>
              <span className="ct-music-progress">
                <span
                  className="ct-music-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </span>
              <span className="ct-music-time">
                {formatMusicDuration(nowPlaying.durationSeconds)}
              </span>
            </div>
          ) : null}

          {health ? (
            <p className={`ct-music-diagnostics${health.ok ? " ok" : ""}`}>
              <span aria-hidden="true" />
              {health.text}
            </p>
          ) : null}
        </section>

        {isDj ? (
          <div className="ct-field">
            <label htmlFor="ct-music-query">Ne çalınsın?</label>
            <div className="ct-music-composer">
              <span className="ct-music-query">
                <MenuIcon name="search" />
                <input
                  id="ct-music-query"
                  type="text"
                  value={draft}
                  // Not disabled while a command is out: a disabled box drops
                  // its focus, and the next song is typed into nothing.
                  placeholder="YouTube bağlantısı ya da şarkı adı"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      enqueueDraft();
                    }
                  }}
                  maxLength={320}
                  autoFocus
                  aria-describedby="ct-music-feedback"
                />
              </span>
              <button
                type="button"
                className="ct-music-add"
                disabled={draft.trim() === "" || isSending}
                onClick={enqueueDraft}
              >
                {pendingQuery !== null ? "Ekleniyor…" : nowPlaying ? "Sıraya ekle" : "Çal"}
              </button>
            </div>
            <div id="ct-music-feedback" className="ct-music-feedback">
              {feedback}
            </div>
          </div>
        ) : (
          <p className="ct-music-note">
            <MenuIcon name="alert" size={14} />
            Müziği DJ yetkisi olanlar yönetir; yetkiyi yöneticiler verir. Çalanı
            dinleyebilir ve kendi ses seviyeni ayarlayabilirsin.
          </p>
        )}

        <section className="ct-music-section" aria-label="Sıradakiler">
          <div className="ct-music-section-head">
            <h3>
              Sırada
              <span>{state.queue.length}</span>
            </h3>
            {isDj && state.queue.length > 0 ? (
              <button
                type="button"
                className="ct-music-text-btn"
                disabled={isSending}
                onClick={() => runCommand("clear")}
              >
                <MenuIcon name="listX" size={14} />
                Sırayı temizle
              </button>
            ) : null}
          </div>
          {state.queue.length > 0 ? (
            <ol className="ct-music-queue">
              {state.queue.map((track, index) => (
                <li key={`${track.id}-${index}`} className="ct-music-queue-row">
                  <span className="ct-music-queue-index">{index + 1}</span>
                  <span className="ct-music-queue-text">
                    <span className="ct-music-queue-title" title={track.title}>
                      {track.title}
                    </span>
                    <span className="ct-music-queue-meta">
                      {formatMusicDuration(track.durationSeconds)} · {track.requestedByName}
                    </span>
                  </span>
                  {isDj ? (
                    <IconButton
                      label="Sıradan çıkar"
                      icon="x"
                      disabled={isSending}
                      onClick={() => runCommand(`remove ${index + 1}`)}
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="ct-music-empty">
              Sırada parça yok. Çalarken eklediklerin buraya dizilir.
            </p>
          )}
        </section>

        <div className="ct-music-volume">
          <label htmlFor="ct-music-volume">
            Sende ses seviyesi
            <span>%{volumePercent}</span>
          </label>
          <VolumeSlider
            id="ct-music-volume"
            value={volumePercent}
            onChange={onVolumeChange}
          />
          <small className="ct-field-hint">Yalnız seni etkiler; odadakiler kendi ayarını duyar.</small>
        </div>

        {state.log.length > 0 ? (
          <details className="ct-music-history">
            <summary>Komut geçmişi</summary>
            <div className="ct-music-log">
              {state.log.map((line, index) => (
                <p key={`${line.at}-${index}`} className={logToneClass(line)}>
                  {line.text}
                </p>
              ))}
              <div ref={logEndRef} />
            </div>
          </details>
        ) : null}
      </div>
    </Modal>
  );
}

export default MusicModal;
