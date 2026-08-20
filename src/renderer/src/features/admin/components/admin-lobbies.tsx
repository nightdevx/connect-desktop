import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useState } from "react";
import {
  Table,
  Button,
  Space,
  message,
  Tag,
  Avatar,
  Modal,
  Form,
  Input,
  Popconfirm,
  Select,
  Switch,
  Tooltip,
} from "antd";
import type { TablePaginationConfig } from "antd";
import {
  HomeOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  AudioMutedOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  DesktopOutlined,
  SearchOutlined,
  StopOutlined,
  LockOutlined,
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import type {
  AdminLobbyMember,
  AdminLobbySnapshot,
  AdminUserDetail,
  LobbyTimeout,
} from "@shared/auth-contracts";
import { AdminPageHeader } from "./admin-primitives";

interface EditLobbyFormValues {
  name: string;
  isLocked?: boolean;
  allowedUsers?: string[];
}


// antd hands the pagination object back with every field optional; this is what
// a page-size reset falls back to.
const DEFAULT_PAGE_SIZE = 10;

export default function AdminLobbies() {
  const [lobbies, setLobbies] = useState<AdminLobbySnapshot[]>([]);
  // The lobby whose timeouts are open, and what they are. Held here rather than
  // fetched with the table: a timeout list is read when somebody asks to be let
  // back in, which is rare, and loading one per row on every refresh would be a
  // request per lobby for a panel nobody had opened.
  const [timeoutLobby, setTimeoutLobby] = useState<AdminLobbySnapshot | null>(null);
  const [timeouts, setTimeouts] = useState<LobbyTimeout[]>([]);
  const [timeoutsLoading, setTimeoutsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [lockedFilter, setLockedFilter] = useState("all");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingLobby, setEditingLobby] = useState<AdminLobbySnapshot | null>(null);
  const [editForm] = Form.useForm();
  const [allUsers, setAllUsers] = useState<AdminUserDetail[]>([]);

  const fetchLobbies = useCallback(
    async (page = currentPage, size = pageSize): Promise<void> => {
    try {
      setLoading(true);
      const offset = (page - 1) * size;
      const res = await adminService.listLobbies({
        // The debounced value, not the live one: the effect that calls this is
        // keyed on the debounced value, so reading the raw box made the two
        // disagree for one render on every keystroke.
        search: debouncedSearchText || undefined,
        locked: lockedFilter !== "all" ? lockedFilter : undefined,
        limit: size,
        offset,
      });
      setLobbies(res.lobbies);
      setTotal(res.total || 0);
    } catch (err) {
      message.error(toErrorMessage(err, "Lobiler alınamadı"));
    } finally {
      setLoading(false);
    }
    },
    [currentPage, pageSize, debouncedSearchText, lockedFilter],
  );

  // The allow-list picker's options. This is the whole user table — avatars
  // included — so it is fetched when the edit dialog first opens, not when the
  // page loads: most visits to this screen never open it at all.
  const loadAllowListOptions = async () => {
    if (allUsers.length > 0) {
      return;
    }

    try {
      const res = await adminService.listUsers();
      setAllUsers(res.users);
    } catch (err) {
      console.error("Kullanıcılar alınamadı", err);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchText]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchText, lockedFilter]);

  // One effect owns the fetching. The filter effect used to fetch page 1 and
  // this one fetched again a render later, so every filter change issued two
  // requests and flashed the table's loading state twice.
  useEffect(() => {
    fetchLobbies(currentPage, pageSize);
    const interval = setInterval(() => fetchLobbies(currentPage, pageSize), 4000);
    return () => clearInterval(interval);
    // fetchLobbies is memoised on the debounced search and the lock filter, so
    // this re-runs on the same changes as before — and the 4s poll can no longer
    // keep firing a closure built from filters the user has already changed.
  }, [currentPage, pageSize, fetchLobbies]);

  const handleTableChange = (pagination: TablePaginationConfig): void => {
    setCurrentPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? DEFAULT_PAGE_SIZE);
  };

  const handleEditClick = (record: AdminLobbySnapshot) => {
    void loadAllowListOptions();
    setEditingLobby(record);
    editForm.setFieldsValue({
      name: record.lobby.name,
      isLocked: record.lobby.isLocked,
      allowedUsers: record.lobby.allowedUsers ? record.lobby.allowedUsers.split(",").filter(Boolean) : [],
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (values: EditLobbyFormValues): Promise<void> => {
    if (!editingLobby) return;
    try {
      const res = await window.desktopApi.updateLobby({
        lobbyId: editingLobby.lobby.id,
        name: values.name,
        isLocked: values.isLocked,
        allowedUsers: values.allowedUsers || [],
      });
      if (res.ok) {
        message.success("Oda güncellendi");
        setIsEditOpen(false);
        fetchLobbies();
      } else {
        throw new Error(toErrorMessage(res.error, "Güncelleme başarısız"));
      }
    } catch (err) {
      message.error(toErrorMessage(err, "İşlem başarısız"));
    }
  };

  const handleDeleteLobby = async (lobbyId: string) => {
    try {
      const res = await window.desktopApi.deleteLobby({ lobbyId });
      if (res.ok) {
        message.success("Oda silindi");
        fetchLobbies();
      } else {
        throw new Error(toErrorMessage(res.error, "Silme işlemi başarısız"));
      }
    } catch (err) {
      message.error(toErrorMessage(err, "İşlem başarısız"));
    }
  };

  const handleKickUser = async (lobbyId: string, userId: string) => {
    try {
      await adminService.kickUser(lobbyId, userId);
      message.success("Kullanıcı odadan atıldı");
      fetchLobbies();
    } catch (err) {
      message.error(toErrorMessage(err, "Kullanıcı odadan atılamadı"));
    }
  };

  const openTimeouts = async (record: AdminLobbySnapshot): Promise<void> => {
    setTimeoutLobby(record);
    setTimeoutsLoading(true);
    try {
      setTimeouts(await adminService.listLobbyTimeouts(record.lobby.id));
    } catch (error) {
      message.error(toErrorMessage(error, "Zaman aşımları yüklenemedi"));
      setTimeouts([]);
    } finally {
      setTimeoutsLoading(false);
    }
  };

  const handleClearTimeout = async (userId: string): Promise<void> => {
    if (!timeoutLobby) {
      return;
    }
    try {
      await adminService.clearLobbyTimeout(timeoutLobby.lobby.id, userId);
      // Refetched rather than filtered locally: the server also drops timeouts
      // that lapsed on their own, and a local splice would leave those on screen.
      setTimeouts(await adminService.listLobbyTimeouts(timeoutLobby.lobby.id));
      message.success("Zaman aşımı kaldırıldı.");
    } catch (error) {
      message.error(toErrorMessage(error, "Zaman aşımı kaldırılamadı"));
    }
  };

  const columns = [
    {
      title: "Oda",
      key: "lobby",
      width: 300,
      render: (_value: unknown, record: AdminLobbySnapshot) => (
        <div className="ct-admin-table-user">
          <HomeOutlined className="ct-admin-muted" />
          <div className="ct-admin-cell">
            {/* strong/span, not bare divs: .ct-admin-table-user styles those two
                and nothing else, so the name used to render at the table's
                default weight with the id at the same size beneath it. */}
            <strong>{record.lobby.name}</strong>
            <span className="ct-admin-mono">{record.lobby.id}</span>
          </div>
          {record.lobby.isLocked ? (
            <Tooltip title="Kilitli oda — yalnızca izin verilenler girebilir">
              <LockOutlined className="ct-icon-warning" />
            </Tooltip>
          ) : null}
        </div>
      ),
    },
    {
      title: "Oluşturan",
      key: "createdBy",
      width: 160,
      render: (_value: unknown, record: AdminLobbySnapshot) => {
        const username = record.lobby.createdByUsername || record.lobby.createdBy;
        return <Tag color="blue">@{username}</Tag>;
      },
    },
    {
      title: "Üye Sayısı",
      dataIndex: "size",
      key: "size",
      width: 130,
      render: (size: number) => (
        <Tag color={size > 0 ? "green" : "default"}>{size} aktif üye</Tag>
      ),
    },
    {
      title: "Kurulma Tarihi",
      dataIndex: ["lobby", "createdAt"],
      key: "createdAt",
      width: 170,
      render: (date: string) => new Date(date).toLocaleString("tr-TR"),
    },
    {
      title: "İşlemler",
      key: "actions",
      width: 130,
      align: "right" as const,
      render: (_value: unknown, record: AdminLobbySnapshot) => (
        <div className="ct-admin-actions">
          <Tooltip title="Yetkileri düzenle">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditClick(record)}
              className="ct-icon-info"
            />
          </Tooltip>
          <Tooltip title="Zaman aşımları">
            <Button
              type="text"
              icon={<StopOutlined />}
              onClick={() => void openTimeouts(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Odayı silmek istediğinize emin misiniz? Tüm katılımcıların bağlantısı kesilecektir."
            onConfirm={() => handleDeleteLobby(record.lobby.id)}
            okText="Evet"
            cancelText="Hayır"
          >
            <Tooltip title="Odayı sil">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </div>
      ),
    },
  ];

  // Render sub table listing live participants in a lobby
  const expandedRowRender = (record: AdminLobbySnapshot) => {
    if (record.members.length === 0) {
      return (
        <div className="ct-admin-empty">
          Odada şu anda kimse yok.
        </div>
      );
    }

    const memberColumns = [
      {
        title: "Kullanıcı Adı",
        dataIndex: "username",
        key: "username",
        render: (username: string) => (
          <div className="ct-admin-table-user">
            <Avatar size="small" className="ct-admin-avatar">
              {username[0]?.toUpperCase()}
            </Avatar>
            <strong>@{username}</strong>
          </div>
        ),
      },
      {
        title: "Giriş Saati",
        dataIndex: "joinedAt",
        key: "joinedAt",
        render: (date: string) => new Date(date).toLocaleTimeString("tr-TR"),
      },
      {
        title: "Ses / Mikrofon",
        key: "audioStatus",
        render: (_value: unknown, member: AdminLobbyMember) => (
          <Space size={4} wrap>
            {member.muted ? (
              <Tag color="red" icon={<AudioMutedOutlined />}>
                Sessiz
              </Tag>
            ) : (
              <Tag color="green" icon={<SoundOutlined />}>
                Ses açık
              </Tag>
            )}
            {member.deafened && (
              <Tag color="volcano">Sağırlaştırılmış</Tag>
            )}
          </Space>
        ),
      },
      {
        title: "Kamera / Ekran",
        key: "mediaStatus",
        render: (_value: unknown, member: AdminLobbyMember) => (
          <Space size={4} wrap>
            {member.cameraEnabled ? (
              <Tag color="purple" icon={<VideoCameraOutlined />}>
                Kamera açık
              </Tag>
            ) : (
              <Tag color="default">Kamera kapalı</Tag>
            )}
            {member.screenSharing ? (
              <Tag color="cyan" icon={<DesktopOutlined />}>
                Ekran paylaşıyor
              </Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: "İşlemler",
        key: "actions",
        align: "right" as const,
        render: (_value: unknown, member: AdminLobbyMember) => (
          <Popconfirm
            title="Kullanıcıyı odadan atmak istediğinize emin misiniz?"
            onConfirm={() => handleKickUser(record.lobby.id, member.userId)}
            okText="Evet"
            cancelText="Hayır"
          >
            <Button type="link" danger size="small">
              Odadan At
            </Button>
          </Popconfirm>
        ),
      },
    ];

    // No nested ConfigProvider. It pinned theme.darkAlgorithm and a literal
    // header background, so the participant list stayed dark inside a light
    // page — and the wrapper was .ct-admin-empty, the "nobody is here" message,
    // which rendered a live table in muted text at that message's padding.
    return (
      <div className="ct-admin-subtable">
        <Table
          columns={memberColumns}
          dataSource={record.members}
          rowKey="userId"
          pagination={false}
          size="small"
          scroll={{ x: "max-content" }}
          className="ct-admin-table-wrap"
        />
      </div>
    );
  };

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Odalar"
        description="Sistemdeki tüm sesli görüşme odalarını ve katılımcılarını anlık izleyin. Liste 4 saniyede bir yenilenir."
        actions={
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => fetchLobbies()}
          >
            Yenile
          </Button>
        }
      />

      {/* Filters Bar */}
      <div className="ct-admin-toolbar">
        <Input
          allowClear
          placeholder="Oda adı, ID veya oluşturan ara..."
          prefix={<SearchOutlined className="ct-admin-muted" />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="ct-admin-toolbar-search"
        />

        <Select
          value={lockedFilter}
          onChange={setLockedFilter}
          className="ct-admin-toolbar-filter"
          options={[
            { value: "all", label: "Tüm Odalar" },
            { value: "true", label: "Kilitli Odalar" },
            { value: "false", label: "Açık Odalar" },
          ]}
        />
      </div>

      <Table
        dataSource={lobbies}
        columns={columns}
        rowKey={(record) => record.lobby.id}
        loading={loading}
        expandable={{ expandedRowRender, defaultExpandAllRows: true }}
        onChange={handleTableChange}
        locale={{
          emptyText: searchText
            ? "Bu aramayla eşleşen oda yok."
            : "Şu anda açık oda yok.",
        }}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (count) => `${count} oda`,
        }}
        // See admin-users: a viewport height for a table that is not the
        // viewport clipped the last row and hid the pagination. The page
        // scrolls instead.
        scroll={{ x: "max-content" }}
        className="ct-admin-table-wrap"
      />

      {/* The one place a timeout can be lifted. A moderator sets them from the
          lobby, where the person is in front of them; by the time one needs
          undoing they are not in the room to right-click. */}
      <Modal
        rootClassName="ct-modal"
        title={timeoutLobby ? `Zaman Aşımları — ${timeoutLobby.lobby.name}` : "Zaman Aşımları"}
        open={timeoutLobby !== null}
        onCancel={() => setTimeoutLobby(null)}
        footer={null}
        destroyOnHidden
      >
        <Table
          dataSource={timeouts}
          loading={timeoutsLoading}
          rowKey={(row) => row.userId}
          pagination={false}
          size="small"
          locale={{ emptyText: "Bu odada zaman aşımı verilmiş kimse yok." }}
          className="ct-admin-table-wrap"
          columns={[
            {
              title: "Kullanıcı",
              dataIndex: "userId",
              key: "userId",
              render: (userId: string) => (
                <span className="ct-admin-mono">{userId}</span>
              ),
            },
            {
              title: "Bitiş",
              key: "expiresAt",
              render: (_value: unknown, row: LobbyTimeout) =>
                row.expiresAt ? (
                  <Tag color="orange">{new Date(row.expiresAt).toLocaleString("tr-TR")}</Tag>
                ) : (
                  <Tag color="red">Süresiz</Tag>
                ),
            },
            {
              title: "İşlem",
              key: "actions",
              align: "right" as const,
              render: (_value: unknown, row: LobbyTimeout) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => void handleClearTimeout(row.userId)}
                >
                  Kaldır
                </Button>
              ),
            },
          ]}
        />
      </Modal>

      {/* Edit Name Modal */}
      <Modal
        rootClassName="ct-modal"
        title="Oda Yetkilerini Düzenle"
        open={isEditOpen}
        onCancel={() => setIsEditOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsEditOpen(false)}>
            İptal
          </Button>,
          <Button key="submit" type="primary" onClick={() => editForm.submit()}>
            Güncelle
          </Button>,
        ]}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item
            name="name"
            label="Oda Adı"
            rules={[
              { required: true, message: "Oda adı girilmelidir" },
              { min: 2, message: "En az 2 karakter olmalıdır" },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="isLocked"
            valuePropName="checked"
            label="Kilitli Oda"
            extra="Kilitliyken yalnızca aşağıdaki listedeki kullanıcılar ve odayı kuran kişi girebilir."
          >
            <Switch />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.isLocked !== currentValues.isLocked}>
            {({ getFieldValue }) => {
              const isLocked = getFieldValue("isLocked");
              return isLocked ? (
                <Form.Item name="allowedUsers" label="İzin Verilen Kullanıcılar">
                  <Select
                    mode="multiple"
                    placeholder="Kullanıcıları seçin..."
                    options={allUsers
                      .filter((u) => u.id !== editingLobby?.lobby.createdBy)
                      .map((u) => ({
                        label: `@${u.username} (${u.displayName})`,
                        value: u.id,
                      }))}
                  />
                </Form.Item>
              ) : null;
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
