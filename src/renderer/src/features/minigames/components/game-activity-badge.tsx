import { EyeOutlined } from "@ant-design/icons";
import { findMinigame } from "../minigames-catalog";
import type { GameActivity } from "../use-game-activity";
import type { MinigameId } from "@/store/minigame-scores";

interface GameActivityBadgeProps {
  activity: GameActivity | undefined;
  variant?: "chip" | "text";
}

export function gameActivityLabel(activity: GameActivity): string {
  const label = findMinigame(activity.game as MinigameId).label;
  return activity.role === "playing" ? `${label} oynuyor` : `${label} izliyor`;
}

export function GameActivityBadge({
  activity,
  variant = "chip",
}: GameActivityBadgeProps) {
  if (!activity) {
    return null;
  }

  const entry = findMinigame(activity.game as MinigameId);
  const text = gameActivityLabel(activity);

  if (variant === "text") {
    return <span className="ct-game-activity-text">{text}</span>;
  }

  return (
    <span
      className="ct-game-activity-chip"
      data-role={activity.role}
      title={text}
      aria-label={text}
    >
      <span className="ct-game-activity-icon" aria-hidden="true">
        {activity.role === "watching" ? <EyeOutlined /> : entry.icon}
      </span>
      <span className="ct-game-activity-name">{entry.label}</span>
    </span>
  );
}
