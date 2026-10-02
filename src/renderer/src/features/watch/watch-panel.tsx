import { useCallback, useState } from "react";
import { Button, Input } from "antd";
import { CaretRightFilled, PlayCircleOutlined } from "@ant-design/icons";
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
 *
 * The heading and the "how this works" line belong to the modal around it
 * (watch-modal.tsx), like every other dialog's.
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
    <section className="ct-watch-panel">
      {canStart ? (
        <>
          {state.active && state.video ? (
            <p className="ct-modal-note">
              <PlayCircleOutlined />
              <span>
                Şu an lobide: <b>{state.video.title || "video"}</b>. Yeni bağlantı
                bunun yerine geçer.
              </span>
            </p>
          ) : null}

          <form onSubmit={submitLink} className="ct-watch-form">
            <Input
              value={link}
              autoFocus
              placeholder="Bağlantı yapıştır (YouTube ya da dizi sitesi)"
              onChange={(event) => setLink(event.target.value)}
            />
            <Button
              type="primary"
              htmlType="submit"
              icon={<CaretRightFilled />}
              loading={isSending}
              disabled={!link.trim()}
            >
              {state.active ? "Değiştir" : "Başlat"}
            </Button>
          </form>
        </>
      ) : (
        // Opening a video needs no permission, so the only way to be refused
        // here is that somebody else already has the room.
        <p className="ct-watch-empty">
          {state.video?.startedByName
            ? `${state.video.startedByName} bir yayın açtı. Önce onun bitmesi gerekiyor.`
            : "Bu odada başkasının açtığı bir yayın var."}
        </p>
      )}

      {lastError ? <p className="ct-form-error">{lastError}</p> : null}
    </section>
  );
}
