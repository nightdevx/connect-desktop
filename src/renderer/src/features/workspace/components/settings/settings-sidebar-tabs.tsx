import { Fragment, type KeyboardEvent } from "react";
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
  // Up/Down inside a group, as a vertical tablist owes its user. Wraps at both
  // ends; Home/End go to the group's first and last. Crossing between groups is
  // Tab's job, which is why the roving tabIndex below makes each group expose
  // exactly one stop.
  const handleGroupKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    tabs: TabConfig[],
  ): void => {
    const current = tabs.findIndex((tab) => tab.id === settingsSection);
    if (current === -1) {
      return;
    }

    const next =
      event.key === "ArrowDown"
        ? (current + 1) % tabs.length
        : event.key === "ArrowUp"
          ? (current - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;

    if (next === -1) {
      return;
    }

    event.preventDefault();
    onSettingsSectionChange(tabs[next].id);
    // Selection follows focus here, so focus has to follow selection back --
    // otherwise the arrow key changes the page while the ring stays behind.
    event.currentTarget
      .querySelector<HTMLButtonElement>(`#settings-tab-${tabs[next].id}`)
      ?.focus();
  };

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
            onKeyDown={(event) => handleGroupKeyDown(event, group.tabs)}
          >
            {group.tabs.map((tab) => (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                type="button"
                className={`ct-settings-tab ${settingsSection === tab.id ? "active" : ""}`}
                onClick={() => onSettingsSectionChange(tab.id)}
                role="tab"
                aria-selected={settingsSection === tab.id}
                aria-controls="settings-panel"
                // One stop per group: Tab reaches the group, the arrows move
                // inside it. A tablist where every tab is tabbable makes a
                // seven-item list seven stops on the way to the panel.
                tabIndex={
                  settingsSection === tab.id ||
                  (!group.tabs.some((entry) => entry.id === settingsSection) &&
                    tab.id === group.tabs[0].id)
                    ? 0
                    : -1
                }
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
