import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Popconfirm, Select, Table, Tooltip } from "antd";
import {
  CustomerServiceOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { AdminUserDetail } from "@shared/auth-contracts";
import type { MusicDJ } from "@shared/music";
import { toErrorMessage } from "@shared/error-message";
import adminService from "../services/admin-service";
import {
  AdminPageHeader,
  AdminPerson,
  AdminSection,
  adminDateTime,
  useTableFit,
} from "./admin-primitives";
import { toast } from "@/services/toast";
import { NIGHT_GUILD_ID } from "@shared/guild-contracts";
import { useAdminGuilds } from "./admin-guilds";

export default function AdminMusic() {
  const [djs, setDjs] = useState<MusicDJ[]>([]);
  const [tableRef, fitColumns] = useTableFit();
  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [spotifyEnabled, setSpotifyEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [granting, setGranting] = useState(false);
  const [candidateId, setCandidateId] = useState<string | undefined>();
  // The DJ list is per server.
  const [guildId, setGuildId] = useState(NIGHT_GUILD_ID);
  const guildOptions = (useAdminGuilds().data?.guilds ?? [])
    .filter((guild) => !guild.deletedAt)
    .map((guild) => ({ value: guild.id, label: guild.name }));

  const fetchDjs = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const result = await adminService.listMusicDJs(guildId);
      setDjs(result.djs);
      setSpotifyEnabled(result.spotifyEnabled);
      setDisabled(false);
    } catch (error) {
      setDisabled(true);
      setDjs([]);
      toast.error(toErrorMessage(error, "DJ listesi alınamadı"));
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void fetchDjs();
  }, [fetchDjs]);

  useEffect(() => {
    void adminService
      .listUsers()
      .then((result) => setUsers(result.users))
      .catch(() => undefined);
  }, []);

  const grant = useCallback(async (): Promise<void> => {
    if (!candidateId) {
      return;
    }
    try {
      setGranting(true);
      await adminService.grantMusicDJ(candidateId, guildId);
      setCandidateId(undefined);
      toast.success("DJ yetkisi verildi");
      void fetchDjs();
    } catch (error) {
      toast.error(toErrorMessage(error, "DJ yetkisi verilemedi"));
    } finally {
      setGranting(false);
    }
  }, [candidateId, fetchDjs, guildId]);

  const revoke = useCallback(
    async (userId: string): Promise<void> => {
      try {
        await adminService.revokeMusicDJ(userId, guildId);
        toast.success("DJ yetkisi alındı");
        void fetchDjs();
      } catch (error) {
        toast.error(toErrorMessage(error, "DJ yetkisi alınamadı"));
      }
    },
    [fetchDjs, guildId],
  );

  const nameOf = useCallback(
    (userId: string): string => {
      const found = users.find((user) => user.id === userId);
      return found ? `@${found.username}` : userId;
    },
    [users],
  );

  const alreadyDj = new Set(djs.map((dj) => dj.userId));
  const candidates = users
    .filter((user) => !alreadyDj.has(user.id))
    .map((user) => ({ value: user.id, label: `${user.displayName} (@${user.username})` }));

  const columns = [
    {
      title: "Kullanıcı",
      key: "user",
      ellipsis: true,
      render: (_: unknown, record: MusicDJ) => (
        <AdminPerson
          userId={record.userId}
          name={record.displayName || record.username || record.userId}
          handle={record.username ? `@${record.username}` : record.userId}
        />
      ),
    },
    {
      title: "Yetkiyi veren",
      hideBelow: 560,
      key: "grantedBy",
      width: 170,
      ellipsis: true,
      render: (_: unknown, record: MusicDJ) => <span>{nameOf(record.grantedBy)}</span>,
    },
    {
      title: "Tarih",
      hideBelow: 380,
      dataIndex: "grantedAt",
      key: "grantedAt",
      width: 150,
      render: (value: string) => <span className="ct-admin-muted">{adminDateTime(value)}</span>,
    },
    {
      title: "",
      key: "actions",
      width: 64,
      align: "right" as const,
      render: (_: unknown, record: MusicDJ) => (
        <div className="ct-admin-actions">
          <Popconfirm
            title="DJ yetkisi alınsın mı?"
            onConfirm={() => void revoke(record.userId)}
            okText="Yetkiyi al"
            cancelText="Vazgeç"
          >
            <Tooltip title="Yetkiyi al">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Müzik"
        description="Odalarda müzik botunu kullanabilecek kişileri belirleyin. Yöneticiler her zaman kullanabilir."
        actions={
          <>
            <Select
              value={guildId}
              onChange={setGuildId}
              options={guildOptions.length > 0 ? guildOptions : [{ value: NIGHT_GUILD_ID, label: "NIGHT" }]}
              showSearch
              optionFilterProp="label"
              className="ct-admin-toolbar-filter"
              aria-label="Sunucu"
            />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchDjs()}>
              Yenile
            </Button>
          </>
        }
      />

      {disabled ? (
        <Alert className="ct-alert"
          type="warning"
          showIcon
          title="Müzik botu kapalı"
          description="Sunucuda MUSIC_ENABLED=true değil ya da yt-dlp/ffmpeg kurulu değil. Komutlar ve bu ekran çalışmaz."
        />
      ) : null}

      {!disabled && !spotifyEnabled ? (
        <Alert className="ct-alert"
          type="info"
          showIcon
          title="Spotify bağlantıları kapalı"
          description="SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET tanımlı değil. YouTube bağlantıları ve arama çalışmaya devam eder."
        />
      ) : null}

      <AdminSection
        title="DJ yetkileri"
        description="Bu kişiler seçili sunucunun odalarında müzik botuna şarkı ekleyip kuyruğu yönetebilir."
        icon={<CustomerServiceOutlined />}
        hint={`${djs.length} kişi`}
        toolbar={
          <>
            <Select
              showSearch
              allowClear
              value={candidateId}
              onChange={setCandidateId}
              options={candidates}
              placeholder="Kullanıcı seç"
              optionFilterProp="label"
              className="ct-admin-toolbar-filter wide"
              disabled={disabled}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={granting}
              disabled={disabled || !candidateId}
              onClick={() => void grant()}
            >
              Yetki ver
            </Button>
          </>
        }
        flush
      >
        <Table
          ref={tableRef}
          tableLayout="fixed"
          rowKey="userId"
          size="small"
          loading={loading}
          dataSource={djs}
          columns={fitColumns(columns)}
          pagination={false}
          className="ct-admin-table-wrap"
          locale={{ emptyText: "Henüz DJ yetkisi verilmiş kimse yok." }}
        />
      </AdminSection>
    </div>
  );
}
