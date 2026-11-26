import type { GuildJoinMode } from "@shared/guild-contracts";
import { JOIN_MODE_LABELS } from "../guild-logic";

const MODES: GuildJoinMode[] = ["invite", "request", "public"];

/** Who may join: three choices, each saying what it does. */
export function JoinModeField({
  value,
  onChange,
  disabled,
}: {
  value: GuildJoinMode;
  onChange: (mode: GuildJoinMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="ct-guild-modes" disabled={disabled}>
      <legend className="ct-field-label">Kimler katılabilir</legend>
      {MODES.map((mode) => (
        <label key={mode} className={`ct-guild-mode${value === mode ? " active" : ""}`}>
          <input
            type="radio"
            name="guild-join-mode"
            value={mode}
            checked={value === mode}
            onChange={() => onChange(mode)}
          />
          <span className="ct-guild-mode-text">
            <strong>{JOIN_MODE_LABELS[mode].label}</strong>
            <span>{JOIN_MODE_LABELS[mode].hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
