import type { SettingsSection } from "../../../store/ui-store";

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
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "Güvenlik",
    description: "Şifre ve hesap güvenliği",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: "camera",
    label: "Kamera",
    description: "Kamera kalitesi ve önizleme",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    id: "audio",
    label: "Ses",
    description: "Mikrofon ve ses ayarları",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
  {
    id: "stream",
    label: "Yayın",
    description: "Ekran paylaşımı ve yayın kalitesi",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="12" x2="22" y2="12" />
        <line x1="17" y1="17" x2="22" y2="17" />
      </svg>
    ),
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
            <span className="ct-settings-tab-description">{tab.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
