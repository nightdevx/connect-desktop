import { Fragment } from "react";
import { useUiStore } from "@/store/ui-store";
import {
  DashboardOutlined,
  UserOutlined,
  HomeOutlined,
  HistoryOutlined,
  SoundOutlined,
  StopOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  CustomerServiceOutlined,
} from "@ant-design/icons";

// Seven flat entries in one column was a list to read top to bottom. Grouped by
// what the screen is FOR -- what is happening now, who and what is on the
// server, what has already happened, what the server itself is set to -- it is
// a list to scan.
//
// The groups are flattened into the same <nav> rather than wrapped in a <div>
// each: the narrow layout turns that nav into a horizontal scrolling strip, and
// a wrapper per group would lay out as four columns inside one row.
const NAV_GROUPS = [
  {
    label: "Genel",
    items: [
      { key: "dashboard", label: "Genel Bakış", icon: <DashboardOutlined /> },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { key: "users", label: "Kullanıcılar", icon: <UserOutlined /> },
      { key: "lobbies", label: "Odalar", icon: <HomeOutlined /> },
      { key: "sounds", label: "Sesler", icon: <SoundOutlined /> },
      { key: "minigames", label: "Oyunlar", icon: <PlayCircleOutlined /> },
      { key: "music", label: "Müzik", icon: <CustomerServiceOutlined /> },
    ],
  },
  {
    label: "Denetim",
    items: [
      { key: "moderation", label: "Moderasyon", icon: <StopOutlined /> },
      { key: "activity", label: "Aktivite Logları", icon: <HistoryOutlined /> },
    ],
  },
  {
    label: "Sistem",
    items: [
      { key: "settings", label: "Sunucu Ayarları", icon: <SettingOutlined /> },
    ],
  },
] as const;

export default function AdminSidebar() {
  const { adminSection, setAdminSection } = useUiStore();

  return (
    <aside className="ct-admin-sidebar" aria-label="Yönetim navigasyonu">
      <header className="ct-admin-sidebar-header">
        <h2>Yönetim Paneli</h2>
        <span>Sistem yönetim araçları</span>
      </header>

      <nav className="ct-admin-sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <Fragment key={group.label}>
            <span className="ct-admin-sidebar-group-label">{group.label}</span>
            {group.items.map((item) => {
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
          </Fragment>
        ))}
      </nav>
    </aside>
  );
}
