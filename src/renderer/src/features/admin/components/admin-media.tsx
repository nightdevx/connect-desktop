import { useCallback, useEffect, useState } from "react";
import { Button, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DisconnectOutlined, ReloadOutlined } from "@ant-design/icons";
import type { AdminLivePublisher } from "@shared/desktop-api-types";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";

export default function AdminMedia() {
  const [publishers, setPublishers] = useState<AdminLivePublisher[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.unwrap(adminService.ops.liveMedia(), "Canlı yayınlar yüklenemedi");
      setPublishers(data.publishers);
    } catch (error) {
      message.error(toErrorMessage(error, "Canlı yayınlar yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 8000);
    return () => clearInterval(interval);
  }, [load]);

  const stopTrack = async (userId: string, kind: "camera" | "screen" | "microphone"): Promise<void> => {
    try {
      await adminService.unwrap(adminService.ops.forceTrackOff({ userId, kind }), "Yayın durdurulamadı");
      message.success("Yayın durduruldu");
      void load();
    } catch (error) {
      message.error(toErrorMessage(error, "Yayın durdurulamadı"));
    }
  };

  const columns: ColumnsType<AdminLivePublisher> = [
    { title: "Oda", dataIndex: "room", width: 200, ellipsis: true },
    {
      title: "Kullanıcı",
      key: "user",
      width: 200,
      render: (_: unknown, row) => row.username || row.userId,
    },
    {
      title: "Açık yayınlar",
      key: "tracks",
      render: (_: unknown, row) => (
        <span className="ct-admin-track-tags">
          {row.microphone && <Tag color="blue">Mikrofon</Tag>}
          {row.camera && <Tag color="green">Kamera</Tag>}
          {row.screen && <Tag color="purple">Ekran</Tag>}
          {!row.microphone && !row.camera && !row.screen && <span className="ct-muted">—</span>}
        </span>
      ),
    },
    {
      title: "İşlem",
      key: "actions",
      width: 340,
      render: (_: unknown, row) => (
        <div className="ct-admin-row-actions">
          <Button size="small" disabled={!row.microphone} onClick={() => void stopTrack(row.userId, "microphone")}>
            Mikrofonu kapat
          </Button>
          <Button size="small" disabled={!row.camera} onClick={() => void stopTrack(row.userId, "camera")}>
            Kamerayı kapat
          </Button>
          <Button size="small" disabled={!row.screen} onClick={() => void stopTrack(row.userId, "screen")}>
            Ekranı kapat
          </Button>
          <Button
            size="small"
            danger
            icon={<DisconnectOutlined />}
            title="Yayından at"
            onClick={async () => {
              try {
                await adminService.unwrap(
                  adminService.ops.disconnectMedia({ userId: row.userId }),
                  "Yayından koparılamadı",
                );
                message.success("Yayından koparıldı");
                void load();
              } catch (error) {
                message.error(toErrorMessage(error, "Yayından koparılamadı"));
              }
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="ct-admin-section">
      <header className="ct-admin-section-header">
        <div>
          <h3>Ses ve Video</h3>
          <p>Şu anda yayında olan herkes. Sekiz saniyede bir kendiliğinden tazelenir.</p>
        </div>
        <div className="ct-admin-section-actions">
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            Yenile
          </Button>
        </div>
      </header>

      <Table
        rowKey={(row) => `${row.room}:${row.userId}`}
        size="small"
        loading={loading}
        dataSource={publishers}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "Şu anda yayında kimse yok." }}
      />
    </div>
  );
}
