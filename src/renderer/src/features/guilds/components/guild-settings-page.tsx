import { useEffect, useState, type JSX } from "react";
import { Button } from "antd";
import type { Guild } from "@shared/guild-contracts";
import { PageHeader } from "@/ui/page-header";
import { MenuIcon } from "@/ui/odak-menu";
import "@/styles/modules/features/odak-pencereler.css";
import { ROLE_LABELS, guildPermissions } from "../guild-logic";
import { callGuild } from "../guild-service";
import { useGuildUi } from "../guild-store";
import { useGuildList } from "../use-guilds";
import { GuildConfirm, type GuildConfirmRequest } from "./guild-confirm";
import {
  BansPanel,
  GeneralPanel,
  InvitesPanel,
  MembersPanel,
  RequestsPanel,
  draftOf,
  patchOf,
  useGuildWrite,
  type GeneralDraft,
  type PanelProps,
} from "./guild-settings-panels";

type Tab = "general" | "invites" | "members" | "requests" | "bans";

const TABS: Array<{ id: Tab; label: string; moderators: boolean }> = [
  { id: "general", label: "Genel", moderators: false },
  { id: "invites", label: "Davetler", moderators: true },
  { id: "members", label: "Üyeler", moderators: true },
  { id: "requests", label: "İstekler", moderators: true },
  { id: "bans", label: "Yasaklar", moderators: true },
];

const PANELS: Record<Tab, (props: PanelProps) => JSX.Element> = {
  general: GeneralPanel,
  invites: InvitesPanel,
  members: MembersPanel,
  requests: RequestsPanel,
  bans: BansPanel,
};

/** Esc leaves the page, unless a dialog or an open dropdown is taking it. */
function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector(".ant-modal-wrap, .ant-select-open, .ant-dropdown:not(.ant-dropdown-hidden)")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function SettingsBody({
  guild,
  currentUserId,
  accountRole,
  onClose,
  confirm,
}: {
  guild: Guild;
  currentUserId: string;
  accountRole: string;
  onClose: () => void;
  confirm: (request: GuildConfirmRequest) => void;
}) {
  const can = guildPermissions(guild, accountRole);
  const tabs = TABS.filter((entry) => !entry.moderators || can.moderate);
  // A moderator who cannot edit has little on Genel: start on Davetler.
  const [picked, setPicked] = useState<Tab>(can.moderate && !can.edit ? "invites" : "general");
  // A role lost while open takes its sections with it.
  const tab = tabs.some((entry) => entry.id === picked) ? picked : "general";
  const [draft, setDraft] = useState<GeneralDraft>(() => draftOf(guild));
  const { write, busy } = useGuildWrite(guild.id);
  const patch = patchOf(guild, draft);
  const changes = Object.keys(patch).length;
  const editing = tab === "general" && can.edit;
  const Panel = PANELS[tab];
  useEscapeToClose(onClose);

  const save = () =>
    void write("save", () => callGuild("update", { guildId: guild.id, ...patch }), "Ayarlar kaydedildi").catch(() => undefined);

  return (
    <>
      <PageHeader
        title="Sunucu ayarları"
        description={`${guild.name} · ${guild.memberCount} üye · Rolün: ${ROLE_LABELS[guild.myRole] ?? "Platform yöneticisi"}`}
        actions={
          <Button onClick={onClose} icon={<MenuIcon name="x" size={15} />}>
            Kapat
          </Button>
        }
      />
      <div className="ct-guild-settings">
        <nav className="ct-guild-settings-nav" role="tablist" aria-orientation="vertical" aria-label="Sunucu ayarları bölümleri">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`ct-guild-tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls={`ct-guild-panel-${entry.id}`}
              className={`ct-guild-settings-link${tab === entry.id ? " active" : ""}`}
              onClick={() => setPicked(entry.id)}
            >
              {entry.label}
              {entry.id === "requests" && guild.pendingRequests > 0 && (
                <span className="ct-odak-count ct-guild-tab-count">{guild.pendingRequests}</span>
              )}
            </button>
          ))}
        </nav>
        <div
          className="ct-guild-settings-body ct-modal-form ct-room-settings"
          role="tabpanel"
          id={`ct-guild-panel-${tab}`}
          aria-labelledby={`ct-guild-tab-${tab}`}
        >
          <Panel
            guild={guild}
            currentUserId={currentUserId}
            accountRole={accountRole}
            confirm={confirm}
            draft={draft}
            onDraft={setDraft}
            busy={busy !== null}
          />
          {editing && (
            <div className="ct-guild-settings-save">
              <span className={`ct-room-footer-status${changes > 0 ? " dirty" : ""}`}>
                {!draft.name.trim() ? "Sunucu adı boş olamaz" : changes > 0 ? `${changes} değişiklik kaydedilmedi` : "Değişiklik yok"}
              </span>
              <Button disabled={changes === 0} onClick={() => setDraft(draftOf(guild))}>
                Vazgeç
              </Button>
              <Button type="primary" disabled={changes === 0 || !draft.name.trim()} loading={busy === "save"} onClick={save}>
                Kaydet
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Sunucu ayarları as a page in the rooms' place: what the user's role
 * allows, one section each in a column on the left, as in Ayarlar. Genel
 * carries the name, icon, description and join mode for admins, saved from
 * the bar under it, and at its foot the way out: delete or hand over for the
 * owner, leave for everyone else.
 */
export function GuildSettingsPage({ currentUserId, accountRole }: { currentUserId: string; accountRole: string }) {
  const guildId = useGuildUi((state) => state.settingsGuildId);
  const closeSettings = useGuildUi((state) => state.closeSettings);
  const list = useGuildList().data;
  const guild = list?.guilds.find((entry) => entry.id === guildId) ?? null;
  const [confirm, setConfirm] = useState<GuildConfirmRequest | null>(null);
  // The server is gone (deleted, left): so is the page.
  const gone = list !== undefined && guildId !== null && guild === null;
  useEffect(() => {
    if (gone) closeSettings();
  }, [gone, closeSettings]);

  return (
    <>
      {/* Mounted per server, so each opening starts from that server's values. */}
      {guild && (
        <SettingsBody
          key={guild.id}
          guild={guild}
          currentUserId={currentUserId}
          accountRole={accountRole}
          onClose={closeSettings}
          confirm={setConfirm}
        />
      )}
      <GuildConfirm request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
