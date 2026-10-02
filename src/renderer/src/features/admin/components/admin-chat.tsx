import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader, AdminSection, AdminState, adminDateTime } from "./admin-primitives";
import { Button, Input, Modal, Segmented, Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";
import {
  DeleteOutlined,
  EyeInvisibleOutlined,
  FlagOutlined,
  MessageOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type {
  AdminAttachmentStats,
  AdminAttachmentSummary,
  AdminChatReport,
  AdminReportStatus,
} from "@shared/desktop-api-types";
import type { ChatMessage } from "@shared/auth-contracts";
import { toErrorMessage } from "@shared/error-message";
import { adminService } from "../services/admin-service";
import { toast } from "@/services/toast";
import { ModalHeading } from "@/ui/modal-heading";

type Pane = "messages" | "reports" | "attachments";

const PAGE_SIZE = 50;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type ModalApi = ReturnType<typeof Modal.useModal>[0];

const askReason = (
  modal: ModalApi,
  title: string,
  icon: ReactNode = <DeleteOutlined />,
): Promise<string | null> =>
  new Promise((resolve) => {
    let value = "";
    modal.confirm({
      rootClassName: "ct-modal danger",
      icon: null,
      title: (
        <ModalHeading
          tone="danger"
          icon={icon}
          title={title}
          description="İşlem kayda geçer; gerekçesi denetim günlüğünde görünür."
        />
      ),
      okButtonProps: { danger: true },
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
          toast.warning("Gerekçe en az 3 karakter olmalı.");
          return Promise.reject(new Error("reason too short"));
        }
        resolve(value.trim());
        return Promise.resolve();
      },
      onCancel: () => resolve(null),
    });
  });

