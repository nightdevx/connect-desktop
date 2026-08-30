import { useCallback, useEffect, useRef, useState } from "react";
import { formatWatchTime, livePosition } from "@shared/watch";
import { useWatchRoom } from "./use-watch-room";
import { WatchPlayer } from "./watch-player";

interface WatchPanelProps {
  lobbyId: string | null;
  /** Closes the panel. Per viewer: see the note on `open` in the lobby panel. */
  onClose?: () => void;
}

export function WatchPanel({ lobbyId, onClose }: WatchPanelProps): JSX.Element | null {
  const room = useWatchRoom(lobbyId);
  const [link, setLink] = useState("");
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(70);
  // Redrawn once a second so the elapsed time and the scrub bar move; the
  // position itself is computed, never stored.
  const [, setTick] = useState(0);
  const scrubbingRef = useRef(false);
  const [scrubValue, setScrubValue] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { state, canControl, isSending, lastError } = room;
  const video = state.video;
  const duration = video?.durationSeconds ?? 0;
  const position = scrubbingRef.current ? scrubValue : livePosition(state, room.skewMs);

  const submitLink = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = link.trim();
      if (!trimmed) {
        return;
      }
      if (await room.start(trimmed)) {
        setLink("");
      }
    },
    [link, room],
  );

  if (!lobbyId) {
    return null;
  }

  return (
    <section className="watch-panel">
      <header className="watch-panel__header">
        <h3 className="watch-panel__title">Birlikte İzle</h3>
        {onClose ? (
          <button type="button" className="watch-panel__close" onClick={onClose}>
            Kapat
          </button>
        ) : null}
      </header>

      {state.active && video ? (
        <>
          <WatchPlayer room={room} muted={muted} volume={volume} />

          <div className="watch-panel__meta">
            <span className="watch-panel__video-title">
              {video.title || "Video yükleniyor…"}
            </span>
            <span className="watch-panel__started-by">
              {video.startedByName} başlattı
            </span>
          </div>

          <div className="watch-panel__controls">
            <button
              type="button"
              disabled={!canControl || isSending}
              onClick={() =>
                state.playing ? void room.pause(position) : void room.play(position)
              }
              title={canControl ? undefined : "Bu kontrolü kullanma yetkin yok"}
            >
              {state.playing ? "Duraklat" : "Oynat"}
            </button>

            <span className="watch-panel__time">
              {formatWatchTime(position)}
              {duration > 0 ? ` / ${formatWatchTime(duration)}` : ""}
            </span>

            <input
              type="range"
              className="watch-panel__scrub"
              min={0}
              max={duration > 0 ? duration : 1}
              step={1}
              value={Math.min(position, duration > 0 ? duration : 1)}
              disabled={!canControl || duration <= 0}
              onPointerDown={() => {
                scrubbingRef.current = true;
              }}
              onChange={(event) => setScrubValue(Number(event.target.value))}
              onPointerUp={() => {
                scrubbingRef.current = false;
                void room.seek(scrubValue);
              }}
            />

            {canControl ? (
              <button type="button" disabled={isSending} onClick={() => void room.stop()}>
                Bitir
              </button>
            ) : null}
          </div>

          {/* Volume is this viewer's alone; it never reaches the server. */}
          <div className="watch-panel__volume">
            <button type="button" onClick={() => setMuted((value) => !value)}>
              {muted ? "Sesi aç" : "Sustur"}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </div>
        </>
      ) : (
        <div className="watch-panel__empty">
          {canControl ? (
            <form onSubmit={submitLink} className="watch-panel__form">
              <input
                type="text"
                value={link}
                placeholder="Bağlantı yapıştır (YouTube ya da dizi sitesi)"
                onChange={(event) => setLink(event.target.value)}
              />
              <button type="submit" disabled={isSending || !link.trim()}>
                Başlat
              </button>
            </form>
          ) : (
            <p>Odada şu an izlenen bir video yok.</p>
          )}
        </div>
      )}

      {lastError ? <p className="watch-panel__error">{lastError}</p> : null}
    </section>
  );
}
