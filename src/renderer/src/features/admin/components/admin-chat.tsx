import { useCallback, useEffect, useState } from "react";
import { Button, Input, Modal, Segmented, Select, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EyeInvisibleOutlined, ReloadOutlined } from "@ant-design/icons";
import type {
  AdminAttachmentStats,
  AdminAttachmentSummary,
  AdminChatReport,
  AdminReportStatus,
} from "@shared/desktop-api-types";
import type { ChatMessage } from "@shared/auth-contracts";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";

type Pane = "messages" | "reports" | "attachments";

const PAGE_SIZE = 50;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const askReason = (title: string): Promise<string | null> =>
  new Promise((resolve) => {
    let value = "";
    Modal.confirm({
      title,
      content: (
        <Input.TextArea
          placeholder="Gerekçe (en az 3 karakter)"
          maxLength={280}
          rows={3}
          onChange={(event) => {
            value = event.target.value;
          }}
        />
      ),
      okText: "Uygula",
      cancelText: "Vazgeç",
      onOk: () => {
        if (value.trim().length < 3) {
          message.warning("Gerekçe en az 3 karakter olmalı.");
          return Promise.reject(new Error("reason too short"));
        }
        resolve(value.trim());
        return Promise.resolve();
      },
      onCancel: () => resolve(null),
    });
  });

