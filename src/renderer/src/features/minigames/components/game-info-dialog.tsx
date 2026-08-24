import { useEffect } from "react";
import { Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import type { MinigameEntry } from "../minigames-catalog";
import { rulesOf } from "../minigame-rules";

interface GameInfoDialogProps {
  entry: MinigameEntry;
  seats: { min: number; max: number } | null;
  onClose: () => void;
}

export function GameInfoDialog({ entry, seats, onClose }: GameInfoDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const rules = rulesOf(entry.id);

  return (
    <div className="ct-gameinfo-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ct-gameinfo"
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.label} nasıl oynanır`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ct-gameinfo-header">
          <span className="ct-gameinfo-icon" aria-hidden="true">
            {entry.icon}
          </span>
          <div className="ct-gameinfo-title">
            <h4>{entry.label}</h4>
            <p>{entry.description}</p>
          </div>
          <button
            type="button"
            className="ct-gameinfo-close"
            onClick={onClose}
            aria-label="Kapat"
          >
            <CloseOutlined />
          </button>
        </header>

        <div className="ct-gameinfo-meta">
          <span className="ct-gameinfo-chip">
            {seats
              ? seats.min === seats.max
                ? `${seats.max} kişi`
                : `${seats.min}-${seats.max} kişi`
              : "Tek kişilik"}
          </span>
          {entry.formatScore ? (
            <span className="ct-gameinfo-chip">Rekor tutulur</span>
          ) : null}
        </div>

        <h5 className="ct-gameinfo-subtitle">Nasıl oynanır</h5>
        <ol className="ct-gameinfo-rules">
          {rules.map((rule, index) => (
            <li key={index}>{rule}</li>
          ))}
        </ol>

        <footer className="ct-gameinfo-footer">
          <Button type="primary" onClick={onClose}>
            Anladım
          </Button>
        </footer>
      </div>
    </div>
  );
}
