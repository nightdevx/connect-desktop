import { useEffect, useRef, useState } from "react";
import { Switch, Modal, Select, Input } from "antd";
import {
  CloseOutlined,
  DashboardOutlined,
  DisconnectOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import type {
  LobbyDescriptor,
  SelectablePresenceStatus,
} from "@shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "@shared/desktop-api-types";
import type { UseQueryResult } from "@tanstack/react-query";
import type { VideoQualitySnapshot } from "../../hooks/lobby/use-video-quality";
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
    presenceStatus: SelectablePresenceStatus;
    onPresenceStatusChange: (status: SelectablePresenceStatus) => void;
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
      password?: string,
    ) => Promise<boolean>;
    onUpdateLobby: (
      lobbyId: string,
      name: string,
      isLocked?: boolean,
      allowedUsers?: string[],
      password?: string | null,
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
    micEnabled: boolean;
    /** Gerçek aktif mod: "none" (devre dışı) | "browser" (tarayıcı NS) | "processor" (RNNoise) */
    activeNoiseMode: "none" | "browser" | "processor";
    onToggleEnhancedNoiseSuppression: () => void;
  };
  videoQualityProps: VideoQualitySnapshot;
}

const TONE_LABELS: Record<
  WorkspaceSidebarProps["audioConnectionProps"]["tone"],
  string
> = {
  ok: "Gecikme düşük",
  warn: "Yüksek ping",
  error: "Bağlantı kesildi",
  idle: "Bağlanıyor",
};

