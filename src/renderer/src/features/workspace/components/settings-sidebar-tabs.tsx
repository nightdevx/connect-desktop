import type { SettingsSection } from "../../../store/ui-store";
import {
  UserOutlined,
  SafetyOutlined,
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

const TABS: TabConfig[] = [
  {
    id: "profile",
    label: "Profil",
    description: "Hesap görünümü ve kişisel bilgiler",
    icon: <UserOutlined style={{ fontSize: "16px" }} />,
  },
  {
    id: "security",
    label: "Güvenlik",
    description: "Şifre ve hesap güvenliği",
    icon: <SafetyOutlined style={{ fontSize: "16px" }} />,
  },
  {
    id: "camera",
    label: "Kamera",
    description: "Kamera kalitesi ve önizleme",
    icon: <VideoCameraOutlined style={{ fontSize: "16px" }} />,
  },
  {
    id: "audio",
    label: "Ses",
    description: "Mikrofon ve ses ayarları",
    icon: <AudioOutlined style={{ fontSize: "16px" }} />,
  },
  {
    id: "stream",
    label: "Yayın",
    description: "Ekran paylaşımı ve yayın kalitesi",
    icon: <DesktopOutlined style={{ fontSize: "16px" }} />,
  },
  {
    id: "application",
    label: "Uygulama",
    description: "Sürüm, güncelleme ve uygulama durumu",
    icon: <SettingOutlined style={{ fontSize: "16px" }} />,
  },
];

export function SettingsSidebarTabs({
  settingsSection,
  onSettingsSectionChange,
}: SettingsSidebarTabsProps) {
  return (
    <div
      className="ct-settings-tabs"
      role="tablist"
      aria-label="Ayar sekmeleri"
    >
      {TABS.map((tab) => (
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
  );
}
