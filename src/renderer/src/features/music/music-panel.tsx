import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Modal, Slider, Tooltip } from "antd";
import type { InputRef } from "antd";
import {
  ClearOutlined,
  CustomerServiceOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SoundOutlined,
  StepForwardOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { formatMusicDuration, type MusicLogLine } from "@shared/music";
import { useMusicRoom } from "./use-music-room";

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

/**
 * The room's music bot.
 *
 * A dialog off the lobby toolbar rather than a strip docked above the chat. The
 * old panel only existed while the chat column was open, was collapsed by
 * default, and kept its transport buttons and its volume slider behind that
 * collapse — so somebody who never opened the chat had no music controls at
 * all, which is most of why "the volume does nothing" was the common report.
 *
 * The commands are still the contract underneath: every button here is
 * shorthand for one somebody could type. Nothing has to be typed, though — a
 * link goes in the box and the buttons do the rest.
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
  const [tick, setTick] = useState(0);
  const inputRef = useRef<InputRef>(null);
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
    // A link OR a search phrase: the resolver decides which it got, so the box
    // needs neither a mode switch nor a typed command prefix.
    void send("play " + trimmed).then(() => inputRef.current?.focus());
  };

  const headline = state.nowPlaying
    ? state.nowPlaying.title
    : state.queue.length > 0
      ? `${state.queue.length} parça sırada`
      : "Şu an bir şey çalmıyor";

  return (
    <Modal
      rootClassName="ct-modal"
      title={
        <span className="ct-modal-title-icon">
          <CustomerServiceOutlined />
          Müzik
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnHidden
    >
      <div className="ct-music-body">
        <section className="ct-music-now">
          <span className="ct-music-title" title={headline}>
            {headline}
          </span>
          <span className="ct-music-subtitle">
            {state.nowPlaying
              ? `${formatMusicDuration(position)} / ${formatMusicDuration(state.nowPlaying.durationSeconds)} · ${state.nowPlaying.requestedByName}`
              : isDj
                ? "Aşağıya bir bağlantı yapıştır."
                : "Müziği yalnızca DJ yetkisi olanlar yönetir."}
          </span>
          <span className="ct-music-progress">
            <span
              className="ct-music-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        </section>

        <div className="ct-music-composer">
          <Input
            ref={inputRef}
            value={draft}
            disabled={isSending || !isDj}
            placeholder="YouTube bağlantısı veya şarkı adı"
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={enqueueDraft}
            maxLength={320}
            allowClear
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={isSending}
            disabled={draft.trim() === "" || !isDj}
            onClick={enqueueDraft}
          >
            Sıraya Ekle
          </Button>
        </div>

        <div className="ct-music-controls">
          <Tooltip title={state.paused ? "Devam et" : "Duraklat"}>
            <Button
              disabled={!isDj || !state.nowPlaying || isSending}
              icon={
                state.paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />
              }
              onClick={() => runCommand(state.paused ? "resume" : "pause")}
            />
          </Tooltip>
          <Tooltip title="Sonraki parça">
            <Button
              disabled={!isDj || !state.nowPlaying || isSending}
              icon={<StepForwardOutlined />}
              onClick={() => runCommand("skip")}
            />
          </Tooltip>
          <Tooltip title="Kuyruğu temizle">
            <Button
              disabled={!isDj || state.queue.length === 0 || isSending}
              icon={<ClearOutlined />}
              onClick={() => runCommand("clear")}
            />
          </Tooltip>
          <Tooltip title="Durdur ve botu odadan çıkar">
            <Button
              danger
              disabled={!isDj || isSending}
              icon={<StopOutlined />}
              onClick={() => runCommand("stop")}
            />
          </Tooltip>

          <span className="ct-music-volume">
            <SoundOutlined />
            <Slider
              min={0}
              max={200}
              step={5}
              value={volumePercent}
              onChange={onVolumeChange}
              tooltip={{ formatter: (value) => `%${value ?? 0}` }}
            />
          </span>
        </div>

        {state.connected && diagnostics ? (
          <p className="ct-music-diagnostics">
            {!diagnostics.seen
              ? "Bot bu istemcide görünmüyor — ses odaya ulaşmıyor."
              : !diagnostics.publishing
                ? "Bot görünüyor ama ses yayını yok."
                : diagnostics.muted
                  ? "Bot yayını susturulmuş görünüyor."
                  : !diagnostics.subscribed
                    ? "Bot yayınlıyor ama bu istemci abone değil."
                    : `Ses alınıyor · %${volumePercent}`}
          </p>
        ) : null}

        {state.queue.length > 0 ? (
          <ol className="ct-music-queue">
            {state.queue.map((track, index) => (
              <li key={`${track.id}-${index}`} className="ct-music-queue-row">
                <span className="ct-music-queue-index">{index + 1}</span>
                <span className="ct-music-queue-title" title={track.title}>
                  {track.title}
                </span>
                <span className="ct-music-queue-meta">
                  {formatMusicDuration(track.durationSeconds)} ·{" "}
                  {track.requestedByName}
                </span>
                {isDj ? (
                  <Button
                    type="text"
                    size="small"
                    aria-label="Kuyruktan çıkar"
                    icon={<DeleteOutlined />}
                    disabled={isSending}
                    onClick={() => runCommand(`remove ${index + 1}`)}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="ct-music-empty">Kuyruk boş.</p>
        )}

        <div className="ct-music-log">
          {state.log.map((line, index) => (
            <p key={`${line.at}-${index}`} className={logToneClass(line)}>
              {line.text}
            </p>
          ))}
          <div ref={logEndRef} />
        </div>

        {lastError ? (
          <p className="ct-music-feedback error">{lastError}</p>
        ) : null}
        {!lastError && lastReply ? (
          <p className="ct-music-feedback">{lastReply}</p>
        ) : null}
      </div>
    </Modal>
  );
}

export default MusicModal;
