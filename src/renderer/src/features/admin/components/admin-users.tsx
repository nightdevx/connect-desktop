import { toErrorMessage } from "@shared/error-message";
import { useCallback, useEffect, useRef, useState } from "react";
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
  PictureOutlined,
  MailOutlined,
  UndoOutlined,
  AudioMutedOutlined,
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import type { AdminUserDetail, UserRole } from "@shared/auth-contracts";
import type { TablePaginationConfig } from "antd";

interface EditUserFormValues {
  displayName: string;
  email?: string | null;
  bio?: string | null;
  role: UserRole;
  banned?: boolean;
}

interface ResetPasswordFormValues {
  password: string;
}


// antd hands the pagination object back with every field optional; this is what
// a page-size reset falls back to.
const DEFAULT_PAGE_SIZE = 10;

interface AdminUsersProps {
  // Passed down rather than read from useAuthSession.
  //
  // This screen mounted that whole hook to learn one id, and the hook is not a
  // getter: it registers a second session-expired IPC listener, and its
  // ["auth-session"] query carries no staleTime, so opening this page fired a
  // fresh GET /auth/session — which is where the "Kimlik doğrulandı" that flashed
  // in the status bar on the way in came from. Every other admin screen opens
  // without it.
  currentUserId?: string;
}

export default function AdminUsers({ currentUserId }: AdminUsersProps) {
  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Edit Drawer State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserDetail | null>(null);
  const [editForm] = Form.useForm();

  // Reset Password Modal State
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<AdminUserDetail | null>(null);
  const [resetForm] = Form.useForm();

  const fetchUsers = useCallback(
    async (page = currentPage, size = pageSize): Promise<void> => {
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
    } catch (err) {
      message.error(toErrorMessage(err, "Kullanıcılar alınamadı"));
    } finally {
      setLoading(false);
    }
    },
    [currentPage, pageSize, searchText, roleFilter, statusFilter],
  );

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
    // fetchUsers is memoised on exactly the filters and the page, so depending on
    // it re-runs this on precisely the same changes the old literal list named —
    // and it can no longer close over a filter value a render out of date.
  }, [currentPage, pageSize, fetchUsers]);

  const handleTableChange = (pagination: TablePaginationConfig): void => {
    setCurrentPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? DEFAULT_PAGE_SIZE);
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

  const handleEditSubmit = async (values: EditUserFormValues): Promise<void> => {
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
    } catch (err) {
      message.error(toErrorMessage(err, "Güncelleme başarısız"));
    }
  };

  const handleResetPasswordClick = (user: AdminUserDetail) => {
    setResettingUser(user);
    resetForm.resetFields();
    setIsResetOpen(true);
  };

  const handleResetPasswordSubmit = async (values: ResetPasswordFormValues): Promise<void> => {
    if (!resettingUser) return;
    try {
      await adminService.resetPassword(resettingUser.id, values.password);
      message.success("Şifre başarıyla sıfırlandı");
      setIsResetOpen(false);
    } catch (err) {
      message.error(toErrorMessage(err, "Şifre sıfırlama başarısız"));
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await adminService.deleteUser(userId);
      message.success("Kullanıcı başarıyla silindi");
      fetchUsers();
    } catch (err) {
      message.error(toErrorMessage(err, "Kullanıcı silinemedi"));
    }
  };

  // Ends every session and pulls them out of every voice room, without the
  // ban that used to be the only way to do it. For a shared password or a
  // machine left signed in, a ban is both too visible and too blunt.
  const handleForceLogout = async (user: AdminUserDetail) => {
    try {
      await adminService.forceLogout(user.id);
      message.success(`@${user.username} oturumları sonlandırıldı`);
    } catch (err) {
      message.error(toErrorMessage(err, "Oturumlar sonlandırılamadı"));
    }
  };

  // The four things the panel could SHOW but not change. Each one existed as
  // state on the row — a picture, a verified badge, a deletion countdown, a mute
  // icon — with no way for an admin to act on it.
  const handleClearMedia = async (user: AdminUserDetail): Promise<void> => {
    try {
      await adminService.clearProfileMedia(user.id);
      message.success("Profil görselleri kaldırıldı.");
      await fetchUsers();
    } catch (error) {
      message.error(toErrorMessage(error, "Görseller kaldırılamadı"));
    }
  };

  const handleToggleEmailVerified = async (user: AdminUserDetail): Promise<void> => {
    try {
      await adminService.setEmailVerified(user.id, !user.emailVerified);
      message.success(
        user.emailVerified ? "Doğrulama geri alındı." : "E-posta doğrulandı.",
      );
      await fetchUsers();
    } catch (error) {
      message.error(toErrorMessage(error, "Doğrulama durumu değiştirilemedi"));
    }
  };

  const handleCancelDeletion = async (user: AdminUserDetail): Promise<void> => {
    try {
      await adminService.cancelDeletion(user.id);
      message.success("Hesap silme talebi iptal edildi.");
      await fetchUsers();
    } catch (error) {
      message.error(toErrorMessage(error, "Silme talebi iptal edilemedi"));
    }
  };

  // Indefinite on purpose: a timed mute is a lobby decision made in the moment,
  // and this reaches somebody who is not in a lobby at all.
  const handleServerMute = async (user: AdminUserDetail): Promise<void> => {
    try {
      await adminService.setVoiceMute(user.id, true);
      message.success(`@${user.username} sunucuda susturuldu.`);
    } catch (error) {
      message.error(toErrorMessage(error, "Susturma uygulanamadı"));
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
    } catch (err) {
      message.error(toErrorMessage(err, "İşlem başarısız"));
    }
  };

  // No-op local filters, handled by backend API

  const columns = [
    {
      title: "Kullanıcı",
      key: "user",
      render: (_value: unknown, record: AdminUserDetail) => (
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
      render: (_value: unknown, record: AdminUserDetail) => (
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
      render: (_value: unknown, record: AdminUserDetail) => (
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
      render: (_value: unknown, record: AdminUserDetail) => {
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
              title="Bu kullanıcının profil resmi ve afişi kaldırılsın mı?"
              onConfirm={() => handleClearMedia(record)}
              okText="Evet"
              cancelText="Hayır"
              disabled={isSelf}
            >
              <Button
                type="text"
                icon={<PictureOutlined />}
                disabled={isSelf}
                title="Profil Görsellerini Kaldır"
              />
            </Popconfirm>
            <Button
              type="text"
              icon={<MailOutlined />}
              className={record.emailVerified ? "ct-icon-success" : undefined}
              onClick={() => void handleToggleEmailVerified(record)}
              disabled={isSelf || (!record.email && !record.emailVerified)}
              title={
                record.emailVerified
                  ? "Doğrulamayı Geri Al"
                  : "E-postayı Doğrulanmış İşaretle"
              }
            />
            <Popconfirm
              title={`@${record.username} sunucu genelinde susturulsun mu? Birebir aramalar dışında hiçbir lobide konuşamaz.`}
              onConfirm={() => void handleServerMute(record)}
              okText="Evet"
              cancelText="Hayır"
              disabled={isSelf}
            >
              <Button
                type="text"
                icon={<AudioMutedOutlined />}
                disabled={isSelf}
                title="Sunucuda Sustur"
              />
            </Popconfirm>
            {record.deletionScheduledAt && (
              <Popconfirm
                title="Bu hesabın silinme talebi iptal edilsin mi?"
                onConfirm={() => void handleCancelDeletion(record)}
                okText="Evet"
                cancelText="Hayır"
              >
                <Button
                  type="text"
                  icon={<UndoOutlined />}
                  className="ct-icon-success"
                  title="Silme Talebini İptal Et"
                />
              </Popconfirm>
            )}
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
