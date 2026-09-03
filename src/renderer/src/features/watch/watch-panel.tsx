import { useCallback, useState } from "react";
import type { WatchRoom } from "./use-watch-room";

interface WatchPanelProps {
  room: WatchRoom;
  /** Closes the dialog. Called on its own once a video has started. */
  onClose?: () => void;
}

/**
 * The dialog, and nothing else: paste a link, start it, get out of the way.
 *
 * The video itself does NOT live here. It plays on the lobby stage, as its own
 * tile, for as long as the room is watching — so this closes the moment a
 * session starts and the session outlives it. The room state is owned by the
 * lobby panel above for exactly that reason: a dialog that owned it would take
 * the video down with it every time somebody dismissed the window.
 */
export function WatchPanel({ room, onClose }: WatchPanelProps): JSX.Element {
  const [link, setLink] = useState("");
  const { state, canStart, isSending, lastError } = room;

  const submitLink = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = link.trim();
      if (!trimmed) {
        return;
      }
      if (await room.start(trimmed)) {
        setLink("");
        onClose?.();
      }
    },
    [link, room, onClose],
  );

  return (
    <section className="watch-panel">
      <header className="watch-panel__header">
        <h3 className="watch-panel__title">Birlikte İzle</h3>
      </header>

      {canStart ? (
        <>
          <p className="watch-panel__hint">
            Bağlantıyı yapıştır. Video sahnede bir yayın kutucuğu olarak herkese
            çıkar; izlemek isteyen kutucuktan açar. Oynatma, duraklatma ve ileri
            sarma sende — herkes aynı yerden izler.
          </p>
          <form onSubmit={submitLink} className="watch-panel__form">
            <input
              type="text"
              value={link}
              autoFocus
              placeholder="Bağlantı yapıştır (YouTube ya da dizi sitesi)"
              onChange={(event) => setLink(event.target.value)}
            />
            <button type="submit" disabled={isSending || !link.trim()}>
              {state.active ? "Değiştir" : "Başlat"}
            </button>
          </form>
          {state.active && state.video ? (
            <p className="watch-panel__playing">
              Şu an lobide: {state.video.title || "video"} — yeni bağlantı bunun yerine geçer.
            </p>
          ) : null}
        </>
      ) : (
        // Opening a video needs no permission, so the only way to be refused
        // here is that somebody else already has the room.
        <p className="watch-panel__empty">
          {state.video?.startedByName
            ? `${state.video.startedByName} bir yayın açtı. Önce onun bitmesi gerekiyor.`
            : "Bu odada başkasının açtığı bir yayın var."}
        </p>
      )}

      {lastError ? <p className="watch-panel__error">{lastError}</p> : null}
    </section>
  );
}
