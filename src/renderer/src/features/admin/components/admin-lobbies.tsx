import { useEffect, useState } from "react";
import { Table, Button, Space, message, Tag, Avatar, Modal, Form, Input, Popconfirm, Select, Switch } from "antd";
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
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminLobbySnapshot } from "@shared/auth-contracts";

export default function AdminLobbies() {
  const [lobbies, setLobbies] = useState<AdminLobbySnapshot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [lockedFilter, setLockedFilter] = useState("all");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Edit State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingLobby, setEditingLobby] = useState<AdminLobbySnapshot | null>(null);
  const [editForm] = Form.useForm();
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const fetchLobbies = async (page = currentPage, size = pageSize) => {
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
    } catch (err: any) {
      message.error(err.message || "Lobiler alınamadı");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
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

  // Only the edit dialog's allow-list needs the user directory, and it does not
  // change with a filter. It used to be refetched on every keystroke.
  useEffect(() => {
    fetchUsers();
  }, []);

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
  }, [currentPage, pageSize, debouncedSearchText, lockedFilter]);

  const handleTableChange = (pagination: any) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  const handleEditClick = (record: AdminLobbySnapshot) => {
    setEditingLobby(record);
    editForm.setFieldsValue({
      name: record.lobby.name,
      isLocked: record.lobby.isLocked,
      allowedUsers: record.lobby.allowedUsers ? record.lobby.allowedUsers.split(",").filter(Boolean) : [],
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (values: any) => {
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
        throw new Error(res.error?.message || "Güncelleme başarısız");
      }
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDeleteLobby = async (lobbyId: string) => {
    try {
      const res = await window.desktopApi.deleteLobby({ lobbyId });
      if (res.ok) {
        message.success("Oda silindi");
        fetchLobbies();
      } else {
        throw new Error(res.error?.message || "Silme işlemi başarısız");
      }
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleKickUser = async (lobbyId: string, userId: string) => {
    try {
      await adminService.kickUser(lobbyId, userId);
      message.success("Kullanıcı odadan atıldı");
      fetchLobbies();
    } catch (err: any) {
      message.error(err.message || "Kullanıcı odadan atılamadı");
    }
  };

  const columns = [
    {
      title: "Oda Bilgisi",
      key: "lobby",
      render: (_: any, record: AdminLobbySnapshot) => (
        <div className="ct-admin-table-user">
          <HomeOutlined className="ct-admin-muted" />
          <div>
            {/* strong/span, not bare divs: .ct-admin-table-user styles those two
                and nothing else, so the name used to render at the table's
                default weight with the id at the same size beneath it. */}
            <strong>{record.lobby.name}</strong>
            <span>ID: {record.lobby.id}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Oluşturan",
      key: "createdBy",
      render: (_: any, record: AdminLobbySnapshot) => {
        const username = record.lobby.createdByUsername || record.lobby.createdBy;
        return <Tag color="blue">@{username}</Tag>;
      },
    },
    {
      title: "Üye Sayısı",
      dataIndex: "size",
      key: "size",
      render: (size: number) => (
        <Tag color={size > 0 ? "green" : "default"}>{size} Aktif Üye</Tag>
      ),
    },
    {
      title: "Kurulma Tarihi",
      dataIndex: ["lobby", "createdAt"],
      key: "createdAt",
      render: (date: string) => new Date(date).toLocaleString("tr-TR"),
    },
    {
      title: "İşlemler",
      key: "actions",
      render: (_: any, record: AdminLobbySnapshot) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEditClick(record)}
            className="ct-icon-info"
            title="Adı Değiştir"
          />
          <Popconfirm
            title="Odayı silmek istediğinize emin misiniz? Tüm katılımcıların bağlantısı kesilecektir."
            onConfirm={() => handleDeleteLobby(record.lobby.id)}
            okText="Evet"
            cancelText="Hayır"
          >
            <Button type="text" danger icon={<DeleteOutlined />} title="Sil" />
          </Popconfirm>
        </Space>
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
        title: "Ses / Mikrofon Durumu",
        key: "audioStatus",
        render: (_: any, member: any) => (
          <Space>
            {member.muted ? (
              <Tag color="red" icon={<AudioMutedOutlined />}>
                Sessiz
              </Tag>
            ) : (
              <Tag color="green" icon={<SoundOutlined />}>
                Ses Açık
              </Tag>
            )}
            {member.deafened && (
              <Tag color="volcano">Sağırlaştırılmış</Tag>
            )}
          </Space>
        ),
      },
      {
        title: "Kamera / Ekran Durumu",
        key: "mediaStatus",
        render: (_: any, member: any) => (
          <Space>
            {member.cameraEnabled ? (
              <Tag color="purple" icon={<VideoCameraOutlined />}>
                Kamera Açık
              </Tag>
            ) : (
              <Tag color="default">Kamera Kapalı</Tag>
            )}
            {member.screenSharing ? (
              <Tag color="cyan" icon={<DesktopOutlined />}>
                Ekran Paylaşıyor
              </Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: "İşlemler",
        key: "actions",
        render: (_: any, member: any) => (
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
      <header className="ct-admin-page-header">
        <div>
          <h1>Aktif Odalar</h1>
          <p>
            Sistemdeki tüm sesli görüşme odalarını ve katılımcılarını anlık
            izleyin
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => fetchLobbies()}>
          Yenile
        </Button>
      </header>

      {/* Filters Bar */}
      <div
        className="ct-admin-toolbar"
      >
        <Input
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
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
        }}
        // See admin-users: a viewport height for a table that is not the
        // viewport clipped the last row and hid the pagination. The page
        // scrolls instead.
        scroll={{ x: "max-content" }}
        className="ct-admin-table-wrap"
      />

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

          <Form.Item name="isLocked" valuePropName="checked" label="Kilitli Oda">
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
