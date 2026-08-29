import { Modal } from "antd";
import { WatchPanel } from "./watch-panel";

interface WatchModalProps {
  lobbyId: string | null;
  /**
   * Whether THIS viewer has the window open.
   *
   * Per viewer on purpose, and the whole reason the session state lives on the
   * server rather than in the window: closing this does not stop the room's
   * video any more than closing somebody's screen share stops them sharing. The
   * session keeps running, the position keeps advancing, and reopening lands
   * wherever the room has got to.
   */
  open: boolean;
  onClose: () => void;
}

export function WatchModal({ lobbyId, open, onClose }: WatchModalProps): JSX.Element {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      // Kept mounted so the player is not torn down and rebuilt — and the video
      // not reloaded from scratch — every time somebody glances away. Only after
      // it has been opened once: an unopened dialog costs nothing.
      destroyOnClose={false}
      forceRender={false}
      title={null}
      className="ct-watch-modal"
    >
      <WatchPanel lobbyId={lobbyId} onClose={onClose} />
    </Modal>
  );
}
