import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Table, Tag, message } from "antd";
import { AudioOutlined, ReloadOutlined, StopOutlined } from "@ant-design/icons";
import adminService from "../services/admin-service";
import type { AdminLobbyTimeout, AdminVoiceMute } from "@shared/auth-contracts";
import { AdminPageHeader, AdminSection } from "./admin-primitives";

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
    // .ct-admin-page: .ct-admin-section was never declared in any stylesheet,
    // so this screen had no column gap, no bottom padding, and a title drawn at
    // body size by Tailwind's preflight.
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Moderasyon"
        description="Yürürlükteki susturmalar ve oda yasakları. Süresi dolanlar listede görünmez."
        actions={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load()}
            loading={loading}
          >
            Yenile
          </Button>
        }
      />

      {/* flush: the section already draws the border and the corners, and a
          second layer of padding around a table puts it on a different left
          edge from every full-width table in the panel. */}
      <AdminSection
        title="Sunucu Susturmaları"
        icon={<AudioOutlined />}
        hint={`${mutes.length} kayıt`}
        flush
      >
        <Table
          dataSource={mutes}
          loading={loading}
          rowKey={(row) => row.userId}
          pagination={false}
          size="small"
          scroll={{ x: "max-content" }}
          className="ct-admin-table-wrap"
          locale={{ emptyText: "Susturulmuş kimse yok." }}
          columns={[
            {
              title: "Kullanıcı",
              key: "username",
              width: 260,
              render: (_value: unknown, row: AdminVoiceMute) => (
                <div className="ct-admin-cell">
                  <strong>@{row.username}</strong>
                  <span className="ct-admin-mono">{row.userId}</span>
                </div>
              ),
            },
            {
              title: "Başlangıç",
              dataIndex: "mutedAt",
              key: "mutedAt",
              width: 180,
              render: (value: string) => new Date(value).toLocaleString("tr-TR"),
            },
            {
              title: "Bitiş",
              key: "expiresAt",
              width: 180,
              render: (_value: unknown, row: AdminVoiceMute) => expiryTag(row.expiresAt),
            },
            {
              title: "İşlem",
              key: "actions",
              width: 160,
              align: "right" as const,
              render: (_value: unknown, row: AdminVoiceMute) => (
                <Popconfirm
                  title={`@${row.username} tekrar konuşabilsin mi?`}
                  onConfirm={() => void handleClearMute(row.userId)}
                  okText="Evet"
                  cancelText="Hayır"
                >
                  <Button type="link" size="small">
                    Susturmayı Kaldır
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </AdminSection>

      <AdminSection
        title="Oda Zaman Aşımları"
        icon={<StopOutlined />}
        hint={`${timeouts.length} kayıt`}
        flush
      >
        <Table
          dataSource={timeouts}
          loading={loading}
          // Composite key: one person can be timed out of several rooms, and the
          // user id alone would collapse those into one row.
          rowKey={(row) => `${row.lobbyId}:${row.userId}`}
          pagination={false}
          size="small"
          scroll={{ x: "max-content" }}
          className="ct-admin-table-wrap"
          locale={{ emptyText: "Zaman aşımı verilmiş kimse yok." }}
          columns={[
            {
              title: "Kullanıcı",
              key: "username",
              width: 260,
              render: (_value: unknown, row: AdminLobbyTimeout) => (
                <div className="ct-admin-cell">
                  <strong>@{row.username}</strong>
                  <span className="ct-admin-mono">{row.userId}</span>
                </div>
              ),
            },
            {
              title: "Oda",
              key: "lobby",
              width: 220,
              render: (_value: unknown, row: AdminLobbyTimeout) => (
                <Tag color="blue">{row.lobbyName}</Tag>
              ),
            },
            {
              title: "Bitiş",
              key: "expiresAt",
              width: 180,
              render: (_value: unknown, row: AdminLobbyTimeout) => expiryTag(row.expiresAt),
            },
            {
              title: "İşlem",
              key: "actions",
              width: 160,
              align: "right" as const,
              render: (_value: unknown, row: AdminLobbyTimeout) => (
                <Popconfirm
                  title="Bu kullanıcının odaya girişi tekrar açılsın mı?"
                  onConfirm={() => void handleClearTimeout(row.lobbyId, row.userId)}
                  okText="Evet"
                  cancelText="Hayır"
                >
                  <Button type="link" size="small">
                    Kaldır
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </AdminSection>
    </div>
  );
}
