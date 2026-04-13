import { useEffect, useRef, useState } from "react";
import { Activity, Plus, Wifi, WifiOff, X } from "lucide-react";
import type { LobbyDescriptor } from "../../../../../shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "../../../../../shared/desktop-api-types";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  SettingsSection,
  WorkspaceSection,
} from "../../../store/ui-store";
import type { UseWorkspaceUsersResult } from "../hooks/use-workspace-users";
import { LobbiesSidebarPanel } from "./lobbies-sidebar-panel";
import { QuickControls } from "./quick-controls";
import { SettingsSidebarTabs } from "./settings-sidebar-tabs";
import { UsersSidebarPanel } from "./users-sidebar-panel";

interface WorkspaceSidebarProps {
  sectionTitle: string;
  workspaceSection: WorkspaceSection;
  usersProps: {
    usersQuery: UseWorkspaceUsersResult["usersQuery"];
    userSearch: string;
    setUserSearch: (value: string) => void;
    userFilter: UseWorkspaceUsersResult["userFilter"];
    setUserFilter: (value: UseWorkspaceUsersResult["userFilter"]) => void;
    filteredUsers: UseWorkspaceUsersResult["filteredUsers"];
    selectedUserId: string | null;
    setSelectedUserId: (value: string | null) => void;
    unreadByUserId: Record<string, number>;
  };
  lobbiesProps: {
    lobbiesQuery: UseQueryResult<
      DesktopResult<{ lobbies: LobbyDescriptor[] }>,
      Error
    >;
    lobbies: LobbyDescriptor[];
    lobbyMembersById: Record<string, LobbyStateMember[]>;
    avatarByUserId: Record<string, string | null | undefined>;
    activeLobbyId: string | null;
    joiningLobbyId: string | null;
    onJoinLobby: (lobbyId: string) => void;
    onCreateLobby: (name: string) => Promise<boolean>;
    onRenameLobby: (lobbyId: string, nextName: string) => Promise<boolean>;
    onDeleteLobby: (lobbyId: string) => Promise<boolean>;
    isCreatingLobby: boolean;
    renamingLobbyId: string | null;
    deletingLobbyId: string | null;
  };
  settingsProps: {
    settingsSection: SettingsSection;
    setSettingsSection: (section: SettingsSection) => void;
  };
  quickControlsProps: {
    currentUsername: string;
    currentUserAvatarUrl?: string | null;
    hasActiveLobby: boolean;
    isLeavingLobby: boolean;
    micEnabled: boolean;
    headphoneEnabled: boolean;
    onToggleMic: () => void;
    onToggleHeadphone: () => void;
    onDisconnect: () => void;
  };
  audioConnectionProps: {
    statusText: string;
    tone: "ok" | "warn" | "error" | "idle";
    pingMs: number | null;
    packetLossPct: number | null;
    jitterMs: number | null;
    successfulSamples: number;
    failedSamples: number;
    networkType: string | null;
    networkRttMs: number | null;
    downlinkMbps: number | null;
    lastMeasuredAt: string | null;
  };
  audioProcessingProps: {
    enhancedNoiseSuppressionEnabled: boolean;
    onToggleEnhancedNoiseSuppression: () => void;
  };
}

