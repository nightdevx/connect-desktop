import { useState, type JSX } from "react";
import { Button, Modal } from "antd";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { MenuIcon } from "@/ui/odak-menu";
import "@/styles/modules/features/odak-pencereler.css";
import { ROLE_LABELS, guildPermissions } from "../guild-logic";
import { useGuildUi } from "../guild-store";
import { useGuildList } from "../use-guilds";
import { GuildConfirm, type GuildConfirmRequest } from "./guild-confirm";
import { GuildIcon } from "./guild-icon";
import { BansPanel, GeneralPanel, InvitesPanel, MembersPanel, RequestsPanel, type PanelProps } from "./guild-settings-panels";

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

/**
 * Sunucu ayarları: what the user's role allows, one tab each. Genel carries
 * the name, icon, description and join mode for admins, and at its foot the
 * way out: delete or hand over for the owner, leave for everyone else.
 */
export function GuildSettingsDialog({ currentUserId, accountRole }: { currentUserId: string; accountRole: string }) {
  const dialog = useGuildUi((state) => state.dialog);
  const closeDialog = useGuildUi((state) => state.closeDialog);
  const guildId = dialog?.kind === "settings" ? dialog.guildId : null;
  const guild = useGuildList().data?.guilds.find((entry) => entry.id === guildId) ?? null;
  const [tab, setTab] = useState<Tab>("general");
  const [confirm, setConfirm] = useState<GuildConfirmRequest | null>(null);
  const close = (): void => {
    closeDialog();
    setTab("general");
  };

  const can = guild ? guildPermissions(guild, accountRole) : null;
  const tabs = TABS.filter((entry) => !entry.moderators || can?.moderate);
  const Panel = PANELS[tab];

  return (
    <>
      <Modal
        rootClassName="ct-modal"
        // Shuts on its own when the server goes away under it (deleted, left).
        open={guild !== null}
        onCancel={close}
        width={MODAL_WIDTH.l}
        destroyOnHidden
        title={<ModalHeading icon={<MenuIcon name="sliders" size={19} />} title="Sunucu ayarları" />}
        footer={[
          <Button key="done" onClick={close}>
            Kapat
          </Button>,
        ]}
      >
        {guild && (
          <div className="ct-modal-form ct-room-settings">
            <div className="ct-room-subject">
              <GuildIcon guild={guild} size={34} />
              <span className="ct-room-subject-text">
                <strong>{guild.name}</strong>
                <span>
                  {guild.memberCount} üye · Rolün: {ROLE_LABELS[guild.myRole] ?? "Platform yöneticisi"}
                </span>
              </span>
            </div>
            <div className="ct-room-tabs" role="tablist" aria-label="Sunucu ayarları bölümleri">
              {tabs.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.id}
                  className={`ct-room-tab${tab === entry.id ? " active" : ""}`}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                  {entry.id === "requests" && guild.pendingRequests > 0 && (
                    <span className="ct-odak-count ct-guild-tab-count">{guild.pendingRequests}</span>
                  )}
                </button>
              ))}
            </div>
            <div role="tabpanel" aria-label={tabs.find((entry) => entry.id === tab)?.label}>
              <Panel guild={guild} currentUserId={currentUserId} accountRole={accountRole} confirm={setConfirm} />
            </div>
          </div>
        )}
      </Modal>
      <GuildConfirm request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
