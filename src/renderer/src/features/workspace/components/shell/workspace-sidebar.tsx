import { useEffect, useRef, useState } from "react";
import { Activity, Plus, Wifi, WifiOff, X } from "lucide-react";
import { Switch, Divider, Modal, Select } from "antd";
import { 
  DashboardOutlined, 
  DisconnectOutlined, 
  SyncOutlined,
  HourglassOutlined,
  GlobalOutlined,
  WifiOutlined
} from "@ant-design/icons";
import type { LobbyDescriptor } from "@shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "@shared/desktop-api-types";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  SettingsSection,
  WorkspaceSection,
} from "@/store/ui-store";
import type { UseWorkspaceUsersResult } from "../../hooks";
import type { CallSessionState } from "../../hooks/user/use-call-session";
import { LobbiesSidebarPanel } from "../lobby";
import { QuickControls } from "../common";
import { SettingsSidebarTabs } from "../settings";
import { UsersSidebarPanel } from "../user";

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
    callState?: CallSessionState;
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
    onCreateLobby: (
      name: string,
      isLocked?: boolean,
      allowedUsers?: string[],
    ) => Promise<boolean>;
    onUpdateLobby: (
      lobbyId: string,
      name: string,
      isLocked?: boolean,
      allowedUsers?: string[],
    ) => Promise<boolean>;
    onDeleteLobby: (lobbyId: string) => Promise<boolean>;
    isCreatingLobby: boolean;
    renamingLobbyId: string | null;
    deletingLobbyId: string | null;
    currentUserId: string;
    currentUserRole: string;
    allUsers: Array<{ id: string; username: string; displayName: string }>;
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
    audioInputDevices: MediaDeviceInfo[];
    audioOutputDevices: MediaDeviceInfo[];
    selectedAudioInputDeviceId: string | null;
    selectedAudioOutputDeviceId: string | null;
    onSelectAudioInputDevice: (deviceId: string | null) => void;
    onSelectAudioOutputDevice: (deviceId: string | null) => void;
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
    /** Gerçek aktif mod: "none" (devre dışı) | "browser" (tarayıcı NS) | "processor" (RNNoise) */
    activeNoiseMode: "none" | "browser" | "processor";
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
  const [isLocked, setIsLocked] = useState(false);
  const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
  const [isAudioPopupOpen, setIsAudioPopupOpen] = useState(false);
  const audioAnchorRef = useRef<HTMLDivElement | null>(null);

  const handleCreateLobbyClick = (): void => {
    if (workspaceSection !== "lobbies" || lobbiesProps.isCreatingLobby) {
      return;
    }

    setNewLobbyName("");
    setIsLocked(false);
    setAllowedUsers([]);
    setIsCreateLobbyOpen(true);
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

    const created = await lobbiesProps.onCreateLobby(newLobbyName, isLocked, allowedUsers);
    if (!created) {
      return;
    }

    setNewLobbyName("");
    setIsLocked(false);
    setAllowedUsers([]);
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

        {/* Lobi Oluşturma Modali alt tarafta Modal bileşeni olarak yer alıyor */}
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
            callState={usersProps.callState}
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
            onUpdateLobby={lobbiesProps.onUpdateLobby}
            onDeleteLobby={lobbiesProps.onDeleteLobby}
            renamingLobbyId={lobbiesProps.renamingLobbyId}
            deletingLobbyId={lobbiesProps.deletingLobbyId}
            currentUserId={lobbiesProps.currentUserId}
            currentUserRole={lobbiesProps.currentUserRole}
            allUsers={lobbiesProps.allUsers}
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
                className="ct-audio-popover ct-stagger-entry"
                role="dialog"
                aria-modal="false"
                aria-label="Ses bağlantı detayları"
                style={{
                  padding: "16px",
                  borderRadius: "14px",
                  background: "rgba(10, 10, 10, 0.75)",
                  backdropFilter: "blur(24px)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  boxShadow: "0 24px 50px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.05)",
                  width: "calc(100% - 24px)",
                  margin: "0 auto",
                  left: "12px",
                  right: "12px"
                }}
              >
                <header className="ct-audio-popover-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h4 style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "#ffffff" }}>Ses Bağlantı Durumu</h4>
                  <button
                    type="button"
                    className="ct-user-popup-close"
                    onClick={() => setIsAudioPopupOpen(false)}
                    aria-label="Detay penceresini kapat"
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(255, 255, 255, 0.45)",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "4px",
                      transition: "all 0.15s"
                    }}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </header>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  {(() => {
                    const tone = audioConnectionProps.tone;
                    if (tone === "ok") {
                      return (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{
                            width: "8px",
                            height: "8px",
                            background: "#22c55e",
                            borderRadius: "50%",
                            boxShadow: "0 0 8px #22c55e",
                            display: "inline-block"
                          }} />
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", fontWeight: "500" }}>Gecikme Düşük</span>
                        </span>
                      );
                    }
                    if (tone === "warn") {
                      return (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{
                            width: "8px",
                            height: "8px",
                            background: "#eab308",
                            borderRadius: "50%",
                            boxShadow: "0 0 8px #eab308",
                            display: "inline-block"
                          }} />
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", fontWeight: "500" }}>Yüksek Ping</span>
                        </span>
                      );
                    }
                    if (tone === "error") {
                      return (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{
                            width: "8px",
                            height: "8px",
                            background: "#ef4444",
                            borderRadius: "50%",
                            boxShadow: "0 0 8px #ef4444",
                            display: "inline-block"
                          }} />
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", fontWeight: "500" }}>Bağlantı Kesildi</span>
                        </span>
                      );
                    }
                    return (
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{
                          width: "8px",
                          height: "8px",
                          background: "rgba(255,255,255,0.25)",
                          borderRadius: "50%",
                          display: "inline-block"
                        }} />
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", fontWeight: "500" }}>Bağlanıyor</span>
                      </span>
                    );
                  })()}
                </div>

                <div className="ct-audio-details-grid" style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  marginBottom: "12px"
                }}>
                  <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <DashboardOutlined style={{ fontSize: "11px" }} /> Gecikme (Ping)
                    </span>
                    <strong style={{ fontSize: "12px", color: "#ffffff" }}>
                      {audioConnectionProps.pingMs !== null ? `${audioConnectionProps.pingMs} ms` : "-"}
                    </strong>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", padding: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <DisconnectOutlined style={{ fontSize: "11px" }} /> Paket Kaybı
                    </span>
                    <strong style={{ fontSize: "12px", color: audioConnectionProps.packetLossPct && audioConnectionProps.packetLossPct > 1 ? "#ff4d4f" : "#ffffff" }}>
                      {audioConnectionProps.packetLossPct !== null ? `${audioConnectionProps.packetLossPct.toFixed(1)}%` : "%0.0"}
                    </strong>
                  </div>
                </div>

                <Divider style={{ margin: "12px 0", borderColor: "rgba(255,255,255,0.06)" }} />

                <div className="ct-audio-popover-actions" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <strong style={{ fontSize: "12px", color: "#ffffff" }}>RNNoise Gürültü Bastırma</strong>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Arka plan seslerini temizler.</span>
                    </div>
                    <Switch
                      checked={audioProcessingProps.enhancedNoiseSuppressionEnabled}
                      onChange={() => {
                        audioProcessingProps.onToggleEnhancedNoiseSuppression();
                      }}
                      size="small"
                      style={{
                        background: audioProcessingProps.enhancedNoiseSuppressionEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.15)",
                      }}
                    />
                  </div>

                  {audioProcessingProps.enhancedNoiseSuppressionEnabled && (
                    <div
                      className={`ct-ns-mode-badge ct-ns-mode-badge--${
                        audioProcessingProps.activeNoiseMode
                      }`}
                      role="status"
                      aria-live="polite"
                      title="Aktif gürültü bastırma modu"
                      style={{
                        marginTop: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "10px",
                        fontWeight: "600",
                        color: "rgba(255,255,255,0.65)",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        padding: "6px 8px",
                        borderRadius: "4px"
                      }}
                    >
                      {audioProcessingProps.activeNoiseMode === "processor" && (
                        <>
                          <span
                            className="ct-ns-mode-dot"
                            aria-hidden="true"
                            style={{
                              width: "6px",
                              height: "6px",
                              background: "#52c41a",
                              borderRadius: "50%",
                              boxShadow: "0 0 6px #52c41a"
                            }}
                          />
                          RNNoise Filtresi Aktif
                        </>
                      )}
                      {audioProcessingProps.activeNoiseMode === "browser" && (
                        <>
                          <span
                            className="ct-ns-mode-dot"
                            aria-hidden="true"
                            style={{
                              width: "6px",
                              height: "6px",
                              background: "#faad14",
                              borderRadius: "50%"
                            }}
                          />
                          Tarayıcı Filtresi (Geri Dönüş)
                        </>
                      )}
                      {audioProcessingProps.activeNoiseMode === "none" && (
                        <>
                          <span
                            className="ct-ns-mode-dot"
                            aria-hidden="true"
                            style={{
                              width: "6px",
                              height: "6px",
                              background: "rgba(255,255,255,0.25)",
                              borderRadius: "50%"
                            }}
                          />
                          Başlatılıyor...
                        </>
                      )}
                    </div>
                  )}
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
            audioInputDevices={quickControlsProps.audioInputDevices}
            audioOutputDevices={quickControlsProps.audioOutputDevices}
            selectedAudioInputDeviceId={
              quickControlsProps.selectedAudioInputDeviceId
            }
            selectedAudioOutputDeviceId={
              quickControlsProps.selectedAudioOutputDeviceId
            }
            onSelectAudioInputDevice={
              quickControlsProps.onSelectAudioInputDevice
            }
            onSelectAudioOutputDevice={
              quickControlsProps.onSelectAudioOutputDevice
            }
            onToggleMic={quickControlsProps.onToggleMic}
            onToggleHeadphone={quickControlsProps.onToggleHeadphone}
            onDisconnect={quickControlsProps.onDisconnect}
          />
        </>
      )}

      <Modal
        title={<span style={{ color: "#fff", fontSize: "16px", fontWeight: "600" }}>Yeni Lobi Oluştur</span>}
        open={isCreateLobbyOpen}
        onOk={() => void handleCreateLobbySubmit()}
        onCancel={() => setIsCreateLobbyOpen(false)}
        confirmLoading={lobbiesProps.isCreatingLobby}
        okButtonProps={{
          disabled: newLobbyName.trim().length < 2,
          style: {
            background: "#ffffff",
            color: "#000000",
            border: "none",
            borderRadius: "6px",
            fontWeight: "500",
          }
        }}
        cancelButtonProps={{
          style: {
            background: "rgba(255, 255, 255, 0.05)",
            color: "#ffffff",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "6px",
          }
        }}
        okText={lobbiesProps.isCreatingLobby ? "Oluşturuluyor..." : "Oluştur"}
        cancelText="İptal"
        modalRender={(modal) => (
          <div style={{
            background: "rgba(18, 18, 18, 0.85)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
            padding: "8px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
          }}>
            {modal}
          </div>
        )}
        styles={{
          body: {
            padding: "12px 0 0 0",
          }
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ color: "rgba(255, 255, 255, 0.65)", fontSize: "12px" }}>Lobi Adı</label>
            <input
              type="text"
              className="ct-input"
              value={newLobbyName}
              onChange={(event) => setNewLobbyName(event.target.value)}
              placeholder="Örn. Geliştirme Odası"
              maxLength={64}
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                padding: "8px 12px",
                color: "#ffffff",
                outline: "none",
                fontSize: "14px",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#ffffff", fontSize: "14px", fontWeight: "500" }}>Kilitli Oda</span>
              <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: "11px" }}>Yalnızca davet edilen kişiler katılabilir</span>
            </div>
            <Switch
              checked={isLocked}
              onChange={(checked) => setIsLocked(checked)}
              style={{
                background: isLocked ? "#ffffff" : "rgba(255, 255, 255, 0.15)",
              }}
            />
          </div>

          {isLocked && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ color: "rgba(255, 255, 255, 0.65)", fontSize: "12px" }}>İzin Verilecek Kullanıcılar</label>
              <Select
                mode="multiple"
                placeholder="Kullanıcıları seçin..."
                style={{ width: "100%" }}
                value={allowedUsers}
                onChange={(val) => setAllowedUsers(val)}
                options={lobbiesProps.allUsers
                  .filter((u) => u.id !== lobbiesProps.currentUserId)
                  .map((u) => ({
                    label: `@${u.username} (${u.displayName})`,
                    value: u.id,
                  }))}
                dropdownStyle={{
                  background: "#181818",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "8px",
                }}
              />
            </div>
          )}
        </div>
      </Modal>
    </aside>
  );
}


