import { useUiStore } from "../../../store/ui-store";
import {
  DashboardOutlined,
  UserOutlined,
  HomeOutlined,
  HistoryOutlined,
  SoundOutlined,
} from "@ant-design/icons";

export default function AdminSidebar() {
  const { adminSection, setAdminSection } = useUiStore();

  const menuItems = [
    { key: "dashboard", label: "İnceleme", icon: <DashboardOutlined /> },
    { key: "users", label: "Kullanıcılar", icon: <UserOutlined /> },
    { key: "lobbies", label: "Aktif Odalar", icon: <HomeOutlined /> },
    { key: "activity", label: "Aktivite Logları", icon: <HistoryOutlined /> },
    { key: "sounds", label: "Sesler", icon: <SoundOutlined /> },
  ] as const;

  return (
    <aside className="ct-admin-sidebar" aria-label="Yönetim navigasyonu">
      <header className="ct-admin-sidebar-header">
        <h2>Yönetim Paneli</h2>
        <span>Sistem Yönetim Araçları</span>
      </header>

      <nav className="ct-admin-sidebar-nav">
        {menuItems.map((item) => {
          const active = adminSection === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`ct-admin-nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => setAdminSection(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
