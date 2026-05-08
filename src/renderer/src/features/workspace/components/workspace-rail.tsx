import { Tooltip } from "antd";
import { TeamOutlined, AppstoreOutlined, SettingOutlined } from "@ant-design/icons";
import type { WorkspaceSection } from "../../../store/ui-store";

interface WorkspaceRailProps {
  workspaceSection: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
}

export function WorkspaceRail({
  workspaceSection,
  onSectionChange,
}: WorkspaceRailProps) {
  return (
    <aside className="ct-rail" aria-label="Navigasyon">
      <div className="ct-rail-top-logo">
        <span className="ct-rail-logo">CT</span>
      </div>

      <div className="ct-rail-separator" />

      <div className="ct-rail-items">
        <Tooltip title="Arkadaşlar" placement="right" mouseEnterDelay={0.15}>
          <div className="ct-rail-item-wrapper">
            <div className={`ct-rail-indicator ${workspaceSection === "users" ? "active" : ""}`} />
            <button
              type="button"
              className={`ct-rail-button-premium ${workspaceSection === "users" ? "active" : ""}`}
              onClick={() => onSectionChange("users")}
              aria-label="Arkadaşlar"
            >
              <TeamOutlined className="ct-rail-icon-premium" />
              <small>Arkadaş</small>
            </button>
          </div>
        </Tooltip>

        <Tooltip title="Lobiler" placement="right" mouseEnterDelay={0.15}>
          <div className="ct-rail-item-wrapper">
            <div className={`ct-rail-indicator ${workspaceSection === "lobbies" ? "active" : ""}`} />
            <button
              type="button"
              className={`ct-rail-button-premium ${workspaceSection === "lobbies" ? "active" : ""}`}
              onClick={() => onSectionChange("lobbies")}
              aria-label="Lobiler"
            >
              <AppstoreOutlined className="ct-rail-icon-premium" />
              <small>Lobiler</small>
            </button>
          </div>
        </Tooltip>

        <Tooltip title="Ayarlar" placement="right" mouseEnterDelay={0.15}>
          <div className="ct-rail-item-wrapper">
            <div className={`ct-rail-indicator ${workspaceSection === "settings" ? "active" : ""}`} />
            <button
              type="button"
              className={`ct-rail-button-premium ${workspaceSection === "settings" ? "active" : ""}`}
              onClick={() => onSectionChange("settings")}
              aria-label="Ayarlar"
            >
              <SettingOutlined className="ct-rail-icon-premium" />
              <small>Ayar</small>
            </button>
          </div>
        </Tooltip>
      </div>
    </aside>
  );
}
