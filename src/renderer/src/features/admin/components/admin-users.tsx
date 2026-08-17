import { useEffect, useRef, useState } from "react";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import {
  Table,
  Input,
  Button,
  Tag,
  Modal,
  Form,
  Select,
  message,
  Drawer,
  Space,
  Avatar,
  Popconfirm,
} from "antd";
import {
  SearchOutlined,
  EditOutlined,
  LockOutlined,
  DeleteOutlined,
  StopOutlined,
  DisconnectOutlined,
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import { AdminUserDetail } from "@shared/auth-contracts";

export default function AdminUsers() {
  const { session } = useAuthSession();
  const currentUserId = session.user?.id;

  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Edit Drawer State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserDetail | null>(null);
  const [editForm] = Form.useForm();

  // Reset Password Modal State
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<AdminUserDetail | null>(null);
  const [resetForm] = Form.useForm();

  const fetchUsers = async (page = currentPage, size = pageSize) => {
    try {
      setLoading(true);
      const offset = (page - 1) * size;
      const res = await adminService.listUsers({
        search: searchText || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: size,
        offset,
      });
      setUsers(res.users);
      setTotal(res.total || 0);
    } catch (err: any) {
      message.error(err.message || "Kullanıcılar alınamadı");
    } finally {
      setLoading(false);
    }
  };

  // A narrowed result set has fewer pages; staying on page 4 of a one-page
  // result showed an empty table.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, roleFilter, statusFilter]);

  // One debounced fetch for every input, page included.
  //
  // It used to be two effects — one for the filters, one for the page — and a
  // filter change while past page 1 ran both: page 1 was fetched, the page
  // reset fired, and page 1 was fetched again. Two spinners for one keystroke.
  // The shared timer collapses that into a single request.
  //
  // The FIRST run is not debounced. Debouncing it charged the empty screen 300ms
  // before the request even left, on every visit to this page, for a keystroke
  // that had not happened.
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      void fetchUsers(currentPage, pageSize);
      return;
    }

    const timer = setTimeout(() => fetchUsers(currentPage, pageSize), 300);
    return () => clearTimeout(timer);
  }, [currentPage, pageSize, searchText, roleFilter, statusFilter]);

  const handleTableChange = (pagination: any) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  const handleEditClick = (user: AdminUserDetail) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      displayName: user.displayName,
      email: user.email,
      bio: user.bio,
      role: user.role,
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (values: any) => {
    if (!editingUser) return;
    try {
      await adminService.updateUser(editingUser.id, {
        displayName: values.displayName,
        email: values.email || null,
        bio: values.bio || null,
        role: values.role,
      });
      message.success("Kullanıcı başarıyla güncellendi");
      setIsEditOpen(false);
      fetchUsers();
    } catch (err: any) {
      message.error(err.message || "Güncelleme başarısız");
    }
  };

  const handleResetPasswordClick = (user: AdminUserDetail) => {
    setResettingUser(user);
    resetForm.resetFields();
    setIsResetOpen(true);
  };

  const handleResetPasswordSubmit = async (values: any) => {
    if (!resettingUser) return;
    try {
      await adminService.resetPassword(resettingUser.id, values.password);
      message.success("Şifre başarıyla sıfırlandı");
      setIsResetOpen(false);
    } catch (err: any) {
      message.error(err.message || "Şifre sıfırlama başarısız");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await adminService.deleteUser(userId);
      message.success("Kullanıcı başarıyla silindi");
      fetchUsers();
    } catch (err: any) {
      message.error(err.message || "Kullanıcı silinemedi");
    }
  };

  // Ends every session and pulls them out of every voice room, without the
  // ban that used to be the only way to do it. For a shared password or a
  // machine left signed in, a ban is both too visible and too blunt.
  const handleForceLogout = async (user: AdminUserDetail) => {
    try {
      await adminService.forceLogout(user.id);
      message.success(`@${user.username} oturumları sonlandırıldı`);
    } catch (err: any) {
      message.error(err.message || "Oturumlar sonlandırılamadı");
    }
  };

  const handleToggleBan = async (user: AdminUserDetail) => {
    try {
      if (user.bannedAt) {
        await adminService.unbanUser(user.id);
        message.success("Kullanıcının yasağı kaldırıldı");
      } else {
        await adminService.banUser(user.id);
        message.success("Kullanıcı yasaklandı");
      }
      fetchUsers();
    } catch (err: any) {
      message.error(err.message || "İşlem başarısız");
    }
  };

  // No-op local filters, handled by backend API

  const columns = [
    {
      title: "Kullanıcı",
      key: "user",
      render: (_: any, record: AdminUserDetail) => (
        <div className="ct-admin-table-user">
          <Avatar src={record.avatarUrl} className="ct-admin-avatar">
            {record.displayName[0]?.toUpperCase()}
          </Avatar>
          <div>
            <div >{record.displayName}</div>
            <div className="ct-admin-muted">
              @{record.username}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "E-posta",
      key: "email",
      render: (_: any, record: AdminUserDetail) => (
        <div>
          <div>{record.email || "-"}</div>
          {record.email && (
            <Tag color={record.emailVerified ? "success" : "warning"} >
              {record.emailVerified ? "Doğrulanmış" : "Doğrulanmamış"}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: "Rol",
      dataIndex: "role",
      key: "role",
      render: (role: string) => (
        <Tag color={role === "admin" ? "purple" : "blue"}>
          {role === "admin" ? "Yönetici" : "Üye"}
        </Tag>
      ),
    },
    {
      title: "Durum",
      key: "status",
      render: (_: any, record: AdminUserDetail) => (
        <Tag color={record.bannedAt ? "red" : "green"}>
          {record.bannedAt ? "Yasaklı" : "Aktif"}
        </Tag>
      ),
    },
    {
      title: "Kayıt Tarihi",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date: string) => new Date(date).toLocaleDateString("tr-TR"),
    },
    {
      title: "İşlemler",
      key: "actions",
      render: (_: any, record: AdminUserDetail) => {
        const isSelf = record.id === currentUserId;
        return (
          <Space size="middle">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditClick(record)}
              className="ct-icon-info"
              title={isSelf ? "Kendi hesabınızı düzenleyemezsiniz" : "Düzenle"}
              disabled={isSelf}
            />
            <Button
              type="text"
              icon={<LockOutlined />}
              onClick={() => handleResetPasswordClick(record)}
              className="ct-icon-warning"
              title={isSelf ? "Kendi şifrenizi buradan sıfırlayamazsınız" : "Şifre Sıfırla"}
              disabled={isSelf}
            />
            <Popconfirm
              title={`@${record.username} kullanıcısının tüm oturumlarını kapatmak istediğinize emin misiniz?`}
              onConfirm={() => handleForceLogout(record)}
              okText="Evet"
              cancelText="Hayır"
              disabled={isSelf}
            >
              <Button
                type="text"
                icon={<DisconnectOutlined />}
                className="ct-icon-warning"
                title={
                  isSelf
                    ? "Kendi oturumunuzu buradan kapatamazsınız"
                    : "Oturumları Kapat"
                }
                disabled={isSelf}
              />
            </Popconfirm>
            <Popconfirm
              title={`Kullanıcıyı ${record.bannedAt ? "aktif etmek" : "yasaklamak"} istediğinize emin misiniz?`}
              onConfirm={() => handleToggleBan(record)}
              okText="Evet"
              cancelText="Hayır"
              disabled={isSelf}
            >
              <Button
                type="text"
                icon={<StopOutlined />}
                className={record.bannedAt ? "ct-icon-success" : "ct-icon-danger"}
                title={isSelf ? "Kendi hesabınızı yasaklayamazsınız" : (record.bannedAt ? "Yasağı Kaldır" : "Yasakla")}
                disabled={isSelf}
              />
            </Popconfirm>
            <Popconfirm
              title="Kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz!"
              onConfirm={() => handleDeleteUser(record.id)}
              okText="Evet"
              cancelText="Hayır"
              disabled={record.role === "admin" || isSelf}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={record.role === "admin" || isSelf}
                title={isSelf ? "Kendi hesabınızı silemezsiniz" : "Sil"}
              />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div className="ct-admin-page">
      <header className="ct-admin-page-header">
        <div>
          <h1>Kullanıcı Yönetimi</h1>
          <p>
            Kullanıcı hesaplarını görüntüleyin, düzenleyin, şifrelerini
            sıfırlayın veya yasaklayın
          </p>
        </div>
      </header>

      {/* Filters Bar */}
      <div
        className="ct-admin-toolbar"
      >
        <Input
          placeholder="İsim, kullanıcı adı veya e-posta ara..."
          prefix={<SearchOutlined className="ct-admin-muted" />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="ct-admin-toolbar-search"
        />

        {/* No dropdownStyle here or anywhere else on this screen: it hardcoded
            #1f1f1f, which is the one colour the theme cannot reach — every
            filter menu stayed dark on a light page. The ConfigProvider already
            paints these. */}
        <Select
          value={roleFilter}
          onChange={setRoleFilter}
          className="ct-admin-toolbar-filter"
          options={[
            { value: "all", label: "Tüm Roller" },
            { value: "admin", label: "Yöneticiler" },
            { value: "member", label: "Üyeler" },
          ]}
        />

        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          className="ct-admin-toolbar-filter"
          options={[
            { value: "all", label: "Tüm Durumlar" },
            { value: "active", label: "Aktif Kullanıcılar" },
            { value: "banned", label: "Yasaklı Kullanıcılar" },
          ]}
        />

        <Button type="primary" onClick={() => fetchUsers()}>
          Yenile
        </Button>
      </div>

      {/* Users Table */}
      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        onChange={handleTableChange}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
        }}
        // No scroll.y. It was calc(100vh - 260px) — a VIEWPORT height for a
        // table that lives inside the admin panel, below the titlebar, the page
        // padding, a header and a toolbar. The body was therefore always taller
        // than the space it had, which cut the last row in half and pushed the
        // pagination off the bottom.
        //
        // ponytail: the page scrolls instead of the table body. That costs a
        // sticky header; give the table one by passing antd's `sticky` a
        // getContainer pointing at .ct-admin-panel-content if the loss is felt.
        // scroll.x keeps the six columns from crushing on a narrow window.
        scroll={{ x: "max-content" }}
        className="ct-admin-table-wrap"
      />

      {/* Edit Drawer */}
      <Drawer
        rootClassName="ct-admin-drawer"
        title="Profil Düzenle"
        placement="right"
        onClose={() => setIsEditOpen(false)}
        open={isEditOpen}
        width={400}
        extra={
          <Space>
            <Button onClick={() => setIsEditOpen(false)}>Kapat</Button>
            <Button type="primary" onClick={() => editForm.submit()}>
              Kaydet
            </Button>
          </Space>
        }
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item
            name="displayName"
            label="Görünen Ad"
            rules={[{ required: true, message: "Görünen ad girilmelidir" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="email"
            label="E-posta Adresi"
            rules={[{ type: "email", message: "Geçerli bir e-posta girin" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="bio" label="Biyografi">
            <Input.TextArea rows={4} />
          </Form.Item>

          <Form.Item name="role" label="Sistem Rolü" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "admin", label: "Yönetici (Admin)" },
                { value: "member", label: "Üye (Member)" },
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Reset Password Modal */}
      <Modal
        rootClassName="ct-modal"
        title="Şifre Sıfırla"
        open={isResetOpen}
        onCancel={() => setIsResetOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsResetOpen(false)}>
            İptal
          </Button>,
          <Button key="submit" type="primary" onClick={() => resetForm.submit()}>
            Şifreyi Güncelle
          </Button>,
        ]}
      >
        <p className="ct-admin-muted">
          <strong>@{resettingUser?.username}</strong> kullanıcısı için yeni bir
          şifre tanımlayın.
        </p>
        <Form form={resetForm} layout="vertical" onFinish={handleResetPasswordSubmit}>
          <Form.Item
            name="password"
            label="Yeni Şifre"
            rules={[
              { required: true, message: "Yeni şifre girilmelidir" },
              { min: 8, message: "Şifre en az 8 karakter olmalıdır" },
            ]}
          >
            <Input.Password  />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
