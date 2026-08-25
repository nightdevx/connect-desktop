import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Popconfirm, Select, Table, Tag, Tooltip, message } from "antd";
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
import { AdminPageHeader, AdminSection } from "./admin-primitives";

export default function AdminMusic() {
  const [djs, setDjs] = useState<MusicDJ[]>([]);
  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [spotifyEnabled, setSpotifyEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [granting, setGranting] = useState(false);
  const [candidateId, setCandidateId] = useState<string | undefined>();

  const fetchDjs = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const result = await adminService.listMusicDJs();
      setDjs(result.djs);
      setSpotifyEnabled(result.spotifyEnabled);
      setDisabled(false);
    } catch (error) {
      setDisabled(true);
      setDjs([]);
      message.error(toErrorMessage(error, "DJ listesi alınamadı"));
    } finally {
      setLoading(false);
    }
  }, []);

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
      await adminService.grantMusicDJ(candidateId);
      setCandidateId(undefined);
      message.success("DJ yetkisi verildi");
      void fetchDjs();
    } catch (error) {
      message.error(toErrorMessage(error, "DJ yetkisi verilemedi"));
    } finally {
      setGranting(false);
    }
  }, [candidateId, fetchDjs]);

  const revoke = useCallback(
    async (userId: string): Promise<void> => {
      try {
        await adminService.revokeMusicDJ(userId);
        message.success("DJ yetkisi alındı");
        void fetchDjs();
      } catch (error) {
        message.error(toErrorMessage(error, "DJ yetkisi alınamadı"));
      }
    },
    [fetchDjs],
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
      render: (_: unknown, record: MusicDJ) => (
        <div className="ct-admin-table-user">
          <CustomerServiceOutlined className="ct-admin-muted" />
          <div className="ct-admin-cell">
            <strong>{record.displayName || record.username || record.userId}</strong>
            <span>{record.username ? `@${record.username}` : record.userId}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Yetkiyi veren",
      key: "grantedBy",
      width: 200,
      render: (_: unknown, record: MusicDJ) => <Tag color="blue">{nameOf(record.grantedBy)}</Tag>,
    },
    {
      title: "Tarih",
      dataIndex: "grantedAt",
      key: "grantedAt",
      width: 180,
      render: (value: string) => (value ? new Date(value).toLocaleString("tr-TR") : "-"),
    },
    {
      title: "İşlemler",
      key: "actions",
      width: 100,
      align: "right" as const,
      render: (_: unknown, record: MusicDJ) => (
        <div className="ct-admin-actions">
          <Popconfirm
            title="Bu kullanıcının DJ yetkisi alınsın mı?"
            onConfirm={() => void revoke(record.userId)}
            okText="Evet"
            cancelText="Hayır"
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
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchDjs()}>
            Yenile
          </Button>
        }
      />

      {disabled ? (
        <Alert
          type="warning"
          showIcon
          message="Müzik botu kapalı"
          description="Sunucuda MUSIC_ENABLED=true değil ya da yt-dlp/ffmpeg kurulu değil. Komutlar ve bu ekran çalışmaz."
        />
      ) : null}

      {!disabled && !spotifyEnabled ? (
        <Alert
          type="info"
          showIcon
          message="Spotify bağlantıları kapalı"
          description="SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET tanımlı değil. YouTube bağlantıları ve arama çalışmaya devam eder."
        />
      ) : null}

      <AdminSection
        title="DJ Yetkileri"
        icon={<CustomerServiceOutlined />}
        hint={`${djs.length} kişi`}
        action={
          <div className="ct-admin-actions">
            <Select
              showSearch
              allowClear
              value={candidateId}
              onChange={setCandidateId}
              options={candidates}
              placeholder="Kullanıcı seç"
              optionFilterProp="label"
              style={{ minWidth: 260 }}
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
          </div>
        }
        flush
      >
        <Table
          rowKey="userId"
          size="small"
          loading={loading}
          dataSource={djs}
          columns={columns}
          pagination={false}
          locale={{ emptyText: "Henüz DJ yetkisi verilmiş kimse yok" }}
        />
      </AdminSection>
    </div>
  );
}
