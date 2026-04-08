import { LayoutGrid, Settings2, Users } from "lucide-react";
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
      <button
        type="button"
        className={`ct-rail-button ${workspaceSection === "users" ? "active" : ""}`}
        onClick={() => onSectionChange("users")}
        title="Arkadaşlar"
      >
        <span aria-hidden="true">
          <Users size={16} />
        </span>
        <small>Arkadaş</small>
      </button>

      <button
        type="button"
        className={`ct-rail-button ${workspaceSection === "lobbies" ? "active" : ""}`}
        onClick={() => onSectionChange("lobbies")}
        title="Lobiler"
      >
        <span aria-hidden="true">
          <LayoutGrid size={16} />
        </span>
        <small>Lobiler</small>
      </button>

      <button
        type="button"
        className={`ct-rail-button ${workspaceSection === "settings" ? "active" : ""}`}
        onClick={() => onSectionChange("settings")}
        title="Ayarlar"
      >
        <span aria-hidden="true">
          <Settings2 size={16} />
        </span>
        <small>Ayar</small>
      </button>
    </aside>
  );
}
