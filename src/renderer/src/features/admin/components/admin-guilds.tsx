import { useState } from "react";
import { Button, Input, InputNumber, Popconfirm, Table, Tooltip } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClusterOutlined,
  DeleteOutlined,
  EyeOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import type { AdminGuild } from "@shared/guild-contracts";
import { toast } from "@/services/toast";
import {
  GuildIcon,
  JOIN_MODE_LABELS,
  callGuild,
  errorText,
  useGuildUi,
  useRefreshGuilds,
} from "@/features/guilds";
import { AdminPageHeader, AdminSection, AdminState, adminDateTime, useTableFit } from "./admin-primitives";

export const ADMIN_GUILDS_KEY = ["admin-guilds"] as const;

/** Every server, for the platform panel (and the DJ page's server picker). */
export const useAdminGuilds = () =>
  useQuery({ queryKey: ADMIN_GUILDS_KEY, queryFn: () => callGuild("adminList", {}), staleTime: 15_000 });

const statusOf = (guild: AdminGuild) =>
  guild.deletedAt ? (
    <AdminState tone="danger">Silindi</AdminState>
  ) : guild.suspendedAt ? (
    <AdminState tone="warn">Askıda</AdminState>
  ) : (
    <AdminState tone="ok">Aktif</AdminState>
  );

/** The member ceiling, edited in place: empty means the platform default. */
function MemberLimit({ guild, fallback, onSave }: { guild: AdminGuild; fallback: number; onSave: (limit: number) => void }) {
  const [value, setValue] = useState<number | null>(guild.memberLimit || null);
  const changed = (value ?? 0) !== guild.memberLimit;
  return (
    <span className="ct-admin-guild-limit">
      <InputNumber
        size="small"
        min={2}
        max={100000}
        value={value}
        placeholder={String(fallback)}
        onChange={(next) => setValue(next ?? null)}
        aria-label={`${guild.name} üye sınırı`}
      />
      {changed && (
        <Button size="small" onClick={() => onSave(value ?? 0)}>
          Kaydet
        </Button>
      )}
    </span>
  );
}

