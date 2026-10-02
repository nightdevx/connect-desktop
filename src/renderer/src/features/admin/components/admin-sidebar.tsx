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
  MessageOutlined,
  VideoCameraOutlined,
  FundProjectionScreenOutlined,
  CloudServerOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
} from "@ant-design/icons";

// Grouped by what the screen is FOR, the way the settings menu is: the people
// and rooms on the server, what they have put on it, how the calls are doing,
// what has already happened, and what the server itself is set to. The calls
// group used to be filed under "Denetim" beside moderation, so the diagnostics
// screens were three entries in a list of seven about something else.
//
// The groups are flattened into the same <nav> rather than wrapped in a <div>
// each, so the list keeps one column and one rhythm.
const NAV_GROUPS = [
  {
    label: "Genel",
    items: [
      { key: "dashboard", label: "Genel Bakış", icon: <DashboardOutlined /> },
    ],
  },
  {
    label: "Topluluk",
    items: [
      { key: "users", label: "Kullanıcılar", icon: <UserOutlined /> },
      { key: "lobbies", label: "Odalar", icon: <HomeOutlined /> },
      { key: "moderation", label: "Moderasyon", icon: <StopOutlined /> },
      { key: "chat", label: "Sohbet", icon: <MessageOutlined /> },
    ],
  },
  {
    label: "İçerik",
    items: [
      { key: "sounds", label: "Sesler", icon: <SoundOutlined /> },
      { key: "minigames", label: "Oyunlar", icon: <PlayCircleOutlined /> },
      { key: "music", label: "Müzik", icon: <CustomerServiceOutlined /> },
    ],
  },
  {
    label: "Görüşmeler",
    items: [
      { key: "media", label: "Canlı Yayınlar", icon: <VideoCameraOutlined /> },
      { key: "diagnostics", label: "Yayın Tanılama", icon: <FundProjectionScreenOutlined /> },
      { key: "media-health", label: "Medya Sağlığı", icon: <CloudServerOutlined /> },
    ],
  },
  {
    label: "Kayıtlar",
    items: [
      { key: "activity", label: "Oda Etkinliği", icon: <HistoryOutlined /> },
      { key: "audit", label: "Denetim Kaydı", icon: <AuditOutlined /> },
    ],
  },
  {
    label: "Sistem",
    items: [
      { key: "settings", label: "Sunucu Ayarları", icon: <SettingOutlined /> },
      { key: "access", label: "Erişim Denetimi", icon: <SafetyCertificateOutlined /> },
    ],
  },
] as const;

export default function AdminSidebar() {
  const { adminSection, setAdminSection } = useUiStore();

  return (
    <aside className="ct-admin-sidebar" aria-label="Yönetim navigasyonu">
      <header className="ct-sidebar-header">
        <h3>Yönetim</h3>
      </header>

      <nav className="ct-admin-sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <Fragment key={group.label}>
            <span className="ct-list-group-title">{group.label}</span>
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
