import type { LevelReward, RunSummary } from "../../../gunline";
import { GameButton, Stars } from "./shell";

interface ResultProps {
  summary: RunSummary;
  reward: LevelReward;
  medals: string[];
  isRecord: boolean;
  onRetry: () => void;
  onNext: (() => void) | null;
  onExit: () => void;
}

export function GunlineResult({
  summary,
  reward,
  medals,
  isRecord,
  onRetry,
  onNext,
  onExit,
}: ResultProps) {
  return (
    <div
      className="ct-gl-result"
      data-tone={summary.won ? "won" : "lost"}
      role="status"
      aria-live="polite"
    >
      <div className="ct-gl-result-card">
        <span className="ct-gl-result-title">
          {summary.won ? "GÖREV TAMAM" : "HAT DÜŞTÜ"}
        </span>
        {isRecord ? <span className="ct-gl-result-record">YENİ REKOR</span> : null}

        <div className="ct-gl-result-stars">
          <Stars filled={summary.stars} size="lg" />
        </div>

        <div className="ct-gl-result-grid">
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Puan</span>
            <span className="ct-gl-stat-value">{summary.score}</span>
          </span>
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Vuruş</span>
            <span className="ct-gl-stat-value">{summary.kills}</span>
          </span>
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Sızma</span>
            <span className="ct-gl-stat-value">{summary.leaks}</span>
          </span>
          <span className="ct-gl-stat">
            <span className="ct-gl-stat-label">Süre</span>
            <span className="ct-gl-stat-value">{summary.seconds}s</span>
          </span>
        </div>

        {summary.won ? (
          <div className="ct-gl-rewards">
            <span className="ct-gl-reward">Erzak +{reward.supplies}</span>
            <span className="ct-gl-reward">Mühimmat +{reward.ammo}</span>
            <span className="ct-gl-reward">Künye +{reward.credits}</span>
            <span className="ct-gl-reward">XP +{reward.xp}</span>
          </div>
        ) : null}

        {medals.length > 0 ? (
          <span className="ct-gl-result-medals">Yeni madalya: {medals.join(", ")}</span>
        ) : null}

        <div className="ct-gl-result-actions">
          {onNext ? (
            <GameButton tone="primary" wide onClick={onNext}>
              Sonraki bölüm
            </GameButton>
          ) : null}
          <GameButton tone="ghost" wide onClick={onRetry}>
            Tekrar
          </GameButton>
          <GameButton tone="ghost" wide onClick={onExit}>
            Haritaya dön
          </GameButton>
        </div>
      </div>
    </div>
  );
}
