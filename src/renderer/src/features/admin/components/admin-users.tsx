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
  Tooltip,
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
  ReloadOutlined,
} from "@ant-design/icons";
import adminService from "../services/admin-service";
import type { AdminUserDetail, UserRole } from "@shared/auth-contracts";
import type { TablePaginationConfig } from "antd";
import { AdminPageHeader } from "./admin-primitives";

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
      // The drawer's account actions read their own labels off this record --
      // "E-postayı Doğrula" vs "Doğrulamayı Geri Al" is the same button. Left
      // on the copy taken when the drawer opened, every one of them still
      // offered the action that had just been carried out.
      setEditingUser((current) =>
        current ? (res.users.find((user) => user.id === current.id) ?? current) : current,
      );
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
      setIsEditOpen(false);
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

  // Four buttons, not nine.
  //
  // The action cell used to carry every operation this screen can perform, as
  // nine unlabelled icons in a row: a padlock, a plug, a stop sign, a picture,
  // an envelope, a crossed-out microphone, an undo arrow and two more. It was
  // the widest column on the table, it read as a toolbar rather than as a set
  // of choices, and the only way to learn what any of them did was to rest the
  // pointer on it and wait for the operating system's tooltip.
  //
  // What is left here is the four things done often enough to be worth a click
  // from the row. The other five are labelled buttons in the drawer, under the
  // profile they act on -- see "Hesap İşlemleri" below.
  const columns = [
    {
      title: "Kullanıcı",
      key: "user",
      width: 240,
      render: (_value: unknown, record: AdminUserDetail) => (
        <div className="ct-admin-table-user">
          <Avatar src={record.avatarUrl} className="ct-admin-avatar">
            {record.displayName[0]?.toUpperCase()}
          </Avatar>
          <div className="ct-admin-cell">
            <strong>{record.displayName}</strong>
            <span>@{record.username}</span>
          </div>
        </div>
      ),
    },
    {
      title: "E-posta",
      key: "email",
      width: 260,
      render: (_value: unknown, record: AdminUserDetail) => (
        <div className="ct-admin-cell">
          <strong>{record.email || "—"}</strong>
          {record.email ? (
            <span
              className={`ct-status-chip ${record.emailVerified ? "ok" : "warn"}`}
            >
              {record.emailVerified ? "Doğrulanmış" : "Doğrulanmamış"}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      title: "Rol",
      dataIndex: "role",
      key: "role",
      width: 110,
      render: (role: string) => (
        <Tag color={role === "admin" ? "purple" : "blue"}>
          {role === "admin" ? "Yönetici" : "Üye"}
        </Tag>
      ),
    },
    {
      title: "Durum",
      key: "status",
      width: 150,
      // A pending deletion used to be visible only as a tenth icon appearing
      // in the action row; it belongs in the column that answers "what is going
      // on with this account".
      render: (_value: unknown, record: AdminUserDetail) => (
        <Space size={4} wrap>
          <Tag color={record.bannedAt ? "red" : "green"}>
            {record.bannedAt ? "Yasaklı" : "Aktif"}
          </Tag>
          {record.deletionScheduledAt ? (
            <Tag color="orange">Silinecek</Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: "Kayıt Tarihi",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      render: (date: string) => new Date(date).toLocaleDateString("tr-TR"),
    },
    {
      title: "İşlemler",
      key: "actions",
      width: 160,
      align: "right" as const,
      render: (_value: unknown, record: AdminUserDetail) => {
        const isSelf = record.id === currentUserId;
        return (
          <div className="ct-admin-actions">
            <Tooltip
              title={
                isSelf
                  ? "Kendi hesabınızı düzenleyemezsiniz"
                  : "Düzenle ve hesap işlemleri"
              }
            >
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => handleEditClick(record)}
                className="ct-icon-info"
                disabled={isSelf}
              />
            </Tooltip>
            <Tooltip
              title={
                isSelf
                  ? "Kendi şifrenizi buradan sıfırlayamazsınız"
                  : "Şifre sıfırla"
              }
            >
              <Button
                type="text"
                icon={<LockOutlined />}
                onClick={() => handleResetPasswordClick(record)}
                className="ct-icon-warning"
                disabled={isSelf}
              />
            </Tooltip>
            <Popconfirm
              title={`Kullanıcıyı ${record.bannedAt ? "aktif etmek" : "yasaklamak"} istediğinize emin misiniz?`}
              onConfirm={() => handleToggleBan(record)}
              okText="Evet"
              cancelText="Hayır"
              disabled={isSelf}
            >
              <Tooltip
                title={
                  isSelf
                    ? "Kendi hesabınızı yasaklayamazsınız"
                    : record.bannedAt
                      ? "Yasağı kaldır"
                      : "Yasakla"
                }
              >
                <Button
                  type="text"
                  icon={<StopOutlined />}
                  className={record.bannedAt ? "ct-icon-success" : "ct-icon-danger"}
                  disabled={isSelf}
                />
              </Tooltip>
            </Popconfirm>
            <Popconfirm
              title="Kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz!"
              onConfirm={() => handleDeleteUser(record.id)}
              okText="Evet"
              cancelText="Hayır"
              disabled={record.role === "admin" || isSelf}
            >
              <Tooltip
                title={
                  isSelf
                    ? "Kendi hesabınızı silemezsiniz"
                    : record.role === "admin"
                      ? "Yönetici hesabı silinemez"
                      : "Sil"
                }
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={record.role === "admin" || isSelf}
                />
              </Tooltip>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  return (
    <div className="ct-admin-page">
      <AdminPageHeader
        title="Kullanıcı Yönetimi"
        description="Kullanıcı hesaplarını görüntüleyin, düzenleyin, şifrelerini sıfırlayın veya yasaklayın."
        actions={
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => fetchUsers()}
          >
            Yenile
          </Button>
        }
      />

      {/* Filters only. "Yenile" moved to the page header, where it is on this
          screen the same button in the same place as on the other six -- it
          used to be the one refresh control that lived inside the filter bar. */}
      <div className="ct-admin-toolbar">
        <Input
          allowClear
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
      </div>

      {/* Users Table */}
      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        onChange={handleTableChange}
        locale={{
          emptyText: searchText
            ? "Bu aramayla eşleşen kullanıcı yok."
            : "Henüz kullanıcı yok.",
        }}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (count) => `${count} kullanıcı`,
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
        title={editingUser ? `@${editingUser.username}` : "Kullanıcı"}
        placement="right"
        onClose={() => setIsEditOpen(false)}
        open={isEditOpen}
        width={420}
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

          <Form.Item
            name="role"
            label="Sistem Rolü"
            rules={[{ required: true }]}
            // The last field in the form; the account actions below own the
            // space under it.
            className="!mb-0"
          >
            <Select
              options={[
                { value: "admin", label: "Yönetici (Admin)" },
                { value: "member", label: "Üye (Member)" },
              ]}
            />
          </Form.Item>
        </Form>

        {/* The five operations that used to be unlabelled icons in the table
            row. Here each one says what it does, sits under the profile it acts
            on, and has room for the confirmation to explain itself. They apply
            immediately — none of them is part of the form above, so "Kaydet"
            has nothing to do with them. */}
        {editingUser ? (
          <div className="ct-admin-field">
            <label>Hesap İşlemleri</label>
            <div className="ct-admin-action-list">
              <Popconfirm
                title={`@${editingUser.username} kullanıcısının tüm oturumlarını kapatmak istediğinize emin misiniz?`}
                onConfirm={() => handleForceLogout(editingUser)}
                okText="Evet"
                cancelText="Hayır"
              >
                <Button icon={<DisconnectOutlined />}>Oturumları Kapat</Button>
              </Popconfirm>

              <Button
                icon={<MailOutlined />}
                className={editingUser.emailVerified ? "ct-icon-success" : undefined}
                onClick={() => void handleToggleEmailVerified(editingUser)}
                disabled={!editingUser.email && !editingUser.emailVerified}
              >
                {editingUser.emailVerified
                  ? "E-posta Doğrulamasını Geri Al"
                  : "E-postayı Doğrulanmış İşaretle"}
              </Button>

              <Popconfirm
                title="Bu kullanıcının profil resmi ve afişi kaldırılsın mı?"
                onConfirm={() => void handleClearMedia(editingUser)}
                okText="Evet"
                cancelText="Hayır"
              >
                <Button icon={<PictureOutlined />}>
                  Profil Görsellerini Kaldır
                </Button>
              </Popconfirm>

              <Popconfirm
                title={`@${editingUser.username} sunucu genelinde susturulsun mu? Birebir aramalar dışında hiçbir lobide konuşamaz.`}
                onConfirm={() => void handleServerMute(editingUser)}
                okText="Evet"
                cancelText="Hayır"
              >
                <Button icon={<AudioMutedOutlined />}>Sunucuda Sustur</Button>
              </Popconfirm>

              {editingUser.deletionScheduledAt ? (
                <Popconfirm
                  title="Bu hesabın silinme talebi iptal edilsin mi?"
                  onConfirm={() => void handleCancelDeletion(editingUser)}
                  okText="Evet"
                  cancelText="Hayır"
                >
                  <Button icon={<UndoOutlined />} className="ct-icon-success">
                    Silme Talebini İptal Et
                  </Button>
                </Popconfirm>
              ) : null}
            </div>
          </div>
        ) : null}
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