export function WorkspaceSidebar({
  sectionTitle,
  workspaceSection,
  usersProps,
  lobbiesProps,
  settingsProps,
  quickControlsProps,
  audioConnectionProps,
  audioProcessingProps,
  videoQualityProps,
}: WorkspaceSidebarProps) {
  const [isCreateLobbyOpen, setIsCreateLobbyOpen] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
  const [newLobbyPassword, setNewLobbyPassword] = useState("");
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
      <ExclamationCircleOutlined aria-hidden="true" />
    ) : audioConnectionProps.tone === "warn" ? (
      <ThunderboltOutlined aria-hidden="true" />
    ) : (
      <WifiOutlined aria-hidden="true" />
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

  const handleCreateLobbySubmit = async (): Promise<void> => {
    if (lobbiesProps.isCreatingLobby) {
      return;
    }

    const created = await lobbiesProps.onCreateLobby(
      newLobbyName,
      isLocked,
      allowedUsers,
      newLobbyPassword.trim() || undefined,
    );
    if (!created) {
      return;
    }

    setNewLobbyName("");
    setIsLocked(false);
    setAllowedUsers([]);
    setNewLobbyPassword("");
    setIsCreateLobbyOpen(false);
  };

  return (
    <aside className="ct-sidebar" aria-label="Yan panel">
      <header className="ct-sidebar-header">
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
            <PlusOutlined />
          </button>
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
            presenceStatus={usersProps.presenceStatus}
            onPresenceStatusChange={usersProps.onPresenceStatusChange}
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
              >
                <header className="ct-audio-popover-header">
                  <h4>Ses Bağlantı Durumu</h4>
                  <button
                    type="button"
                    className="ct-user-popup-close"
                    onClick={() => setIsAudioPopupOpen(false)}
                    aria-label="Detay penceresini kapat"
                  >
                    <CloseOutlined aria-hidden="true" />
                  </button>
                </header>

                <p
                  className={`ct-audio-popover-status ${audioConnectionProps.tone}`}
                >
                  {TONE_LABELS[audioConnectionProps.tone]}
                </p>

                <div className="ct-audio-details-grid">
                  <div className="ct-metric-tile">
                    <span>
                      <DashboardOutlined /> Gecikme (Ping)
                    </span>
                    <strong>
                      {audioConnectionProps.pingMs !== null
                        ? `${audioConnectionProps.pingMs} ms`
                        : "-"}
                    </strong>
                  </div>

                  <div className="ct-metric-tile">
                    <span>
                      <DisconnectOutlined /> Paket Kaybı
                    </span>
                    <strong
                      className={
                        (audioConnectionProps.packetLossPct ?? 0) > 1
                          ? "alarm"
                          : undefined
                      }
                    >
                      {audioConnectionProps.packetLossPct !== null
                        ? `${audioConnectionProps.packetLossPct.toFixed(1)}%`
                        : "%0.0"}
                    </strong>
                  </div>
                </div>

                {videoQualityProps.active && (
                  <section
                    className={`ct-video-quality ${videoQualityProps.tone}`}
                    aria-label="Yayın kalitesi"
                  >
                    <h5>Yayın Kalitesi</h5>

                    {videoQualityProps.problem && (
                      <p className="ct-video-quality-problem">
                        {videoQualityProps.problem}
                      </p>
                    )}

                    {videoQualityProps.outgoing && (
                      <dl className="ct-video-quality-rows">
                        <div>
                          <dt>Gönderilen</dt>
                          <dd>
                            {videoQualityProps.outgoing.resolution}
                            {videoQualityProps.outgoing.fps !== null &&
                              ` · ${videoQualityProps.outgoing.fps} fps`}
                            {videoQualityProps.outgoing.bitrateMbps !== null &&
                              ` · ${videoQualityProps.outgoing.bitrateMbps} Mbps`}
                          </dd>
                        </div>
                        <div>
                          <dt>Kodlayıcı</dt>
                          <dd>
                            {videoQualityProps.outgoing.codec ?? "-"}
                            {videoQualityProps.outgoing.hardware === true
                              ? " · donanım"
                              : videoQualityProps.outgoing.hardware === false
                                ? " · yazılım"
                                : ""}
                            {` · ${videoQualityProps.outgoing.layerCount} katman`}
                          </dd>
                        </div>
                        {videoQualityProps.headroomMbps !== null && (
                          <div>
                            <dt>Yükleme başlık payı</dt>
                            <dd>{videoQualityProps.headroomMbps} Mbps</dd>
                          </div>
                        )}
                      </dl>
                    )}

                    {videoQualityProps.incoming && (
                      <dl className="ct-video-quality-rows">
                        <div>
                          <dt>Alınan</dt>
                          <dd>
                            {videoQualityProps.incoming.resolution}
                            {videoQualityProps.incoming.fps !== null &&
                              ` · ${videoQualityProps.incoming.fps} fps`}
                            {videoQualityProps.incoming.bitrateMbps !== null &&
                              ` · ${videoQualityProps.incoming.bitrateMbps} Mbps`}
                          </dd>
                        </div>
                        <div>
                          <dt>Donma</dt>
                          <dd
                            className={
                              (videoQualityProps.incoming.freezeCount ?? 0) > 0
                                ? "alarm"
                                : undefined
                            }
                          >
                            {videoQualityProps.incoming.freezeCount ?? 0} kez
                            {videoQualityProps.incoming.jitterBufferMs !== null &&
                              ` · ${videoQualityProps.incoming.jitterBufferMs} ms tampon`}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </section>
                )}

                <div className="ct-audio-popover-actions">
                  <div className="ct-audio-toggle-row">
                    <div>
                      <strong>RNNoise Gürültü Bastırma</strong>
                      <span>Arka plan seslerini temizler.</span>
                    </div>
                    <Switch
                      checked={
                        audioProcessingProps.enhancedNoiseSuppressionEnabled
                      }
                      onChange={
                        audioProcessingProps.onToggleEnhancedNoiseSuppression
                      }
                      size="small"
                    />
                  </div>

                  {audioProcessingProps.enhancedNoiseSuppressionEnabled && (
                    <div
                      className={`ct-ns-mode-badge ct-ns-mode-badge--${audioProcessingProps.activeNoiseMode}`}
                      role="status"
                      aria-live="polite"
                      title="Aktif gürültü bastırma modu"
                    >
                      <span className="ct-ns-mode-dot" aria-hidden="true" />
                      {audioProcessingProps.activeNoiseMode === "processor"
                        ? "RNNoise Filtresi Aktif"
                        : audioProcessingProps.activeNoiseMode === "browser"
                          ? "Tarayıcı Filtresi (Geri Dönüş)"
                          : audioProcessingProps.micEnabled
                            ? "Başlatılıyor..."
                            : "Mikrofon açılınca etkinleşecek"}
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
        rootClassName="ct-modal"
        title="Yeni Lobi Oluştur"
        open={isCreateLobbyOpen}
        onOk={() => void handleCreateLobbySubmit()}
        onCancel={() => setIsCreateLobbyOpen(false)}
        confirmLoading={lobbiesProps.isCreatingLobby}
        okButtonProps={{ disabled: newLobbyName.trim().length < 2 }}
        okText={lobbiesProps.isCreatingLobby ? "Oluşturuluyor..." : "Oluştur"}
        cancelText="İptal"
        destroyOnHidden
      >
        <div className="ct-modal-form">
          <label className="ct-field">
            <span>Lobi Adı</span>
            <input
              type="text"
              className="ct-input"
              value={newLobbyName}
              onChange={(event) => setNewLobbyName(event.target.value)}
              placeholder="Örn. Geliştirme Odası"
              maxLength={64}
            />
          </label>

          <div className="ct-field-row">
            <div className="ct-field-row-text">
              <strong>Kilitli Oda</strong>
              <span>Yalnızca davet edilen kişiler katılabilir</span>
            </div>
            <Switch checked={isLocked} onChange={setIsLocked} />
          </div>

          {isLocked && (
            <label className="ct-field">
              <span>İzin Verilecek Kullanıcılar</span>
              <Select
                mode="multiple"
                placeholder="Kullanıcıları seçin..."
                value={allowedUsers}
                onChange={setAllowedUsers}
                options={lobbiesProps.allUsers
                  .filter((u) => u.id !== lobbiesProps.currentUserId)
                  .map((u) => ({
                    label: `@${u.username} (${u.displayName})`,
                    value: u.id,
                  }))}
              />
            </label>
          )}

          <label className="ct-field">
            <span>Oda Şifresi (opsiyonel)</span>
            <Input.Password
              placeholder="Şifre belirleyin (boş = şifresiz)"
              value={newLobbyPassword}
              onChange={(event) => setNewLobbyPassword(event.target.value)}
              maxLength={128}
            />
            <small className="ct-field-hint">
              Şifreyi bilen herkes bu odaya katılabilir.
            </small>
          </label>
        </div>
      </Modal>
    </aside>
  );
}


