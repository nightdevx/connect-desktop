import { useState, type JSX } from "react";
import { Button, Modal } from "antd";
import type { Guild } from "@shared/guild-contracts";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import { MenuIcon } from "@/ui/odak-menu";
import "@/styles/modules/features/odak-pencereler.css";
import { ROLE_LABELS, guildPermissions } from "../guild-logic";
import { callGuild } from "../guild-service";
import { useGuildUi } from "../guild-store";
import { useGuildList } from "../use-guilds";
import { GuildConfirm, type GuildConfirmRequest } from "./guild-confirm";
import { GuildIcon } from "./guild-icon";
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

function SettingsModal({
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
  // A role lost while open takes its tabs with it.
  const tab = tabs.some((entry) => entry.id === picked) ? picked : "general";
  const [draft, setDraft] = useState<GeneralDraft>(() => draftOf(guild));
  const { write, busy } = useGuildWrite(guild.id);
  const patch = patchOf(guild, draft);
  const changes = Object.keys(patch).length;
  const editing = tab === "general" && can.edit;
  const Panel = PANELS[tab];

  const save = () =>
    void write("save", () => callGuild("update", { guildId: guild.id, ...patch }), "Ayarlar kaydedildi").catch(() => undefined);

  const footer = editing
    ? [
        <span key="status" className={`ct-room-footer-status${changes > 0 ? " dirty" : ""}`}>
          {!draft.name.trim() ? "Sunucu adı boş olamaz" : changes > 0 ? `${changes} değişiklik kaydedilmedi` : "Değişiklik yok"}
        </span>,
        <Button key="cancel" onClick={onClose}>
          Vazgeç
        </Button>,
        <Button key="save" type="primary" disabled={changes === 0 || !draft.name.trim()} loading={busy === "save"} onClick={save}>
          Kaydet
        </Button>,
      ]
    : [
        <Button key="close" onClick={onClose}>
          Kapat
        </Button>,
      ];

  return (
    <Modal
      rootClassName="ct-modal"
      open
      onCancel={onClose}
      width={MODAL_WIDTH.l}
      title={<ModalHeading icon={<MenuIcon name="sliders" size={19} />} title="Sunucu ayarları" />}
      footer={footer}
    >
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
              id={`ct-guild-tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls={`ct-guild-panel-${entry.id}`}
              className={`ct-room-tab${tab === entry.id ? " active" : ""}`}
              onClick={() => setPicked(entry.id)}
            >
              {entry.label}
              {entry.id === "requests" && guild.pendingRequests > 0 && (
                <span className="ct-odak-count ct-guild-tab-count">{guild.pendingRequests}</span>
              )}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`ct-guild-panel-${tab}`} aria-labelledby={`ct-guild-tab-${tab}`}>
          <Panel
            guild={guild}
            currentUserId={currentUserId}
            accountRole={accountRole}
            confirm={confirm}
            draft={draft}
            onDraft={setDraft}
            busy={busy !== null}
          />
        </div>
      </div>
    </Modal>
  );
}

/**
 * Sunucu ayarları: what the user's role allows, one tab each. Genel carries
 * the name, icon, description and join mode for admins, saved from the
 * footer as in Oda ayarları, and at its foot the way out: delete or hand over
 * for the owner, leave for everyone else.
 */
export function GuildSettingsDialog({ currentUserId, accountRole }: { currentUserId: string; accountRole: string }) {
  const dialog = useGuildUi((state) => state.dialog);
  const closeDialog = useGuildUi((state) => state.closeDialog);
  const guildId = dialog?.kind === "settings" ? dialog.guildId : null;
  const guild = useGuildList().data?.guilds.find((entry) => entry.id === guildId) ?? null;
  const [confirm, setConfirm] = useState<GuildConfirmRequest | null>(null);

  return (
    <>
      {/* Mounted per server, so each opening starts from that server's values;
          gone with the server (deleted, left) while open. */}
      {guild && (
        <SettingsModal
          key={guild.id}
          guild={guild}
          currentUserId={currentUserId}
          accountRole={accountRole}
          onClose={closeDialog}
          confirm={setConfirm}
        />
      )}
      <GuildConfirm request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
