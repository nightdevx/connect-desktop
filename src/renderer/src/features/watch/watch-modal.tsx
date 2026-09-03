import { Modal } from "antd";
import type { WatchRoom } from "./use-watch-room";
import { WatchPanel } from "./watch-panel";

interface WatchModalProps {
  room: WatchRoom;
  /**
   * Whether THIS viewer has the window open.
   *
   * Per viewer on purpose, and unrelated to whether the room is watching
   * anything: this dialog only starts a video. Once one is running it plays on
   * the lobby stage for everybody, and closing this window has no more effect on
   * it than closing a screen-share preview stops somebody sharing.
   */
  open: boolean;
  onClose: () => void;
}

export function WatchModal({ room, open, onClose }: WatchModalProps): JSX.Element {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnClose={false}
      forceRender={false}
      title={null}
      className="ct-watch-modal"
    >
      <WatchPanel room={room} onClose={onClose} />
    </Modal>
  );
}