export default function AdminGuilds() {
  const query = useAdminGuilds();
  const queryClient = useQueryClient();
  const refreshMine = useRefreshGuilds();
  const view = useGuildUi((state) => state.view);
  const [tableRef, fitColumns] = useTableFit();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const guilds = query.data?.guilds ?? [];
  const fallbackLimit = query.data?.limits.membersPerGuild ?? 0;
  const needle = search.trim().toLocaleLowerCase("tr-TR");
  const shown = needle
    ? guilds.filter((guild) =>
        `${guild.name} ${guild.ownerUsername} ${guild.id}`.toLocaleLowerCase("tr-TR").includes(needle),
      )
    : guilds;

  const act = async (key: string, run: () => Promise<unknown>, done: string): Promise<void> => {
    setBusy(key);
    try {
      await run();
      await Promise.all([queryClient.invalidateQueries({ queryKey: ADMIN_GUILDS_KEY }), refreshMine()]);
      toast.success(done);
    } catch (failure) {
      toast.error(errorText(failure));
    } finally {
      setBusy(null);
    }
  };

  const columns = [
    {
      title: "Sunucu",
      key: "guild",
      ellipsis: true,
      render: (_: unknown, guild: AdminGuild) => (
        <div className="ct-admin-table-user">
          <GuildIcon guild={guild} size={28} />
          <div className="ct-admin-person-text">
            <strong>{guild.name}</strong>
            <span className="ct-admin-mono">{guild.id}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Sahip",
      key: "owner",
      width: 130,
      ellipsis: true,
      hideBelow: 720,
      render: (_: unknown, guild: AdminGuild) => <span>@{guild.ownerUsername || guild.ownerId}</span>,
    },
    {
      title: "Üye",
      key: "members",
      width: 170,
      render: (_: unknown, guild: AdminGuild) => (
        <span className="ct-admin-guild-members">
          <span className="ct-admin-guild-count">{guild.memberCount}</span>
          <MemberLimit
            key={guild.memberLimit}
            guild={guild}
            fallback={fallbackLimit}
            onSave={(memberLimit) =>
              void act(`limit-${guild.id}`, () => callGuild("adminSetMemberLimit", { guildId: guild.id, memberLimit }), "Üye sınırı kaydedildi")
            }
          />
        </span>
      ),
    },
    {
      title: "Katılım",
      key: "mode",
      width: 130,
      hideBelow: 900,
      render: (_: unknown, guild: AdminGuild) => <span>{JOIN_MODE_LABELS[guild.joinMode].label}</span>,
    },
    {
      title: "Durum",
      key: "status",
      width: 100,
      render: (_: unknown, guild: AdminGuild) => statusOf(guild),
    },
    {
      title: "Kuruldu",
      key: "created",
      width: 140,
      hideBelow: 1080,
      render: (_: unknown, guild: AdminGuild) => <span className="ct-admin-muted">{adminDateTime(guild.createdAt)}</span>,
    },
    {
      title: "",
      key: "actions",
      width: 132,
      align: "right" as const,
      render: (_: unknown, guild: AdminGuild) => (
        <div className="ct-admin-actions">
          {guild.deletedAt ? (
            <Tooltip title="Geri yükle">
              <Button
                type="text"
                aria-label={`${guild.name}: geri yükle`}
                icon={<RollbackOutlined />}
                loading={busy === `restore-${guild.id}`}
                onClick={() => void act(`restore-${guild.id}`, () => callGuild("adminRestore", { guildId: guild.id }), `${guild.name} geri yüklendi`)}
              />
            </Tooltip>
          ) : (
            <>
              <Tooltip title="Aç (üye olmadan, görünmez)">
                <Button
                  type="text"
                  aria-label={`${guild.name}: aç`}
                  icon={<EyeOutlined />}
                  onClick={() => view(guild.id)}
                />
              </Tooltip>
              <Popconfirm
                title={guild.suspendedAt ? `${guild.name} yeniden açılsın mı?` : `${guild.name} askıya alınsın mı?`}
                description={
                  guild.suspendedAt
                    ? "Üyeleri sunucuyu ve odalarını yeniden görür."
                    : "Sunucu ve odaları herkesten gizlenir, odadakilerin bağlantısı kesilir."
                }
                okText={guild.suspendedAt ? "Askıyı kaldır" : "Askıya al"}
                cancelText="Vazgeç"
                onConfirm={() =>
                  void act(
                    `suspend-${guild.id}`,
                    () => callGuild("adminSuspend", { guildId: guild.id, suspended: !guild.suspendedAt }),
                    guild.suspendedAt ? "Askı kaldırıldı" : "Sunucu askıya alındı",
                  )
                }
              >
                <Tooltip title={guild.suspendedAt ? "Askıyı kaldır" : "Askıya al"}>
                  <Button
                    type="text"
                    aria-label={`${guild.name}: ${guild.suspendedAt ? "askıyı kaldır" : "askıya al"}`}
                    icon={guild.suspendedAt ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                    loading={busy === `suspend-${guild.id}`}
                  />
                </Tooltip>
              </Popconfirm>
            </>
          )}
          <Popconfirm
            title={`${guild.name} kalıcı olarak silinsin mi?`}
            description="Odaları, mesajları ve üyelikleri hemen silinir. Geri alınamaz."
            okText="Kalıcı sil"
            okButtonProps={{ danger: true }}
            cancelText="Vazgeç"
            onConfirm={() => void act(`purge-${guild.id}`, () => callGuild("adminPurge", { guildId: guild.id }), "Sunucu kalıcı olarak silindi")}
          >
            <Tooltip title="Kalıcı sil">
              <Button
                type="text"
                danger
                aria-label={`${guild.name}: kalıcı sil`}
                icon={<DeleteOutlined />}
                loading={busy === `purge-${guild.id}`}
              />
            </Tooltip>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Sunucular"
        description="Platformdaki bütün sunucular. Askıya alınan sunucu kimseye görünmez; silinen sunucuyu sahibi 30 gün içinde geri yükleyebilir."
        actions={
          <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => void query.refetch()}>
            Yenile
          </Button>
        }
      />
      <AdminSection
        title="Sunucu listesi"
        icon={<ClusterOutlined />}
        hint={`${guilds.length} sunucu`}
        toolbar={
          <Input.Search
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ad, sahip ya da kimlik"
            className="ct-admin-toolbar-filter wide"
          />
        }
        flush
      >
        <Table
          ref={tableRef}
          tableLayout="fixed"
          rowKey="id"
          size="small"
          loading={query.isLoading}
          dataSource={shown}
          columns={fitColumns(columns)}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          className="ct-admin-table-wrap"
          locale={{ emptyText: query.isError ? errorText(query.error) : "Sunucu yok." }}
        />
      </AdminSection>
    </div>
  );
}
