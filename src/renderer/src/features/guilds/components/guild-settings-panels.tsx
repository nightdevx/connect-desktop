import { useRef, useState, type ReactNode } from "react";
import { Button, Input, Select } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Guild, GuildJoinMode, GuildRole } from "@shared/guild-contracts";
import { MenuIcon } from "@/ui/odak-menu";
import { toast } from "@/services/toast";
import { ROLE_LABELS, guildPermissions, outranks } from "../guild-logic";
import { callGuild, errorText } from "../guild-service";
import { useRefreshGuilds } from "../use-guilds";
import type { GuildConfirmRequest } from "./guild-confirm";
import { GuildIconPicker } from "./guild-icon-picker";
import { JoinModeField } from "./join-mode-field";

export interface PanelProps {
  guild: Guild;
  currentUserId: string;
  accountRole: string;
  confirm: (request: GuildConfirmRequest) => void;
}

const when = (iso?: string): string =>
  iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) : "";

/** A /guilds list for this server, cached per server. */
const useGuildPart = <K extends "members" | "invites" | "bans" | "requests">(guildId: string, part: K) =>
  useQuery({
    queryKey: ["guild", guildId, part],
    queryFn: () => callGuild(part, { guildId }),
    staleTime: 10_000,
  });

/** A write, then the lists and the server list refetched; a failure is a toast. */
const useGuildWrite = (guildId: string) => {
  const queryClient = useQueryClient();
  const refresh = useRefreshGuilds();
  const [busy, setBusy] = useState<string | null>(null);
  const write = async (key: string, action: () => Promise<unknown>, done?: string): Promise<void> => {
    setBusy(key);
    try {
      await action();
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["guild", guildId] }), refresh()]);
      if (done) toast.success(done);
    } catch (failure) {
      toast.error(errorText(failure));
      throw failure;
    } finally {
      setBusy(null);
    }
  };
  return { write, busy };
};

