import type { DifficultyId } from "@/store/minigame-scores";
import { difficultyOptions, type SoloGameId } from "../difficulty";

interface DifficultyPickerProps {
  game: SoloGameId;
  value: DifficultyId;
  onChange: (difficulty: DifficultyId) => void;
}

/**
 * Three buttons, and what each one does to the board.
 *
 * A segmented control rather than a select: there are exactly three, they are
 * ordered, and the whole point is being able to see the other two. The hint
 * under each label ("16x16, 40 mayın") is generated from the rules rather than
 * typed, so a board that is resized cannot leave a lie behind it.
 *
 * Switching difficulty deals a new game — the panel remounts the board on the
 * key — which is the only honest answer: a record is per board, and finishing
 * a 9x9 field that started as a 16x16 one is not a time anybody earned.
 */
export function DifficultyPicker({ game, value, onChange }: DifficultyPickerProps) {
  return (
    <div className="ct-difficulty" role="radiogroup" aria-label="Zorluk">
      {difficultyOptions(game).map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          className="ct-difficulty-option"
          data-active={option.id === value ? "true" : undefined}
          onClick={() => onChange(option.id)}
        >
          <span className="ct-difficulty-label">{option.label}</span>
          <span className="ct-difficulty-hint">{option.hint}</span>
        </button>
      ))}
    </div>
  );
}
