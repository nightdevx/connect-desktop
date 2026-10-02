import { Modal } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import { ModalHeading } from "@/ui/modal-heading";
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
      rootClassName="ct-modal"
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnHidden={false}
      forceRender={false}
      title={
        <ModalHeading
          icon={<PlayCircleOutlined />}
          title="Birlikte İzle"
          description={
            room.canStart
              ? "Video sahnede herkese bir kutucuk olarak çıkar; izlemek isteyen kutucuktan açar. Oynatma, duraklatma ve ileri sarma sende — herkes aynı yerden izler."
              : undefined
          }
        />
      }
    >
      <WatchPanel room={room} onClose={onClose} />
    </Modal>
  );
}
