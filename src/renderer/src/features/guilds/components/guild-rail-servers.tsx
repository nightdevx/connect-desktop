import { Tooltip } from "antd";
import { MenuIcon, OdakMenu } from "@/ui/odak-menu";
import { useGuildList } from "../use-guilds";
import { useGuildUi } from "../guild-store";
import { GuildIcon } from "./guild-icon";

export interface GuildRailServersProps {
  selectedGuildId: string | null;
  /** The lobbies section is on screen: only then is a server "selected". */
  showingLobbies: boolean;
  /** Servers with a room that has unread messages. */
  unreadGuildIds: ReadonlySet<string>;
  /** The server of the voice room the user is in. */
  voiceGuildId: string | null;
  /** Shows a server: selects it and opens its rooms. */
  onSelect: (guildId: string) => void;
  /** Platform staff: the menu also opens Tüm sunucular. */
  isStaff?: boolean;
}

/**
 * The servers, in the section rail under its tabs: one icon per server (a
 * click opens its rooms), the one on screen marked, a dot for unread rooms,
 * a speaker on the server whose room the user is in, and + for Kur / Katıl /
 * Keşfet. There is no Lobiler tab: a server is the way to its rooms.
 */
export function GuildRailServers({
  selectedGuildId,
  showingLobbies,
  unreadGuildIds,
  voiceGuildId,
  onSelect,
  isStaff = false,
}: GuildRailServersProps) {
  const { data } = useGuildList();
  const discovering = useGuildUi((state) => state.discovering);
  const openDialog = useGuildUi((state) => state.openDialog);
  const openDiscover = useGuildUi((state) => state.openDiscover);
  const browsingAll = useGuildUi((state) => state.browsingAll);
  const openAllGuilds = useGuildUi((state) => state.openAllGuilds);
  const guilds = data?.guilds ?? [];
  const deleted = data?.deleted.length ?? 0;

  return (
    <>
      <span className="ct-guild-divider" role="separator" aria-hidden="true" />
      <ul className="ct-guild-list" aria-label="Sunucular">
        {guilds.map((guild) => {
          const selected = showingLobbies && guild.id === selectedGuildId && !discovering && !browsingAll;
          const unread = unreadGuildIds.has(guild.id);
          const inVoice = guild.id === voiceGuildId;
          const label = [guild.name, unread && "okunmamış mesaj var", inVoice && "sesli odadasın"]
            .filter(Boolean)
            .join(", ");
          return (
            <li key={guild.id} className={`ct-guild-item${selected ? " selected" : ""}${unread ? " unread" : ""}`}>
              <Tooltip title={guild.name} placement="right">
                <button
                  type="button"
                  className="ct-guild-button"
                  aria-label={label}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => onSelect(guild.id)}
                >
                  <GuildIcon guild={guild} />
                  {inVoice && (
                    <span className="ct-guild-voice" aria-hidden="true">
                      <MenuIcon name="volume" size={11} stroke={2.4} />
                    </span>
                  )}
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      <OdakMenu
        trigger="click"
        placement="topLeft"
        width={240}
        items={[
          { key: "create", icon: "plus", label: "Sunucu kur", opensDialog: true, onSelect: () => openDialog({ kind: "create" }) },
          { key: "join", icon: "login", label: "Kodla katıl", opensDialog: true, onSelect: () => openDialog({ kind: "join" }) },
          { key: "discover", icon: "search", label: "Keşfet", onSelect: openDiscover },
          isStaff && { key: "all", icon: "users", label: "Tüm sunucular", onSelect: openAllGuilds },
          deleted > 0 && {
            key: "deleted",
            icon: "clock",
            label: "Silinen sunucular",
            value: String(deleted),
            onSelect: openDiscover,
          },
        ]}
      >
        <Tooltip title="Sunucu ekle" placement="right">
          <button
            type="button"
            className={`ct-guild-add${showingLobbies && (discovering || browsingAll) ? " active" : ""}`}
            aria-label="Sunucu ekle"
          >
            <MenuIcon name="plus" size={20} stroke={2} />
          </button>
        </Tooltip>
      </OdakMenu>
    </>
  );
}
