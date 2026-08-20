import { useCallback, useEffect, useState } from "react";
import {
  Button,
  InputNumber,
  Popconfirm,
  Select,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import {
  DeleteOutlined,
  NumberOutlined,
  ReloadOutlined,
  SoundOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { AdminEmoteLibrary, CustomEmoteSummary } from "@shared/desktop-api-types";
import type { AdminUserDetail } from "@shared/auth-contracts";
import adminService from "../services/admin-service";
import { toErrorMessage } from "@shared/error-message";
import { AdminPageHeader, AdminSection } from "./admin-primitives";

// The soundboard is the one member-level feature that writes to shared storage
// and plays on everyone else's speakers, so it needs both halves of an operator
// screen: a budget, and a way to take a specific sound down.
export default function AdminSounds() {
  const [library, setLibrary] = useState<AdminEmoteLibrary | null>(null);
  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingQuota, setSavingQuota] = useState(false);
  const [globalDraft, setGlobalDraft] = useState<number | null>(null);
  const [overrideUserId, setOverrideUserId] = useState<string | undefined>();
  const [overrideValue, setOverrideValue] = useState<number | null>(null);

  const fetchLibrary = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const result = await adminService.listEmotes();
      setLibrary(result);
      setGlobalDraft(result.globalQuota);
    } catch (error) {
      message.error(toErrorMessage(error, "Sesler alınamadı"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLibrary();
  }, [fetchLibrary]);

  // The user list is only needed to name owners and to fill the override
  // picker, so it is read once rather than on every refresh of the library.
  useEffect(() => {
    void adminService
      .listUsers()
      .then((result) => setUsers(result.users))
      .catch(() => undefined);
  }, []);

  const usernameOf = useCallback(
    (userId: string): string => {
      const found = users.find((user) => user.id === userId);
      return found ? `@${found.username}` : userId;
    },
    [users],
  );

  const saveQuota = useCallback(
    async (payload: { userId?: string; quota: number | null }): Promise<void> => {
      try {
        setSavingQuota(true);
        const result = await adminService.setEmoteQuota(payload);
        setLibrary((previous) =>
          previous
            ? {
                ...previous,
                globalQuota: result.globalQuota,
                userQuotas: result.userQuotas,
              }
            : previous,
        );
        setGlobalDraft(result.globalQuota);
        message.success("Limit güncellendi");
      } catch (error) {
        message.error(toErrorMessage(error, "Limit güncellenemedi"));
      } finally {
        setSavingQuota(false);
      }
    },
    [],
  );

  const deleteEmote = useCallback(
    async (emoteId: string): Promise<void> => {
      try {
        await adminService.deleteEmote(emoteId);
        message.success("Ses silindi");
        void fetchLibrary();
      } catch (error) {
        message.error(toErrorMessage(error, "Ses silinemedi"));
      }
    },
    [fetchLibrary],
  );

  const overrideRows = Object.entries(library?.userQuotas ?? {}).map(
    ([userId, quota]) => ({ userId, quota }),
  );
  const maxQuota = library?.maxQuota ?? 50;
  const totalBytes = (library?.emotes ?? []).reduce(
    (sum, emote) => sum + emote.byteLength,
    0,
  );

  const emoteColumns = [
    {
      title: "Ses",
      key: "name",
      width: 280,
      render: (_: unknown, record: CustomEmoteSummary) => (
        <div className="ct-admin-table-user">
          <SoundOutlined className="ct-admin-muted" />
          <div className="ct-admin-cell">
            <strong>{record.name}</strong>
            <span>{record.mimeType}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Yükleyen",
      key: "owner",
      width: 180,
      render: (_: unknown, record: CustomEmoteSummary) => (
        <Tag color="blue">
          {record.ownerUsername ? `@${record.ownerUsername}` : usernameOf(record.ownerId)}
        </Tag>
      ),
    },
    {
      title: "Boyut",
      key: "size",
      width: 110,
      align: "right" as const,
      render: (_: unknown, record: CustomEmoteSummary) =>
        `${Math.max(1, Math.round(record.byteLength / 1024))} KB`,
    },
    {
      title: "Yüklenme",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString("tr-TR"),
    },
    {
      title: "İşlemler",
      key: "actions",
      width: 100,
      align: "right" as const,
      render: (_: unknown, record: CustomEmoteSummary) => (
        <div className="ct-admin-actions">
          <Popconfirm
            title="Bu sesi kalıcı olarak silmek istediğinize emin misiniz?"
            onConfirm={() => void deleteEmote(record.id)}
            okText="Evet"
            cancelText="Hayır"
          >
            <Tooltip title="Sesi sil">
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
        title="Sesler"
        description="Kullanıcıların yüklediği emote seslerini yönetin ve yükleme haklarını belirleyin."
        actions={
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void fetchLibrary()}
          >
            Yenile
          </Button>
        }
      />

      {/* Two quota editors side by side. They used to sit in .ct-admin-kv-grid
          -- the 180px key/value chip grid -- so two cards full of controls
          were laid out on a track sized for a one-line label. */}
      <div className="ct-admin-grid-halves">
        <AdminSection title="Genel Yükleme Hakkı" icon={<NumberOutlined />}>
          <p className="ct-admin-muted">
            Kendine özel bir hakkı olmayan herkes için geçerli. En fazla{" "}
            {maxQuota}.
          </p>
          <div className="ct-admin-quota-row">
            <div className="ct-admin-field">
              <label htmlFor="admin-global-quota">Hak</label>
              <InputNumber
                id="admin-global-quota"
                min={0}
                max={maxQuota}
                value={globalDraft ?? undefined}
                onChange={(value) => setGlobalDraft(value ?? null)}
              />
            </div>
            <Button
              type="primary"
              loading={savingQuota}
              disabled={globalDraft === null || globalDraft === library?.globalQuota}
              onClick={() => void saveQuota({ quota: globalDraft })}
            >
              Kaydet
            </Button>
          </div>
        </AdminSection>

        <AdminSection
          title="Kullanıcıya Özel Hak"
          icon={<UserOutlined />}
          hint={overrideRows.length > 0 ? `${overrideRows.length} istisna` : undefined}
        >
          <p className="ct-admin-muted">
            Bir kullanıcı için genel hakkı ezer. Kaldırılırsa o kullanıcı genel
            hakka döner.
          </p>
          <div className="ct-admin-quota-row">
            <div className="ct-admin-field grow">
              <label htmlFor="admin-quota-user">Kullanıcı</label>
              <Select
                id="admin-quota-user"
                showSearch
                allowClear
                placeholder="Kullanıcı seçin..."
                value={overrideUserId}
                onChange={(value) => {
                  setOverrideUserId(value);
                  setOverrideValue(
                    value != null ? (library?.userQuotas[value] ?? null) : null,
                  );
                }}
                filterOption={(input, option) =>
                  (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
                options={users.map((user) => ({
                  value: user.id,
                  label: `@${user.username}`,
                }))}
              />
            </div>
            <div className="ct-admin-field">
              <label htmlFor="admin-quota-value">Hak</label>
              <InputNumber
                id="admin-quota-value"
                min={0}
                max={maxQuota}
                value={overrideValue ?? undefined}
                disabled={!overrideUserId}
                onChange={(value) => setOverrideValue(value ?? null)}
              />
            </div>
            <Button
              type="primary"
              loading={savingQuota}
              disabled={!overrideUserId || overrideValue === null}
              onClick={() =>
                void saveQuota({ userId: overrideUserId, quota: overrideValue })
              }
            >
              Ver
            </Button>
            <Button
              danger
              loading={savingQuota}
              disabled={
                !overrideUserId || library?.userQuotas[overrideUserId] === undefined
              }
              onClick={() => void saveQuota({ userId: overrideUserId, quota: null })}
            >
              Kaldır
            </Button>
          </div>

          {overrideRows.length > 0 && (
            <div className="ct-admin-quota-list">
              {overrideRows.map((row) => (
                <Tag
                  key={row.userId}
                  color="purple"
                  onClick={() => {
                    setOverrideUserId(row.userId);
                    setOverrideValue(row.quota);
                  }}
                >
                  {usernameOf(row.userId)}: {row.quota}
                </Tag>
              ))}
            </div>
          )}
        </AdminSection>
      </div>

      <AdminSection
        title="Yüklenmiş Sesler"
        icon={<SoundOutlined />}
        hint={
          library
            ? `${library.emotes.length} ses · ${Math.max(1, Math.round(totalBytes / 1024))} KB`
            : undefined
        }
        flush
      >
        <Table
          dataSource={library?.emotes ?? []}
          columns={emoteColumns}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (count) => `${count} ses`,
          }}
          scroll={{ x: "max-content" }}
          className="ct-admin-table-wrap"
          locale={{ emptyText: "Henüz ses yüklenmemiş." }}
        />
      </AdminSection>
    </div>
  );
}
