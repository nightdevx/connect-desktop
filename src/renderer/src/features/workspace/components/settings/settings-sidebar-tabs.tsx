import { Fragment } from "react";
import type { SettingsSection } from "@/store/ui-store";
import {
  UserOutlined,
  SafetyOutlined,
  EyeInvisibleOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  DesktopOutlined,
  SettingOutlined,
} from "@ant-design/icons";

interface SettingsSidebarTabsProps {
  settingsSection: SettingsSection;
  onSettingsSectionChange: (section: SettingsSection) => void;
}

interface TabConfig {
  id: SettingsSection;
  label: string;
  icon: JSX.Element;
  description: string;
}

interface TabGroupConfig {
  title: string;
  tabs: TabConfig[];
}

// One flat list of seven made "Gizlilik" and "Yayın" look like siblings. The
// tabs actually split three ways -- who you are, what your hardware does, what
// the desktop app does -- so the sidebar says so.
const TAB_GROUPS: TabGroupConfig[] = [
  {
    title: "Hesap",
    tabs: [
      {
        id: "profile",
        label: "Profil",
        description: "Görünen ad, avatar ve e-posta",
        icon: <UserOutlined />,
      },
      {
        id: "security",
        label: "Güvenlik",
        description: "Şifre, veri indirme ve hesap silme",
        icon: <SafetyOutlined />,
      },
      {
        id: "privacy",
        label: "Gizlilik",
        description: "Sana kimler ulaşabilir, kimler engelli",
        icon: <EyeInvisibleOutlined />,
      },
    ],
  },
  {
    title: "Ses ve Görüntü",
    tabs: [
      {
        id: "audio",
        label: "Ses",
        description: "Cihazlar, seviyeler ve mikrofon kısayolları",
        icon: <AudioOutlined />,
      },
      {
        id: "camera",
        label: "Kamera",
        description: "Kamera kalitesi ve önizleme",
        icon: <VideoCameraOutlined />,
      },
      {
        id: "stream",
        label: "Yayın",
        description: "Ekran paylaşımı ve yayın kalitesi",
        icon: <DesktopOutlined />,
      },
    ],
  },
  {
    title: "Uygulama",
    tabs: [
      {
        id: "application",
        label: "Genel",
        description: "Başlangıç, pencere, bildirim ve güncelleme",
        icon: <SettingOutlined />,
      },
    ],
  },
];

export function SettingsSidebarTabs({
  settingsSection,
  onSettingsSectionChange,
}: SettingsSidebarTabsProps) {
  return (
    <div className="ct-settings-tabs">
      {TAB_GROUPS.map((group) => (
        <Fragment key={group.title}>
          {/* The heading stays outside the tablist: a tablist may only own
              tabs, and one labelled list per group reads correctly anyway. */}
          <p className="ct-list-group-title">{group.title}</p>

          <div
            className="ct-settings-tab-group"
            role="tablist"
            aria-orientation="vertical"
            aria-label={`${group.title} ayarları`}
          >
            {group.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`ct-settings-tab ${settingsSection === tab.id ? "active" : ""}`}
                onClick={() => onSettingsSectionChange(tab.id)}
                role="tab"
                aria-selected={settingsSection === tab.id}
              >
                <div className="ct-settings-tab-icon">{tab.icon}</div>
                <div className="ct-settings-tab-content">
                  <span className="ct-settings-tab-label">{tab.label}</span>
                  <span className="ct-settings-tab-description">
                    {tab.description}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