function Section({ title, danger, children }: { title: string; danger?: boolean; children: ReactNode }) {
  return (
    <section className={`ct-room-section${danger ? " danger" : ""}`} aria-label={title}>
      <h3 className="ct-room-section-title">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="ct-guild-home-note">{children}</p>;
}

function PersonRow({ name, detail, children }: { name: string; detail: string; children?: ReactNode }) {
  return (
    <li className="ct-guild-row">
      <span className="ct-guild-row-text">
        <strong>@{name}</strong>
        <span>{detail}</span>
      </span>
      {children && <span className="ct-guild-row-actions">{children}</span>}
    </li>
  );
}

// --- Genel ---------------------------------------------------------------------

export function GeneralPanel({ guild, currentUserId, accountRole, confirm }: PanelProps) {
  const can = guildPermissions(guild, accountRole);
  const [name, setName] = useState(guild.name);
  const [description, setDescription] = useState(guild.description);
  const [icon, setIcon] = useState(guild.iconDataUrl);
  const [joinMode, setJoinMode] = useState<GuildJoinMode>(guild.joinMode);
  const { write, busy } = useGuildWrite(guild.id);
  const members = useGuildPart(guild.id, "members");
  const [heir, setHeir] = useState<string | null>(null);

  const patch = {
    ...(name.trim() !== guild.name && { name: name.trim() }),
    ...(description.trim() !== guild.description && { description: description.trim() }),
    ...(icon !== guild.iconDataUrl && { iconDataUrl: icon }),
    ...(joinMode !== guild.joinMode && { joinMode }),
  };
  const dirty = Object.keys(patch).length > 0;
  const save = () =>
    write("save", () => callGuild("update", { guildId: guild.id, ...patch }), "Ayarlar kaydedildi").catch(() => undefined);

  const others = (members.data?.members ?? []).filter((member) => member.userId !== currentUserId);
  const heirName = others.find((member) => member.userId === heir)?.username;

  return (
    <div className="ct-room-panel">
      {can.edit && (
        <Section title="Genel">
          <GuildIconPicker value={icon} name={name} onChange={setIcon} disabled={busy !== null} />
          <label className="ct-field">
            <span className="ct-field-label-row">
              Sunucu adı
              <span className="ct-field-count">{name.length}/48</span>
            </span>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={48} />
          </label>
          <label className="ct-field">
            <span className="ct-field-label-row">
              Açıklama
              <span className="ct-field-count">{description.length}/300</span>
            </span>
            <Input.TextArea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </label>
          <JoinModeField value={joinMode} onChange={setJoinMode} disabled={busy !== null} />
          <div className="ct-guild-save-row">
            <span className="ct-field-hint">{dirty ? "Kaydedilmemiş değişiklik var" : "Değişiklik yok"}</span>
            <Button type="primary" disabled={!dirty || !name.trim()} loading={busy === "save"} onClick={() => void save()}>
              Kaydet
            </Button>
          </div>
        </Section>
      )}

      <Section title="Tehlikeli bölge" danger>
        {can.own ? (
          <>
            <div className="ct-room-row">
              <span className="ct-room-row-text">
                <strong>Sahipliği devret</strong>
                <span>Yeni sahip her şeyi yönetir, sen yönetici olursun.</span>
              </span>
              <Select
                className="ct-guild-heir"
                size="small"
                placeholder="Üye seç"
                value={heir}
                onChange={setHeir}
                showSearch
                optionFilterProp="label"
                options={others.map((member) => ({ value: member.userId, label: `@${member.username}` }))}
                aria-label="Yeni sahip"
              />
              <Button
                danger
                disabled={!heir}
                onClick={() =>
                  heir &&
                  confirm({
                    title: "Sahipliği devret",
                    icon: "shield",
                    confirmLabel: "Devret",
                    consequences: [
                      `@${heirName} sunucunun sahibi olur.`,
                      "Sen yönetici olarak kalırsın.",
                      "Geri almak için yeni sahibin devretmesi gerekir.",
                    ],
                    run: () => write("transfer", () => callGuild("transfer", { guildId: guild.id, userId: heir }), "Sahiplik devredildi"),
                  })
                }
              >
                Devret…
              </Button>
            </div>
            <div className="ct-room-row">
              <span className="ct-room-row-text">
                <strong>Sunucuyu sil</strong>
                <span>Herkes için kalkar. 30 gün içinde geri yükleyebilirsin.</span>
              </span>
              <Button
                danger
                onClick={() =>
                  confirm({
                    title: `${guild.name} silinsin mi?`,
                    confirmLabel: "Sunucuyu sil",
                    consequences: [
                      "Sunucu ve odaları herkesten gizlenir, odadakilerin bağlantısı kesilir.",
                      "30 gün içinde Keşfet'teki “Silinen sunucuların” listesinden geri yükleyebilirsin.",
                      "30 gün sonra kalıcı olarak silinir.",
                    ],
                    run: () => write("delete", () => callGuild("remove", { guildId: guild.id }), "Sunucu silindi"),
                  })
                }
              >
                Sunucuyu sil…
              </Button>
            </div>
          </>
        ) : (
          <div className="ct-room-row">
            <span className="ct-room-row-text">
              <strong>Sunucudan ayrıl</strong>
              <span>Odaları listenden kalkar. Yeniden katılmak için davet ya da onay gerekebilir.</span>
            </span>
            <Button danger onClick={() => confirm(leaveRequest(guild, write))}>
              Ayrıl…
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

export const leaveRequest = (
  guild: Guild,
  write: (key: string, action: () => Promise<unknown>, done?: string) => Promise<void>,
): GuildConfirmRequest => ({
  title: `${guild.name} sunucusundan ayrıl`,
  icon: "logout",
  confirmLabel: "Ayrıl",
  consequences: [
    "Sunucu ve odaları listenden kalkar; içindeysen sesli odadan çıkarsın.",
    guild.joinMode === "public" ? "Keşfet'ten yeniden katılabilirsin." : "Yeniden katılmak için davet ya da onay gerekir.",
  ],
  run: () => write("leave", () => callGuild("leave", { guildId: guild.id }), `${guild.name} sunucusundan ayrıldın`),
});

export { useGuildWrite };

// --- Davetler ------------------------------------------------------------------

const USES = [
  { value: 0, label: "Sınırsız kullanım" },
  { value: 1, label: "1 kullanım" },
  { value: 5, label: "5 kullanım" },
  { value: 25, label: "25 kullanım" },
  { value: 100, label: "100 kullanım" },
];
const DURATIONS = [
  { value: 1, label: "1 saat" },
  { value: 24, label: "1 gün" },
  { value: 168, label: "7 gün" },
  { value: 720, label: "30 gün" },
  { value: 0, label: "Süresiz" },
];

export const copyCode = (code: string): void => {
  void navigator.clipboard.writeText(code).then(
    () => toast.success(`Kod kopyalandı: ${code}`),
    () => toast.error("Kopyalanamadı."),
  );
};

export function InvitesPanel({ guild }: PanelProps) {
  const invites = useGuildPart(guild.id, "invites");
  const { write, busy } = useGuildWrite(guild.id);
  const [maxUses, setMaxUses] = useState(0);
  const [ttlHours, setTtlHours] = useState(24);
  const list = invites.data?.invites ?? [];

  return (
    <div className="ct-room-panel">
      <Section title="Yeni davet">
        <div className="ct-guild-invite-form">
          <Select size="middle" value={maxUses} onChange={setMaxUses} options={USES} aria-label="Kullanım sınırı" />
          <Select size="middle" value={ttlHours} onChange={setTtlHours} options={DURATIONS} aria-label="Geçerlilik süresi" />
          <Button
            type="primary"
            loading={busy === "create"}
            onClick={() =>
              void write("create", async () => {
                const { invite } = await callGuild("createInvite", { guildId: guild.id, maxUses, ttlHours });
                copyCode(invite.code);
              }).catch(() => undefined)
            }
          >
            Oluştur ve kopyala
          </Button>
        </div>
        <span className="ct-field-hint">Kodu sohbette paylaş: mesajda katılma kartı olarak görünür.</span>
      </Section>
      <Section title="Davetler">
        {invites.isLoading ? (
          <Empty>Yükleniyor…</Empty>
        ) : list.length === 0 ? (
          <Empty>Henüz davet yok.</Empty>
        ) : (
          <ul className="ct-guild-rows">
            {list.map((invite) => (
              <li key={invite.code} className="ct-guild-row">
                <code className="ct-guild-code">{invite.code}</code>
                <span className="ct-guild-row-text">
                  <strong>
                    {invite.uses}
                    {invite.maxUses > 0 ? ` / ${invite.maxUses}` : ""} kullanım
                  </strong>
                  <span>{invite.expiresAt ? `Bitiş: ${when(invite.expiresAt)}` : "Süresiz"}</span>
                </span>
                <span className="ct-guild-row-actions">
                  <Button size="small" icon={<MenuIcon name="copy" size={14} />} onClick={() => copyCode(invite.code)}>
                    Kopyala
                  </Button>
                  <Button
                    size="small"
                    danger
                    type="text"
                    loading={busy === invite.code}
                    aria-label={`${invite.code} davetini sil`}
                    icon={<MenuIcon name="trash" size={14} />}
                    onClick={() =>
                      void write(invite.code, () => callGuild("deleteInvite", { guildId: guild.id, code: invite.code }), "Davet silindi").catch(
                        () => undefined,
                      )
                    }
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// --- Üyeler --------------------------------------------------------------------

const BAN_LENGTHS = [
  { value: 60, label: "1 saat" },
  { value: 1440, label: "1 gün" },
  { value: 10080, label: "7 gün" },
  { value: 0, label: "Süresiz" },
];

export function MembersPanel({ guild, currentUserId, accountRole, confirm }: PanelProps) {
  const members = useGuildPart(guild.id, "members");
  const { write, busy } = useGuildWrite(guild.id);
  const can = guildPermissions(guild, accountRole);
  const [filter, setFilter] = useState("");
  const reasonRef = useRef("");
  const lengthRef = useRef(1440);
  const list = (members.data?.members ?? []).filter((member) =>
    member.username.toLocaleLowerCase("tr-TR").includes(filter.trim().toLocaleLowerCase("tr-TR")),
  );
  const roleOptions = (["admin", "moderator", "member"] as const)
    .filter((role) => outranks(guild.myRole, role, accountRole))
    .map((role) => ({ value: role, label: ROLE_LABELS[role] }));

  const ban = (userId: string, username: string): void => {
    reasonRef.current = "";
    lengthRef.current = 1440;
    confirm({
      title: `@${username} yasaklansın mı?`,
      icon: "userMinus",
      confirmLabel: "Yasakla",
      consequences: ["Sunucudan çıkarılır ve süre bitene kadar geri katılamaz."],
      body: (
        <div className="ct-modal-form ct-guild-ban-form">
          <label className="ct-field">
            <span>Süre</span>
            <Select defaultValue={1440} options={BAN_LENGTHS} onChange={(value) => (lengthRef.current = value)} />
          </label>
          <label className="ct-field">
            <span>Sebep (isteğe bağlı)</span>
            <Input maxLength={300} onChange={(event) => (reasonRef.current = event.target.value)} />
          </label>
        </div>
      ),
      run: () =>
        write(
          `ban-${userId}`,
          () =>
            callGuild("ban", {
              guildId: guild.id,
              userId,
              reason: reasonRef.current.trim(),
              durationMinutes: lengthRef.current,
            }),
          `@${username} yasaklandı`,
        ),
    });
  };

  return (
    <div className="ct-room-panel">
      <Section title="Üyeler">
        <label className="ct-odak-search ct-guild-filter">
          <MenuIcon name="search" size={15} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Üye ara" aria-label="Üye ara" />
        </label>
        {members.isLoading ? (
          <Empty>Yükleniyor…</Empty>
        ) : (
          <ul className="ct-guild-rows">
            {list.map((member) => {
              const self = member.userId === currentUserId;
              const actOn =
                !self && member.role !== "owner" && can.moderate && outranks(guild.myRole, member.role, accountRole);
              return (
                <PersonRow
                  key={member.userId}
                  name={member.username}
                  detail={`${self ? "Sen · " : ""}Katıldı: ${when(member.joinedAt)}`}
                >
                  {can.setRoles && actOn ? (
                    <Select
                      size="small"
                      className="ct-guild-role-select"
                      value={member.role}
                      options={roleOptions}
                      loading={busy === `role-${member.userId}`}
                      aria-label={`@${member.username} rolü`}
                      onChange={(role: GuildRole) =>
                        void write(
                          `role-${member.userId}`,
                          () =>
                            callGuild("setRole", {
                              guildId: guild.id,
                              userId: member.userId,
                              role: role as Exclude<GuildRole, "owner">,
                            }),
                          `@${member.username}: ${ROLE_LABELS[role]}`,
                        ).catch(() => undefined)
                      }
                    />
                  ) : (
                    <span className={`ct-guild-role ${member.role}`}>{ROLE_LABELS[member.role]}</span>
                  )}
                  {actOn && (
                    <>
                      <Button
                        size="small"
                        type="text"
                        onClick={() =>
                          confirm({
                            title: `@${member.username} çıkarılsın mı?`,
                            icon: "userMinus",
                            confirmLabel: "Çıkar",
                            consequences: ["Sunucudan çıkarılır; içindeyse sesli odadan atılır.", "Davetle ya da Keşfet'ten yeniden katılabilir."],
                            run: () =>
                              write(`kick-${member.userId}`, () => callGuild("kick", { guildId: guild.id, userId: member.userId }), `@${member.username} çıkarıldı`),
                          })
                        }
                      >
                        Çıkar
                      </Button>
                      <Button size="small" type="text" danger onClick={() => ban(member.userId, member.username)}>
                        Yasakla
                      </Button>
                    </>
                  )}
                </PersonRow>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

// --- İstekler ------------------------------------------------------------------

export function RequestsPanel({ guild }: PanelProps) {
  const requests = useGuildPart(guild.id, "requests");
  const { write, busy } = useGuildWrite(guild.id);
  const list = requests.data?.requests ?? [];
  const decide = (userId: string, username: string, approve: boolean) =>
    void write(
      `${approve ? "yes" : "no"}-${userId}`,
      () => callGuild("decide", { guildId: guild.id, userId, approve }),
      approve ? `@${username} katıldı` : "İstek reddedildi",
    ).catch(() => undefined);

  return (
    <div className="ct-room-panel">
      <Section title="İstekler">
        {requests.isLoading ? (
          <Empty>Yükleniyor…</Empty>
        ) : list.length === 0 ? (
          <Empty>Bekleyen istek yok.</Empty>
        ) : (
          <ul className="ct-guild-rows">
            {list.map((request) => (
              <PersonRow key={request.userId} name={request.username} detail={`İstedi: ${when(request.createdAt)}`}>
                <Button size="small" type="primary" loading={busy === `yes-${request.userId}`} onClick={() => decide(request.userId, request.username, true)}>
                  Onayla
                </Button>
                <Button size="small" loading={busy === `no-${request.userId}`} onClick={() => decide(request.userId, request.username, false)}>
                  Reddet
                </Button>
              </PersonRow>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// --- Yasaklar ------------------------------------------------------------------

export function BansPanel({ guild }: PanelProps) {
  const bans = useGuildPart(guild.id, "bans");
  const { write, busy } = useGuildWrite(guild.id);
  const list = bans.data?.bans ?? [];

  return (
    <div className="ct-room-panel">
      <Section title="Yasaklar">
        {bans.isLoading ? (
          <Empty>Yükleniyor…</Empty>
        ) : list.length === 0 ? (
          <Empty>Yasaklı kimse yok.</Empty>
        ) : (
          <ul className="ct-guild-rows">
            {list.map((ban) => (
              <PersonRow
                key={ban.userId}
                name={ban.username}
                detail={[ban.expiresAt ? `Bitiş: ${when(ban.expiresAt)}` : "Süresiz", ban.reason].filter(Boolean).join(" · ")}
              >
                <Button
                  size="small"
                  loading={busy === ban.userId}
                  onClick={() =>
                    void write(ban.userId, () => callGuild("unban", { guildId: guild.id, userId: ban.userId }), `@${ban.username} yasağı kalktı`).catch(
                      () => undefined,
                    )
                  }
                >
                  Yasağı kaldır
                </Button>
              </PersonRow>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
