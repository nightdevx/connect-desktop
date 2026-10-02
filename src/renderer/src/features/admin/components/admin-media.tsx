import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader, AdminPerson, AdminSection, AdminState } from "./admin-primitives";
import { Button, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AudioMutedOutlined,
  AudioOutlined,
  DesktopOutlined,
  DisconnectOutlined,
  ReloadOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
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
    {
      title: "Kullanıcı",
      key: "user",
      ellipsis: true,
      render: (_: unknown, row) => (
        <AdminPerson userId={row.userId} name={row.username || row.userId} handle={row.room} />
      ),
    },
    {
      title: "Açık yayınlar",
      key: "tracks",
      width: 220,
      render: (_: unknown, row) => (
        <span className="ct-admin-states">
          {row.microphone && (
            <AdminState tone="ok" icon={<AudioOutlined />}>
              Mikrofon
            </AdminState>
          )}
          {row.camera && (
            <AdminState tone="info" icon={<VideoCameraOutlined />}>
              Kamera
            </AdminState>
          )}
          {row.screen && (
            <AdminState tone="info" icon={<DesktopOutlined />}>
              Ekran
            </AdminState>
          )}
          {!row.microphone && !row.camera && !row.screen && <span className="ct-muted">—</span>}
        </span>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 168,
      align: "right" as const,
      render: (_: unknown, row) => (
        <div className="ct-admin-actions">
          <Tooltip title="Mikrofonu kapat">
            <Button
              type="text"
              icon={<AudioMutedOutlined />}
              disabled={!row.microphone}
              aria-label="Mikrofonu kapat"
              onClick={() => void stopTrack(row.userId, "microphone")}
            />
          </Tooltip>
          <Tooltip title="Kamerayı kapat">
            <Button
              type="text"
              icon={<VideoCameraOutlined />}
              disabled={!row.camera}
              aria-label="Kamerayı kapat"
              onClick={() => void stopTrack(row.userId, "camera")}
            />
          </Tooltip>
          <Tooltip title="Ekran paylaşımını kapat">
            <Button
              type="text"
              icon={<DesktopOutlined />}
              disabled={!row.screen}
              aria-label="Ekran paylaşımını kapat"
              onClick={() => void stopTrack(row.userId, "screen")}
            />
          </Tooltip>
          <Button
            type="text"
            danger
            icon={<DisconnectOutlined />}
            title="Yayından at"
            aria-label="Yayından at"
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
        title="Canlı Yayınlar"
        description="Şu anda mikrofonu, kamerası ya da ekranı yayında olan herkes. Sekiz saniyede bir yenilenir."
        actions={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Yenile
            </Button>
          </>
        }
      />

      <AdminSection
        title="Yayında olanlar"
        icon={<VideoCameraOutlined />}
        hint={`${publishers.length} kişi`}
        flush
      >
        <Table
          rowKey={(row) => `${row.room}:${row.userId}`}
          size="small"
          loading={loading}
          dataSource={publishers}
          columns={columns}
          pagination={false}
          tableLayout="fixed"
          className="ct-admin-table-wrap"
          locale={{ emptyText: "Şu anda yayında kimse yok." }}
        />
      </AdminSection>
    </div>
  );
}