export default function AdminChat() {
  const [pane, setPane] = useState<Pane>("messages");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [reports, setReports] = useState<AdminChatReport[]>([]);
  const [reportStatus, setReportStatus] = useState<AdminReportStatus>("open");

  const [attachments, setAttachments] = useState<AdminAttachmentSummary[]>([]);
  const [attachmentStats, setAttachmentStats] = useState<AdminAttachmentStats>({ count: 0, totalBytes: 0 });

  const [loading, setLoading] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.unwrap(
        adminService.ops.searchChat({
          q: query.trim() || undefined,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
        "Mesajlar yüklenemedi",
      );
      setMessages(data.messages);
      setMessagesTotal(data.total);
    } catch (error) {
      message.error(toErrorMessage(error, "Mesajlar yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.unwrap(
        adminService.ops.listReports({ status: reportStatus, limit: PAGE_SIZE }),
        "Şikâyetler yüklenemedi",
      );
      setReports(data.reports);
    } catch (error) {
      message.error(toErrorMessage(error, "Şikâyetler yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [reportStatus]);

  const loadAttachments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.unwrap(
        adminService.ops.listAttachments({ limit: PAGE_SIZE }),
        "Ekler yüklenemedi",
      );
      setAttachments(data.attachments);
      setAttachmentStats(data.stats);
    } catch (error) {
      message.error(toErrorMessage(error, "Ekler yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    if (pane === "messages") return loadMessages();
    if (pane === "reports") return loadReports();
    return loadAttachments();
  }, [pane, loadMessages, loadReports, loadAttachments]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (messageId: string): Promise<void> => {
    const reason = await askReason("Mesajı sil");
    if (!reason) return;
    try {
      await adminService.unwrap(adminService.ops.deleteChatMessage({ messageId, reason }), "Mesaj silinemedi");
      message.success("Mesaj silindi");
      void refresh();
    } catch (error) {
      message.error(toErrorMessage(error, "Mesaj silinemedi"));
    }
  };

  const handleRedact = async (messageId: string): Promise<void> => {
    const reason = await askReason("Mesajı karart");
    if (!reason) return;
    try {
      await adminService.unwrap(adminService.ops.redactChatMessage({ messageId, reason }), "Mesaj karartılamadı");
      message.success("Mesaj karartıldı");
      void refresh();
    } catch (error) {
      message.error(toErrorMessage(error, "Mesaj karartılamadı"));
    }
  };

  const messageColumns: ColumnsType<ChatMessage> = [
    {
      title: "Zaman",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => new Date(value).toLocaleString("tr-TR"),
    },
    { title: "Kanal", dataIndex: "channel", width: 200, ellipsis: true },
    { title: "Gönderen", dataIndex: "username", width: 150 },
    { title: "Mesaj", dataIndex: "body", ellipsis: true },
    {
      title: "İşlem",
      key: "actions",
      width: 130,
      render: (_: unknown, row) => (
        <div className="ct-admin-row-actions">
          <Button
            size="small"
            icon={<EyeInvisibleOutlined />}
            title="Karart"
            onClick={() => void handleRedact(row.id)}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            title="Sil"
            onClick={() => void handleDelete(row.id)}
          />
        </div>
      ),
    },
  ];

  const reportColumns: ColumnsType<AdminChatReport> = [
    {
      title: "Zaman",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => new Date(value).toLocaleString("tr-TR"),
    },
    { title: "Bildiren", dataIndex: "reporterName", width: 150 },
    { title: "Kanal", dataIndex: "channel", width: 190, ellipsis: true },
    { title: "Gerekçe", dataIndex: "reason", ellipsis: true },
    {
      title: "Durum",
      dataIndex: "status",
      width: 110,
      render: (value: AdminReportStatus) => (
        <Tag color={value === "open" ? "orange" : value === "resolved" ? "green" : "default"}>{value}</Tag>
      ),
    },
    {
      title: "İşlem",
      key: "actions",
      width: 210,
      render: (_: unknown, row) => (
        <div className="ct-admin-row-actions">
          <Button size="small" onClick={() => void handleRedact(row.messageId)}>
            Karart
          </Button>
          <Button size="small" danger onClick={() => void handleDelete(row.messageId)}>
            Sil
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={async () => {
              try {
                await adminService.unwrap(
                  adminService.ops.updateReport({ reportId: row.id, status: "resolved" }),
                  "Şikâyet güncellenemedi",
                );
                message.success("Şikâyet kapatıldı");
                void refresh();
              } catch (error) {
                message.error(toErrorMessage(error, "Şikâyet güncellenemedi"));
              }
            }}
          >
            Kapat
          </Button>
        </div>
      ),
    },
  ];

  const attachmentColumns: ColumnsType<AdminAttachmentSummary> = [
    {
      title: "Zaman",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? new Date(value).toLocaleString("tr-TR") : "—"),
    },
    { title: "Dosya", dataIndex: "name", ellipsis: true },
    { title: "Tür", dataIndex: "mimeType", width: 150 },
    {
      title: "Boyut",
      dataIndex: "size",
      width: 100,
      render: (value: number) => formatBytes(value),
    },
    { title: "Yükleyen", dataIndex: "username", width: 150 },
    {
      title: "İşlem",
      key: "actions",
      width: 90,
      render: (_: unknown, row) => (
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={async () => {
            const reason = await askReason("Eki sil");
            if (!reason) return;
            try {
              await adminService.unwrap(
                adminService.ops.deleteAttachment({ attachmentId: row.id, reason }),
                "Ek silinemedi",
              );
              message.success("Ek silindi");
              void refresh();
            } catch (error) {
              message.error(toErrorMessage(error, "Ek silinemedi"));
            }
          }}
        />
      ),
    },
  ];

  return (
    <div className="ct-admin-section">
      <header className="ct-admin-section-header">
        <div>
          <h3>Sohbet Moderasyonu</h3>
          <p>
            Oda mesajları, şikâyet kuyruğu ve ek dosyalar. Özel mesajlar yalnızca bir şikâyetle
            buraya düşer.
          </p>
        </div>
        <div className="ct-admin-section-actions">
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>
            Yenile
          </Button>
        </div>
      </header>

      <Segmented
        value={pane}
        onChange={(value) => setPane(value as Pane)}
        options={[
          { value: "messages", label: "Mesajlar" },
          { value: "reports", label: "Şikâyetler" },
          { value: "attachments", label: `Ekler (${formatBytes(attachmentStats.totalBytes)})` },
        ]}
      />

      {pane === "messages" && (
        <>
          <div className="ct-admin-filters">
            <Input.Search
              placeholder="Mesaj içinde ara"
              allowClear
              onSearch={(value) => {
                setPage(1);
                setQuery(value);
              }}
              style={{ maxWidth: 320 }}
            />
          </div>
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={messages}
            columns={messageColumns}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: messagesTotal,
              showSizeChanger: false,
              onChange: setPage,
            }}
          />
        </>
      )}

      {pane === "reports" && (
        <>
          <div className="ct-admin-filters">
            <Select
              value={reportStatus}
              onChange={(value) => setReportStatus(value)}
              style={{ width: 180 }}
              options={[
                { value: "open", label: "Açık" },
                { value: "resolved", label: "Kapatılmış" },
                { value: "rejected", label: "Reddedilmiş" },
              ]}
            />
          </div>
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={reports}
            columns={reportColumns}
            pagination={false}
          />
        </>
      )}

      {pane === "attachments" && (
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={attachments}
          columns={attachmentColumns}
          pagination={false}
        />
      )}
    </div>
  );
}