export function WorkspaceSidebar({
  sectionTitle,
  workspaceSection,
  usersProps,
  lobbiesProps,
  settingsProps,
  quickControlsProps,
  audioConnectionProps,
  audioProcessingProps,
}: WorkspaceSidebarProps) {
  const [isCreateLobbyOpen, setIsCreateLobbyOpen] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState("");
  const [isAudioPopupOpen, setIsAudioPopupOpen] = useState(false);
  const audioAnchorRef = useRef<HTMLDivElement | null>(null);

  const handleCreateLobbyClick = (): void => {
    if (workspaceSection !== "lobbies" || lobbiesProps.isCreatingLobby) {
      return;
    }

    setIsCreateLobbyOpen((previous) => !previous);
  };

  const audioStatusIcon =
    audioConnectionProps.tone === "error" ? (
      <WifiOff size={14} aria-hidden="true" />
    ) : audioConnectionProps.tone === "warn" ? (
      <Activity size={14} aria-hidden="true" />
    ) : (
      <Wifi size={14} aria-hidden="true" />
    );

  useEffect(() => {
    if (!isAudioPopupOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!audioAnchorRef.current) {
        return;
      }

      if (!audioAnchorRef.current.contains(event.target as Node)) {
        setIsAudioPopupOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsAudioPopupOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAudioPopupOpen]);

  const measurementTimeText = audioConnectionProps.lastMeasuredAt
    ? new Date(audioConnectionProps.lastMeasuredAt).toLocaleTimeString("tr-TR")
    : "-";

  const latencyHint =
    audioConnectionProps.pingMs === null
      ? "Henüz ölçüm alınmadı"
      : audioConnectionProps.pingMs < 120
        ? "Gecikme düşük"
        : audioConnectionProps.pingMs < 220
          ? "Gecikme orta"
          : "Gecikme yüksek";

  const stabilityHint =
    audioConnectionProps.packetLossPct === null
      ? "Kararlılık bilgisi yok"
      : audioConnectionProps.packetLossPct < 4
        ? "Bağlantı kararlı"
        : audioConnectionProps.packetLossPct < 10
          ? "Ufak kesintiler olabilir"
          : "Kesinti riski yüksek";

  const handleCreateLobbySubmit = async (): Promise<void> => {
    if (lobbiesProps.isCreatingLobby) {
      return;
    }

    const created = await lobbiesProps.onCreateLobby(newLobbyName);
    if (!created) {
      return;
    }

    setNewLobbyName("");
    setIsCreateLobbyOpen(false);
  };

  return (
    <aside className="ct-sidebar" aria-label="Yan panel">
      <header className="ct-sidebar-header">
        <div className="ct-sidebar-header-row">
          <h3>{sectionTitle}</h3>

          {workspaceSection === "lobbies" && (
            <button
              type="button"
              className="ct-sidebar-header-action"
              onClick={handleCreateLobbyClick}
              disabled={lobbiesProps.isCreatingLobby}
              title="Lobi oluştur"
              aria-label="Lobi oluştur"
            >
              <Plus size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {workspaceSection === "lobbies" && isCreateLobbyOpen && (
          <div className="ct-inline-create-lobby">
            <input
              type="text"
              className="ct-input"
              value={newLobbyName}
              onChange={(event) => setNewLobbyName(event.target.value)}
              placeholder="Lobi adı"
              maxLength={64}
            />
            <button
              type="button"
              className="ct-btn-primary"
              onClick={() => void handleCreateLobbySubmit()}
              disabled={
                lobbiesProps.isCreatingLobby || newLobbyName.trim().length < 2
              }
            >
              {lobbiesProps.isCreatingLobby ? "Ekleniyor..." : "Ekle"}
            </button>
          </div>
        )}
      </header>

      <div className="ct-sidebar-body">
        {workspaceSection === "users" && (
          <UsersSidebarPanel
            usersQuery={usersProps.usersQuery}
            userSearch={usersProps.userSearch}
            onUserSearchChange={usersProps.setUserSearch}
            userFilter={usersProps.userFilter}
            onUserFilterChange={usersProps.setUserFilter}
            filteredUsers={usersProps.filteredUsers}
            selectedUserId={usersProps.selectedUserId}
            onUserSelect={usersProps.setSelectedUserId}
            unreadByUserId={usersProps.unreadByUserId}
          />
        )}

        {workspaceSection === "lobbies" && (
          <LobbiesSidebarPanel
            lobbiesQuery={lobbiesProps.lobbiesQuery}
            lobbies={lobbiesProps.lobbies}
            lobbyMembersById={lobbiesProps.lobbyMembersById}
            avatarByUserId={lobbiesProps.avatarByUserId}
            activeLobbyId={lobbiesProps.activeLobbyId}
            joiningLobbyId={lobbiesProps.joiningLobbyId}
            onJoinLobby={lobbiesProps.onJoinLobby}
            onRenameLobby={lobbiesProps.onRenameLobby}
            onDeleteLobby={lobbiesProps.onDeleteLobby}
            renamingLobbyId={lobbiesProps.renamingLobbyId}
            deletingLobbyId={lobbiesProps.deletingLobbyId}
          />
        )}

        {workspaceSection === "settings" && (
          <SettingsSidebarTabs
            settingsSection={settingsProps.settingsSection}
            onSettingsSectionChange={settingsProps.setSettingsSection}
          />
        )}
      </div>

      {workspaceSection !== "settings" && (
        <>
          <div className="ct-audio-connection-anchor" ref={audioAnchorRef}>
            <button
              type="button"
              className={`ct-audio-connection-card ${audioConnectionProps.tone}`}
              onClick={() => setIsAudioPopupOpen((previous) => !previous)}
              aria-expanded={isAudioPopupOpen}
              aria-label="Ses bağlantı detaylarını aç"
              title="Ses bağlantı detayları"
            >
              <span className="ct-audio-connection-icon">
                {audioStatusIcon}
              </span>
              <div className="ct-audio-connection-content">
                <span className="ct-audio-connection-text">
                  {audioConnectionProps.statusText}
                </span>
              </div>
            </button>

            {isAudioPopupOpen && (
              <section
                className="ct-audio-popover"
                role="dialog"
                aria-modal="false"
                aria-label="Ses bağlantı detayları"
              >
                <header className="ct-audio-popover-header">
                  <h4>Ses Bağlantı Durumu</h4>
                  <button
                    type="button"
                    className="ct-user-popup-close"
                    onClick={() => setIsAudioPopupOpen(false)}
                    aria-label="Detay penceresini kapat"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </header>

                <div className="ct-audio-details-grid">
                  <div className="ct-detail-item">
                    <span>Durum: {audioConnectionProps.statusText}</span>
                  </div>
                  <div className="ct-detail-item">
                    <span>Bağlantı Yorumu: {stabilityHint}</span>
                  </div>
                  <div className="ct-detail-item">
                    <span>Gecikme Yorumu: {latencyHint}</span>
                  </div>
                  <div className="ct-detail-item">
                    <span>
                      Ping: {audioConnectionProps.pingMs ?? "-"}
                      {audioConnectionProps.pingMs !== null ? " ms" : ""}
                    </span>
                  </div>
                  <div className="ct-detail-item">
                    <span>
                      Paket Kaybı (Canlı):{" "}
                      {audioConnectionProps.packetLossPct ?? "-"}
                      {audioConnectionProps.packetLossPct !== null ? "%" : ""}
                    </span>
                  </div>
                  <div className="ct-detail-item">
                    <span>
                      Gecikme Dalgalanması:{" "}
                      {audioConnectionProps.jitterMs ?? "-"}
                      {audioConnectionProps.jitterMs !== null ? " ms" : ""}
                    </span>
                  </div>
                  <div className="ct-detail-item">
                    <span>
                      Toplam Ölçüm: {audioConnectionProps.successfulSamples}
                    </span>
                  </div>
                  <div className="ct-detail-item">
                    <span>Son Ölçüm: {measurementTimeText}</span>
                  </div>
                </div>

                <div className="ct-audio-popover-actions">
                  <label className="ct-settings-switch-item">
                    <div className="ct-settings-switch-item-content">
                      <strong>RNNoise Gurultu Bastirma</strong>
                      <span>
                        Mikrofon gurultusunu azaltir. Acik degilse tarayici
                        filtreleri kullanilir.
                      </span>
                    </div>
                    <div className="ct-settings-switch">
                      <input
                        id="audio-popover-rnnoise-toggle"
                        type="checkbox"
                        checked={
                          audioProcessingProps.enhancedNoiseSuppressionEnabled
                        }
                        onChange={() => {
                          audioProcessingProps.onToggleEnhancedNoiseSuppression();
                        }}
                      />
                      <span className="ct-settings-switch-slider" />
                    </div>
                  </label>
                </div>
              </section>
            )}
          </div>

          <QuickControls
            currentUsername={quickControlsProps.currentUsername}
            currentUserAvatarUrl={quickControlsProps.currentUserAvatarUrl}
            hasActiveLobby={quickControlsProps.hasActiveLobby}
            isLeavingLobby={quickControlsProps.isLeavingLobby}
            micEnabled={quickControlsProps.micEnabled}
            headphoneEnabled={quickControlsProps.headphoneEnabled}
            onToggleMic={quickControlsProps.onToggleMic}
            onToggleHeadphone={quickControlsProps.onToggleHeadphone}
            onDisconnect={quickControlsProps.onDisconnect}
          />
        </>
      )}
    </aside>
  );
}
