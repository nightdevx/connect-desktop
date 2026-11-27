import { useState } from "react";
import type { Guild } from "@shared/guild-contracts";
import { MenuIcon, OdakMenu } from "@/ui/odak-menu";
import { guildPermissions } from "../guild-logic";
import { callGuild } from "../guild-service";
import { useGuildUi } from "../guild-store";
import { GuildConfirm, type GuildConfirmRequest } from "./guild-confirm";
import { copyCode, leaveRequest, useGuildWrite } from "./guild-settings-panels";

/**
 * The server's name over its room list, opening its menu: a fresh invite
 * code, the settings, leaving.
 */
export function GuildHeaderMenu({ guild, accountRole }: { guild: Guild; accountRole: string }) {
  const openSettings = useGuildUi((state) => state.openSettings);
  const can = guildPermissions(guild, accountRole);
  const { write } = useGuildWrite(guild.id);
  const [confirm, setConfirm] = useState<GuildConfirmRequest | null>(null);

  return (
    <>
      <OdakMenu
        trigger="click"
        placement="bottomLeft"
        width={248}
        items={[
          can.moderate && {
            key: "invite",
            icon: "userPlus",
            label: "Davet kodu oluştur",
            description: "1 gün geçerli, panoya kopyalanır",
            onSelect: () =>
              void write("invite", async () => {
                const { invite } = await callGuild("createInvite", { guildId: guild.id, maxUses: 0, ttlHours: 24 });
                copyCode(invite.code);
              }).catch(() => undefined),
          },
          (can.edit || can.moderate) && {
            key: "settings",
            icon: "sliders",
            label: "Sunucu ayarları",
            onSelect: () => openSettings(guild.id),
          },
          !can.own && can.moderate && { type: "divider", key: "divider" },
          !can.own && {
            key: "leave",
            icon: "logout",
            label: "Sunucudan ayrıl",
            danger: true,
            opensDialog: true,
            onSelect: () => setConfirm(leaveRequest(guild, write)),
          },
        ]}
      >
        <button type="button" className="ct-guild-header" aria-label={`${guild.name}: sunucu menüsü`}>
          <span className="ct-guild-header-name">{guild.name}</span>
          <MenuIcon name="chevron" size={14} />
        </button>
      </OdakMenu>
      <GuildConfirm request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
