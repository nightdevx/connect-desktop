import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Popconfirm, Table, Tag, message } from "antd";
import { AudioOutlined, ReloadOutlined, StopOutlined } from "@ant-design/icons";
import adminService from "../services/admin-service";
import type { AdminLobbyTimeout, AdminVoiceMute } from "@shared/auth-contracts";

/**
 * Where a restriction is lifted.
 *
 * A moderator applies one to somebody standing in front of them, from the lobby
 * roster or a video tile. By the time it needs undoing that person has left the
 * room — often because of the restriction — so there is no row left to
 * right-click, and a mute keyed to a user rather than to a lobby follows them
 * into every other room. Without this page an admin could apply something they
 * had no way to take back.
 *
 * Both lists are already filtered server-side to what is still in force: a
 * timed restriction that lapsed on its own is gone from here before the sweeper
 * has tidied the table, because a row nobody can act on is worse than no row.
 */
const expiryTag = (expiresAt?: string | null) =>
  expiresAt ? (
    <Tag color="orange">{new Date(expiresAt).toLocaleString("tr-TR")}</Tag>
  ) : (
    <Tag color="red">Süresiz</Tag>
  );

export default function AdminModeration() {
  const [mutes, setMutes] = useState<AdminVoiceMute[]>([]);
  const [timeouts, setTimeouts] = useState<AdminLobbyTimeout[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Both at once: they are two halves of one question ("what is this person
      // still under"), and loading them in sequence makes the page flash twice.
      const [nextMutes, nextTimeouts] = await Promise.all([
        adminService.listVoiceMutes(),
        adminService.listTimeouts(),
      ]);
      setMutes(nextMutes);
      setTimeouts(nextTimeouts);
    } catch (error) {
      message.error(toErrorMessage(error, "Moderasyon kayıtları yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClearMute = async (userId: string): Promise<void> => {
    try {
      await adminService.setVoiceMute(userId, false);
      message.success("Susturma kaldırıldı.");
      await load();
    } catch (error) {
      message.error(toErrorMessage(error, "Susturma kaldırılamadı"));
    }
  };

  const handleClearTimeout = async (lobbyId: string, userId: string): Promise<void> => {
    try {
      await adminService.clearTimeout(lobbyId, userId);
      message.success("Zaman aşımı kaldırıldı.");
      await load();
    } catch (error) {
      message.error(toErrorMessage(error, "Zaman aşımı kaldırılamadı"));
    }
  };

  return (
    <div className="ct-admin-section">
      <div className="ct-admin-section-header">
        <div>
          <h2>Moderasyon</h2>
          <p className="ct-admin-muted">
            Yürürlükteki susturmalar ve oda yasakları. Süresi dolanlar listede
            görünmez.
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          Yenile
        </Button>
      </div>

      <Card
        title={
          <span>
            <AudioOutlined /> Sunucu Susturmaları
          </span>
        }
        className="ct-admin-card"
      >
        <Table
          dataSource={mutes}
          loading={loading}
          rowKey={(row) => row.userId}
          pagination={false}
          size="small"
          locale={{ emptyText: "Susturulmuş kimse yok." }}
          columns={[
            {
              title: "Kullanıcı",
              key: "username",
              render: (_value: unknown, row: AdminVoiceMute) => (
                <div className="ct-admin-table-user">
                  <div>
                    <strong>@{row.username}</strong>
                    <span>ID: {row.userId}</span>
                  </div>
                </div>
              ),
            },
            {
              title: "Tarih",
              dataIndex: "mutedAt",
              key: "mutedAt",
              render: (value: string) => new Date(value).toLocaleString("tr-TR"),
            },
            {
              title: "Bitiş",
              key: "expiresAt",
              render: (_value: unknown, row: AdminVoiceMute) => expiryTag(row.expiresAt),
            },
            {
              title: "İşlem",
              key: "actions",
              render: (_value: unknown, row: AdminVoiceMute) => (
                <Button type="text" onClick={() => void handleClearMute(row.userId)}>
                  Susturmayı Kaldır
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title={
          <span>
            <StopOutlined /> Oda Zaman Aşımları
          </span>
        }
        className="ct-admin-card"
      >
        <Table
          dataSource={timeouts}
          loading={loading}
          // Composite key: one person can be timed out of several rooms, and the
          // user id alone would collapse those into one row.
          rowKey={(row) => `${row.lobbyId}:${row.userId}`}
          pagination={false}
          size="small"
          locale={{ emptyText: "Zaman aşımı verilmiş kimse yok." }}
          columns={[
            {
              title: "Kullanıcı",
              key: "username",
              render: (_value: unknown, row: AdminLobbyTimeout) => (
                <strong>@{row.username}</strong>
              ),
            },
            {
              title: "Oda",
              key: "lobby",
              render: (_value: unknown, row: AdminLobbyTimeout) => (
                <Tag color="blue">{row.lobbyName}</Tag>
              ),
            },
            {
              title: "Bitiş",
              key: "expiresAt",
              render: (_value: unknown, row: AdminLobbyTimeout) => expiryTag(row.expiresAt),
            },
            {
              title: "İşlem",
              key: "actions",
              render: (_value: unknown, row: AdminLobbyTimeout) => (
                <Popconfirm
                  title="Bu kullanıcının odaya girişi tekrar açılsın mı?"
                  onConfirm={() => void handleClearTimeout(row.lobbyId, row.userId)}
                  okText="Evet"
                  cancelText="Hayır"
                >
                  <Button type="text">Kaldır</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
