import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "./admin-primitives";
import { Button, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DisconnectOutlined, ReloadOutlined } from "@ant-design/icons";
import type { AdminLivePublisher } from "@shared/desktop-api-types";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";
import { toast } from "@/services/toast";

export default function AdminMedia() {
  const [publishers, setPublishers] = useState<AdminLivePublisher[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.unwrap(adminService.ops.liveMedia(), "Canlı yayınlar yüklenemedi");
      setPublishers(data.publishers);
    } catch (error) {
      toast.error(toErrorMessage(error, "Canlı yayınlar yüklenemedi"));
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
      toast.success("Yayın durduruldu");
      void load();
    } catch (error) {
      toast.error(toErrorMessage(error, "Yayın durdurulamadı"));
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
          {row.microphone && <Tag className="ct-tag info">Mikrofon</Tag>}
          {row.camera && <Tag className="ct-tag success">Kamera</Tag>}
          {row.screen && <Tag className="ct-tag info">Ekran</Tag>}
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
                toast.success("Yayından koparıldı");
                void load();
              } catch (error) {
                toast.error(toErrorMessage(error, "Yayından koparılamadı"));
              }
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Ses ve Video"
        description={"Şu anda yayında olan herkes. Sekiz saniyede bir kendiliğinden tazelenir."}
        actions={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Yenile
            </Button>
          </>
        }
      />

      <div className="ct-admin-table-wrap">
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
    </div>
  );
}
