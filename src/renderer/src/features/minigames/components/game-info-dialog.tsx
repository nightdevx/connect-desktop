import { Button, Modal } from "antd";
import type { MinigameEntry } from "../minigames-catalog";
import { rulesOf } from "../minigame-rules";
import { ModalHeading } from "@/ui/modal-heading";

interface GameInfoDialogProps {
  entry: MinigameEntry;
  seats: { min: number; max: number } | null;
  onClose: () => void;
}

// "Nasıl oynanır": the same dialog as every other in the app -- it used to be a
// hand-rolled overlay with its own backdrop, header and close button.
export function GameInfoDialog({ entry, seats, onClose }: GameInfoDialogProps) {
  const rules = rulesOf(entry.id);

  return (
    <Modal
      open
      rootClassName="ct-modal"
      width={520}
      onCancel={onClose}
      title={
        <ModalHeading icon={entry.icon} title={entry.label} description={entry.description} />
      }
      footer={
        <Button type="primary" onClick={onClose}>
          Anladım
        </Button>
      }
    >
      <div className="ct-gameinfo">
        <div className="ct-gameinfo-meta">
          <span className="ct-stat-chip">
            {seats
              ? seats.min === seats.max
                ? `${seats.max} kişi`
                : `${seats.min}-${seats.max} kişi`
              : "Tek kişilik"}
          </span>
          {entry.formatScore ? <span className="ct-stat-chip">Rekor tutulur</span> : null}
        </div>

        <h5 className="ct-gameinfo-subtitle">Nasıl oynanır</h5>
        <ol className="ct-gameinfo-rules">
          {rules.map((rule, index) => (
            <li key={index}>{rule}</li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