export default function AdminChat() {
  const [modal, modalHolder] = Modal.useModal();
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
      toast.error(toErrorMessage(error, "Mesajlar yüklenemedi"));
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
      toast.error(toErrorMessage(error, "Şikâyetler yüklenemedi"));
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
      toast.error(toErrorMessage(error, "Ekler yüklenemedi"));
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
    const reason = await askReason(modal, "Mesajı sil");
    if (!reason) return;
    try {
      await adminService.unwrap(adminService.ops.deleteChatMessage({ messageId, reason }), "Mesaj silinemedi");
      toast.success("Mesaj silindi");
      void refresh();
    } catch (error) {
      toast.error(toErrorMessage(error, "Mesaj silinemedi"));
    }
  };

  const handleRedact = async (messageId: string): Promise<void> => {
    const reason = await askReason(modal, "Mesajı karart", <EyeInvisibleOutlined />);
    if (!reason) return;
    try {
      await adminService.unwrap(adminService.ops.redactChatMessage({ messageId, reason }), "Mesaj karartılamadı");
      toast.success("Mesaj karartıldı");
      void refresh();
    } catch (error) {
      toast.error(toErrorMessage(error, "Mesaj karartılamadı"));
    }
  };

  const messageColumns: ColumnsType<ChatMessage> = [
    {
      title: "Zaman",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="ct-admin-muted">{adminDateTime(value)}</span>,
    },
    {
      title: "Kanal",
      dataIndex: "channel",
      width: 170,
      ellipsis: true,
      responsive: ["lg"],
      render: (value: string) => <span className="ct-admin-mono">{value}</span>,
    },
    {
      title: "Gönderen",
      dataIndex: "username",
      width: 130,
      ellipsis: true,
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: "Mesaj", dataIndex: "body", ellipsis: true },
    {
      title: "",
      key: "actions",
      width: 96,
      align: "right",
      render: (_: unknown, row) => (
        <div className="ct-admin-actions">
          <Button
            type="text"
            icon={<EyeInvisibleOutlined />}
            title="Karart"
            onClick={() => void handleRedact(row.id)}
          />
          <Button
            type="text"
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
      width: 150,
      render: (value: string) => <span className="ct-admin-muted">{adminDateTime(value)}</span>,
    },
    {
      title: "Bildiren",
      dataIndex: "reporterName",
      width: 130,
      ellipsis: true,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "Kanal",
      dataIndex: "channel",
      width: 170,
      ellipsis: true,
      responsive: ["lg"],
      render: (value: string) => <span className="ct-admin-mono">{value}</span>,
    },
    { title: "Gerekçe", dataIndex: "reason", ellipsis: true },
    {
      title: "Durum",
      dataIndex: "status",
      width: 110,
      render: (value: AdminReportStatus) => (
        <AdminState tone={value === "open" ? "warn" : value === "resolved" ? "ok" : "muted"}>
          {value === "open" ? "Açık" : value === "resolved" ? "Kapatıldı" : "Reddedildi"}
        </AdminState>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 210,
      align: "right",
      render: (_: unknown, row) => (
        <div className="ct-admin-actions">
          <Button size="small" type="text" onClick={() => void handleRedact(row.messageId)}>
            Karart
          </Button>
          <Button size="small" type="text" danger onClick={() => void handleDelete(row.messageId)}>
            Sil
          </Button>
          <Button
            size="small"
            onClick={async () => {
              try {
                await adminService.unwrap(
                  adminService.ops.updateReport({ reportId: row.id, status: "resolved" }),
                  "Şikâyet güncellenemedi",
                );
                toast.success("Şikâyet kapatıldı");
                void refresh();
              } catch (error) {
                toast.error(toErrorMessage(error, "Şikâyet güncellenemedi"));
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
      width: 150,
      render: (value: string) => <span className="ct-admin-muted">{adminDateTime(value)}</span>,
    },
    {
      title: "Dosya",
      dataIndex: "name",
      ellipsis: true,
      render: (value: string) => (
        <span className="ct-admin-inline">
          <PaperClipOutlined className="ct-admin-muted" />
          <strong className="ct-admin-ellipsis">{value}</strong>
        </span>
      ),
    },
    {
      title: "Tür",
      dataIndex: "mimeType",
      width: 140,
      ellipsis: true,
      responsive: ["lg"],
      render: (value: string) => <span className="ct-admin-mono">{value}</span>,
    },
    {
      title: "Boyut",
      dataIndex: "size",
      width: 90,
      align: "right",
      render: (value: number) => formatBytes(value),
    },
    { title: "Yükleyen", dataIndex: "username", width: 130, ellipsis: true },
    {
      title: "",
      key: "actions",
      width: 64,
      align: "right",
      render: (_: unknown, row) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={async () => {
            const reason = await askReason(modal, "Eki sil");
            if (!reason) return;
            try {
              await adminService.unwrap(
                adminService.ops.deleteAttachment({ attachmentId: row.id, reason }),
                "Ek silinemedi",
              );
              toast.success("Ek silindi");
              void refresh();
            } catch (error) {
              toast.error(toErrorMessage(error, "Ek silinemedi"));
            }
          }}
        />
      ),
    },
  ];

  return (
    <div className="ct-admin-page">
      {modalHolder}
      <AdminPageHeader
        title="Sohbet Moderasyonu"
        description={"Oda mesajları, şikâyet kuyruğu ve ek dosyalar. Özel mesajlar yalnızca bir şikâyetle buraya düşer."}
        actions={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>
              Yenile
            </Button>
          </>
        }
      />

      <Segmented
        value={pane}
        onChange={(value) => setPane(value as Pane)}
        className="ct-segmented-premium"
        options={[
          { value: "messages", label: "Mesajlar" },
          { value: "reports", label: "Şikâyetler" },
          { value: "attachments", label: `Ekler (${formatBytes(attachmentStats.totalBytes)})` },
        ]}
      />

      {pane === "messages" && (
        <AdminSection
          title="Oda mesajları"
          icon={<MessageOutlined />}
          hint={`${messagesTotal} mesaj`}
          flush
          toolbar={
            <Input.Search
              placeholder="Mesaj içinde ara"
              allowClear
              prefix={<SearchOutlined className="ct-admin-muted" />}
              onSearch={(value) => {
                setPage(1);
                setQuery(value);
              }}
              className="ct-admin-toolbar-search"
            />
          }
        >
          <Table
            tableLayout="fixed"
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={messages}
            columns={messageColumns}
            className="ct-admin-table-wrap"
            locale={{ emptyText: "Mesaj yok." }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: messagesTotal,
              showSizeChanger: false,
              onChange: setPage,
            }}
          />
        </AdminSection>
      )}

      {pane === "reports" && (
        <AdminSection
          title="Şikâyetler"
          icon={<FlagOutlined />}
          hint={`${reports.length} şikâyet`}
          flush
          toolbar={
            <Select
              value={reportStatus}
              onChange={(value) => setReportStatus(value)}
              className="ct-admin-toolbar-filter"
              options={[
                { value: "open", label: "Açık" },
                { value: "resolved", label: "Kapatılmış" },
                { value: "rejected", label: "Reddedilmiş" },
              ]}
            />
          }
        >
          <Table
            tableLayout="fixed"
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={reports}
            columns={reportColumns}
            pagination={false}
            className="ct-admin-table-wrap"
            locale={{ emptyText: "Bu durumda şikâyet yok." }}
          />
        </AdminSection>
      )}

      {pane === "attachments" && (
        <AdminSection
          title="Ek dosyalar"
          icon={<PaperClipOutlined />}
          hint={`${attachmentStats.count} dosya · ${formatBytes(attachmentStats.totalBytes)}`}
          flush
        >
          <Table
            tableLayout="fixed"
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={attachments}
            columns={attachmentColumns}
            pagination={false}
            className="ct-admin-table-wrap"
            locale={{ emptyText: "Ek dosya yok." }}
          />
        </AdminSection>
      )}
    </div>
  );
}
