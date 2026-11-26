import { guildInitials } from "../guild-logic";

interface GuildIconProps {
  guild: { name: string; iconDataUrl: string };
  /** Edge in px; the radius follows it. */
  size?: number;
}

/** A server's picture, or its initials on a raised tile. */
export function GuildIcon({ guild, size = 40 }: GuildIconProps) {
  return (
    <span
      className="ct-guild-icon"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), borderRadius: Math.round(size * 0.32) }}
      aria-hidden="true"
    >
      {guild.iconDataUrl ? <img src={guild.iconDataUrl} alt="" draggable={false} /> : guildInitials(guild.name)}
    </span>
  );
}
