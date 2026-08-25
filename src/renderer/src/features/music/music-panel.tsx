import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Slider, Tooltip } from "antd";
import type { InputRef } from "antd";
import {
  CustomerServiceOutlined,
  DeleteOutlined,
  DownOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SendOutlined,
  SoundOutlined,
  StepForwardOutlined,
  StopOutlined,
  UpOutlined,
} from "@ant-design/icons";
import {
  MUSIC_COMMAND_PREFIX,
  formatMusicDuration,
  type MusicLogLine,
} from "@shared/music";
import { useMusicRoom } from "./use-music-room";

interface MusicPanelProps {
  lobbyId: string | null;
  volumePercent: number;
  onVolumeChange: (volumePercent: number) => void;
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

export function MusicPanel({
  lobbyId,
  volumePercent,
  onVolumeChange,
}: MusicPanelProps): JSX.Element | null {
  const { state, isDj, available, isSending, lastReply, lastError, send } =
    useMusicRoom(lobbyId);

  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [tick, setTick] = useState(0);
  const inputRef = useRef<InputRef>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const playing = state.nowPlaying !== null && !state.paused;

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing, state.revision]);

  useEffect(() => {
    setTick(0);
  }, [state.revision]);

  useEffect(() => {
    if (expanded) {
      logEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [expanded, state.log.length]);

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

  const submitDraft = (): void => {
    const trimmed = draft.trim();
    if (trimmed === "" || isSending) {
      return;
    }
    setDraft("");
    void send(trimmed).then(() => inputRef.current?.focus());
  };

  const headline = state.nowPlaying
    ? state.nowPlaying.title
    : state.queue.length > 0
      ? `${state.queue.length} parça sırada`
      : "Müzik botu boşta";

  return (
    <section className="ct-music-panel">
      <header className="ct-music-header">
        <CustomerServiceOutlined className="ct-music-header-icon" />
        <div className="ct-music-headline">
          <span className="ct-music-title" title={headline}>
            {headline}
          </span>
          {state.nowPlaying ? (
            <span className="ct-music-subtitle">
              {formatMusicDuration(position)} /{" "}
              {formatMusicDuration(state.nowPlaying.durationSeconds)} ·{" "}
              {state.nowPlaying.requestedByName}
            </span>
          ) : (
            <span className="ct-music-subtitle">
              {isDj ? `${MUSIC_COMMAND_PREFIX}play ile başlat` : "yetkin yok"}
            </span>
          )}
        </div>
        <Button
          type="text"
          size="small"
          aria-label={expanded ? "Müzik panelini kapat" : "Müzik panelini aç"}
          icon={expanded ? <UpOutlined /> : <DownOutlined />}
          onClick={() => setExpanded((value) => !value)}
        />
      </header>

      {state.nowPlaying ? (
        <div className="ct-music-progress">
          <span className="ct-music-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      ) : null}

      {expanded ? (
        <div className="ct-music-body">
          <div className="ct-music-controls">
            <Tooltip title={state.paused ? "Devam et" : "Duraklat"}>
              <Button
                type="text"
                size="small"
                disabled={!isDj || !state.nowPlaying || isSending}
                icon={state.paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                onClick={() => runCommand(state.paused ? "!resume" : "!pause")}
              />
            </Tooltip>
            <Tooltip title="Sonraki">
              <Button
                type="text"
                size="small"
                disabled={!isDj || !state.nowPlaying || isSending}
                icon={<StepForwardOutlined />}
                onClick={() => runCommand("!skip")}
              />
            </Tooltip>
            <Tooltip title="Durdur ve kuyruğu boşalt">
              <Button
                type="text"
                size="small"
                danger
                disabled={!isDj || isSending}
                icon={<StopOutlined />}
                onClick={() => runCommand("!stop")}
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
                tooltip={{ formatter: (value) => `${value ?? 0}%` }}
              />
            </span>
          </div>

          {state.queue.length > 0 ? (
            <ol className="ct-music-queue">
              {state.queue.map((track, index) => (
                <li key={`${track.id}-${index}`} className="ct-music-queue-row">
                  <span className="ct-music-queue-index">{index + 1}</span>
                  <span className="ct-music-queue-title" title={track.title}>
                    {track.title}
                  </span>
                  <span className="ct-music-queue-meta">
                    {formatMusicDuration(track.durationSeconds)} · {track.requestedByName}
                  </span>
                  {isDj ? (
                    <Button
                      type="text"
                      size="small"
                      aria-label="Kuyruktan çıkar"
                      icon={<DeleteOutlined />}
                      disabled={isSending}
                      onClick={() => runCommand(`!remove ${index + 1}`)}
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

          {lastError ? <p className="ct-music-feedback error">{lastError}</p> : null}
          {!lastError && lastReply ? (
            <p className="ct-music-feedback">{lastReply}</p>
          ) : null}

          <div className="ct-music-composer">
            <Input
              ref={inputRef}
              size="small"
              value={draft}
              disabled={isSending}
              placeholder={
                isDj
                  ? `${MUSIC_COMMAND_PREFIX}play bağlantı veya arama`
                  : `${MUSIC_COMMAND_PREFIX}help`
              }
              onChange={(event) => setDraft(event.target.value)}
              onPressEnter={submitDraft}
              maxLength={320}
            />
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={isSending}
              disabled={draft.trim() === ""}
              onClick={submitDraft}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default MusicPanel;
