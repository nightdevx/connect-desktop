import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  InputNumber,
  Popconfirm,
  Select,
  Table,
  Tag,
  message,
} from "antd";
import { DeleteOutlined, ReloadOutlined, SoundOutlined } from "@ant-design/icons";
import type { AdminEmoteLibrary, CustomEmoteSummary } from "@shared/desktop-api-types";
import type { AdminUserDetail } from "@shared/auth-contracts";
import adminService from "../services/admin-service";
import { toErrorMessage } from "@shared/error-message";

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

  const emoteColumns = [
    {
      title: "Ses",
      key: "name",
      render: (_: unknown, record: CustomEmoteSummary) => (
        <div className="ct-admin-table-user">
          <SoundOutlined className="ct-admin-muted" />
          <div>
            <strong>{record.name}</strong>
            <span>{record.mimeType}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Yükleyen",
      key: "owner",
      render: (_: unknown, record: CustomEmoteSummary) => (
        <Tag color="blue">
          {record.ownerUsername ? `@${record.ownerUsername}` : usernameOf(record.ownerId)}
        </Tag>
      ),
    },
    {
      title: "Boyut",
      key: "size",
      render: (_: unknown, record: CustomEmoteSummary) =>
        `${Math.max(1, Math.round(record.byteLength / 1024))} KB`,
    },
    {
      title: "Yüklenme",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => new Date(value).toLocaleString("tr-TR"),
    },
    {
      title: "İşlemler",
      key: "actions",
      render: (_: unknown, record: CustomEmoteSummary) => (
        <Popconfirm
          title="Bu sesi kalıcı olarak silmek istediğinize emin misiniz?"
          onConfirm={() => void deleteEmote(record.id)}
          okText="Evet"
          cancelText="Hayır"
        >
          <Button type="text" danger icon={<DeleteOutlined />} title="Sil" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="ct-admin-page">
      <header className="ct-admin-page-header">
        <div>
          <h1>Sesler</h1>
          <p>
            Kullanıcıların yüklediği emote seslerini yönetin ve yükleme
            haklarını belirleyin
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void fetchLibrary()}>
          Yenile
        </Button>
      </header>

      <div className="ct-admin-kv-grid">
        <Card className="ct-admin-card" title="Genel Yükleme Hakkı">
          <p className="ct-admin-muted">
            Kendine özel bir hakkı olmayan herkes için geçerli. En fazla{" "}
            {library?.maxQuota ?? 50}.
          </p>
          <div className="ct-admin-quota-row">
            <InputNumber
              min={0}
              max={library?.maxQuota ?? 50}
              value={globalDraft ?? undefined}
              onChange={(value) => setGlobalDraft(value ?? null)}
            />
            <Button
              type="primary"
              loading={savingQuota}
              disabled={globalDraft === null || globalDraft === library?.globalQuota}
              onClick={() => void saveQuota({ quota: globalDraft })}
            >
              Kaydet
            </Button>
          </div>
        </Card>

        <Card className="ct-admin-card" title="Kullanıcıya Özel Hak">
          <p className="ct-admin-muted">
            Bir kullanıcı için genel hakkı ezer. Boş bırakılırsa o kullanıcı
            genel hakka döner.
          </p>
          <div className="ct-admin-quota-row">
            <Select
              showSearch
              allowClear
              placeholder="Kullanıcı seçin..."
              className="ct-admin-toolbar-filter"
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
            <InputNumber
              min={0}
              max={library?.maxQuota ?? 50}
              value={overrideValue ?? undefined}
              disabled={!overrideUserId}
              onChange={(value) => setOverrideValue(value ?? null)}
            />
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
        </Card>
      </div>

      <Table
        dataSource={library?.emotes ?? []}
        columns={emoteColumns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: "max-content" }}
        className="ct-admin-table-wrap"
        locale={{ emptyText: "Henüz ses yüklenmemiş." }}
      />
    </div>
  );
}
