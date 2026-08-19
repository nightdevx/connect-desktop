import { useEffect, useState } from "react";
import { Switch, Modal, Select, Input, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type {
  FriendEntry,
  LobbyDescriptor,
  SelectablePresenceStatus,
  UserDirectoryEntry,
} from "@shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "@shared/desktop-api-types";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  SettingsSection,
  WorkspaceSection,
} from "@/store/ui-store";
import type {
  LiveKitConnectionStatus,
  RemoteParticipantAudioPreference,
} from "@/features/livekit";
import type { CallSessionState } from "../../hooks/user/use-call-session";
import type { FriendsController } from "../../hooks/user/use-friends";
import type { OpenConversation } from "../../hooks/user/use-open-conversations";
import { FreeGamesSidebarPanel } from "@/features/free-games";
import { MinigamesSidebarPanel } from "@/features/minigames";
import { LobbiesSidebarPanel } from "../lobby";
import { SettingsSidebarTabs } from "../settings";
import { UsersSidebarPanel } from "../user";
import { WorkspaceAudioStatus } from "./workspace-audio-status";
import { getApiErrorMessage } from "../../workspace-utils";
import { SEED_ADMIN_ID } from "@/features/auth";
import workspaceService from "../../services";

interface WorkspaceSidebarProps {
  sectionTitle: string;
  workspaceSection: WorkspaceSection;
  usersProps: {
    conversations: OpenConversation[];
    onCloseConversation: (userId: string) => void;
    /** Clears the selection without closing anything. */
    onOpenHome: () => void;
    /** Friends + self: presence and status labels only, never names. */
    directoryUsers: UserDirectoryEntry[];
    selectedUserId: string | null;
    onUserSelect: (userId: string) => void;
    unreadByUserId: Record<string, number>;
    friends: FriendsController;
    callState?: CallSessionState;
    presenceStatus: SelectablePresenceStatus;
    onPresenceStatusChange: (status: SelectablePresenceStatus) => void;
    // Owned by the shell because the friends home has the same button, and the
    // modal itself stays here in the header where the + lives.
    isAddFriendOpen: boolean;
    onAddFriendOpenChange: (open: boolean) => void;
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
    /** The text room being read, which is never a connection — see WorkspaceShell. */
    openTextRoomId: string | null;
    joiningLobbyId: string | null;
    unreadByLobbyId: Record<string, number>;
    onJoinLobby: (lobbyId: string) => void;
    onCreateLobby: (
      name: string,
      isLocked?: boolean,
      allowedUsers?: string[],
      password?: string,
      isTextOnly?: boolean,
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
    /** Right-click -> Mesaj Gönder on a member row. */
    onOpenConversation: (userId: string) => void;
    /** Right-click -> local mute/volume, for the room this client is in. */
    participantAudio: {
      preferences: Record<string, RemoteParticipantAudioPreference>;
      setMuted: (userId: string, muted: boolean) => void;
      setVolume: (userId: string, volumePercent: number) => void;
      /** Their soundboard only, silenced locally. */
      setEmoteMuted: (userId: string, muted: boolean) => void;
    };
  };
  settingsProps: {
    settingsSection: SettingsSection;
    setSettingsSection: (section: SettingsSection) => void;
  };
  /** Transport state for the connection card; the numbers it shows come
      from the media-stats store, not from here. */
  liveKitConnectionState?: LiveKitConnectionStatus;
  audioProcessingProps: {
    enhancedNoiseSuppressionEnabled: boolean;
    micEnabled: boolean;
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
  audioProcessingProps,
  liveKitConnectionState,
}: WorkspaceSidebarProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [isCreateLobbyOpen, setIsCreateLobbyOpen] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
  const [newLobbyPassword, setNewLobbyPassword] = useState("");
  const [isTextOnly, setIsTextOnly] = useState(false);
  // allUsers is friends + self now, so the select alone can never reach a
  // stranger. These are the ones pulled in by exact username while this modal
  // is open — kept only so their tag renders a name instead of a bare id.
  const [lookedUpUsers, setLookedUpUsers] = useState<FriendEntry[]>([]);
  const [lookupUsername, setLookupUsername] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [friendUsername, setFriendUsername] = useState("");
  // sendRequest is keyed by username, so it marks no pendingUserIds — there is
  // no user id to hang one on until the server answers. This button owns it.
  const [isSendingFriendRequest, setIsSendingFriendRequest] = useState(false);

  const handleCreateLobbyClick = (): void => {
    if (workspaceSection !== "lobbies" || lobbiesProps.isCreatingLobby) {
      return;
    }

    setNewLobbyName("");
    setIsLocked(false);
    setAllowedUsers([]);
    // Was missing: a password typed into a cancelled modal survived to the next
    // open and silently locked the next lobby created.
    setNewLobbyPassword("");
    setIsTextOnly(false);
    setLookedUpUsers([]);
    setLookupUsername("");
    setIsCreateLobbyOpen(true);
  };

  // The same picker the "Lobi Ayarları" modal has: friends come from the select,
  // anyone else by exact username. Fixing one of the two would have left a newly
  // created locked lobby openable to friends only.
  const handleLookupAdd = async (): Promise<void> => {
    // A pasted "@ali" is the same person as "ali"; the route matches exactly.
    const username = lookupUsername.trim().replace(/^@/, "");
    if (!username) {
      return;
    }

    setIsLookingUp(true);
    try {
      const result = await workspaceService.lookupUserByUsername({ username });
      if (!result.ok || !result.data) {
        messageApi.error(
          result.error?.code === "USER_NOT_FOUND" ||
            result.error?.code === "VALIDATION_ERROR"
            ? "Kullanıcı bulunamadı."
            : getApiErrorMessage(result.error),
        );
        return;
      }

      const user = result.data.user;
      if (user.userId === lobbiesProps.currentUserId) {
        messageApi.info("Lobi sahibi zaten erişebilir.");
        setLookupUsername("");
        return;
      }

      setLookedUpUsers((previous) =>
        previous.some((entry) => entry.userId === user.userId)
          ? previous
          : [...previous, user],
      );
      setAllowedUsers((previous) =>
        previous.includes(user.userId) ? previous : [...previous, user.userId],
      );
      setLookupUsername("");
    } finally {
      setIsLookingUp(false);
    }
  };

  // A password is only ever checked when joining, and a message room is never
  // joined — one typed before switching room type would be saved and enforce
  // nothing, so the field is dropped and the value with it.
  const handleRoomTypeChange = (nextIsTextOnly: boolean): void => {
    setIsTextOnly(nextIsTextOnly);
    setNewLobbyPassword("");
  };

  const handleAddFriendClick = (): void => {
    if (workspaceSection !== "users") {
      return;
    }

    usersProps.onAddFriendOpenChange(true);
  };

  // The modal is opened from two places now — this header and the friends home —
  // so the field is cleared on the transition rather than at one of the callers.
  useEffect(() => {
    if (usersProps.isAddFriendOpen) {
      setFriendUsername("");
    }
  }, [usersProps.isAddFriendOpen]);

  const handleAddFriendSubmit = async (): Promise<void> => {
    if (isSendingFriendRequest) {
      return;
    }

    setIsSendingFriendRequest(true);
    try {
      const result = await usersProps.friends.sendRequest(friendUsername);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      messageApi.success(result.message);
      setFriendUsername("");
      usersProps.onAddFriendOpenChange(false);
    } finally {
      setIsSendingFriendRequest(false);
    }
  };

  const handleCreateLobbySubmit = async (): Promise<void> => {
    if (lobbiesProps.isCreatingLobby) {
      return;
    }

    const created = await lobbiesProps.onCreateLobby(
      newLobbyName,
      isLocked,
      allowedUsers,
      newLobbyPassword.trim() || undefined,
      isTextOnly,
    );
    if (!created) {
      return;
    }

    setNewLobbyName("");
    setIsLocked(false);
    setAllowedUsers([]);
    setNewLobbyPassword("");
    setIsTextOnly(false);
    setLookedUpUsers([]);
    setLookupUsername("");
    setIsCreateLobbyOpen(false);
  };

  return (
    <aside className="ct-sidebar" aria-label="Yan panel">
      {contextHolder}

      <header className="ct-sidebar-header">
        <h3>{sectionTitle}</h3>

        {workspaceSection === "users" && (
          <button
            type="button"
            className="ct-sidebar-header-action"
            onClick={handleAddFriendClick}
            title="Arkadaş ekle"
            aria-label="Arkadaş ekle"
          >
            <PlusOutlined />
          </button>
        )}

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
            conversations={usersProps.conversations}
            onCloseConversation={usersProps.onCloseConversation}
            onOpenHome={usersProps.onOpenHome}
            directoryUsers={usersProps.directoryUsers}
            selectedUserId={usersProps.selectedUserId}
            onUserSelect={usersProps.onUserSelect}
            unreadByUserId={usersProps.unreadByUserId}
            friends={usersProps.friends}
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
            openTextRoomId={lobbiesProps.openTextRoomId}
            joiningLobbyId={lobbiesProps.joiningLobbyId}
            unreadByLobbyId={lobbiesProps.unreadByLobbyId}
            onJoinLobby={lobbiesProps.onJoinLobby}
            onUpdateLobby={lobbiesProps.onUpdateLobby}
            onDeleteLobby={lobbiesProps.onDeleteLobby}
            renamingLobbyId={lobbiesProps.renamingLobbyId}
            deletingLobbyId={lobbiesProps.deletingLobbyId}
            currentUserId={lobbiesProps.currentUserId}
            currentUserRole={lobbiesProps.currentUserRole}
            allUsers={lobbiesProps.allUsers}
            // Same controller the Arkadaşlar section runs on, so a request sent
            // from a roster row and one sent from the friends home cannot
            // disagree about what state the friendship is in.
            friends={usersProps.friends}
            onOpenConversation={lobbiesProps.onOpenConversation}
            participantAudio={lobbiesProps.participantAudio}
          />
        )}

        {/* No props: the panel owns its own data, and the shell has no
            interest in giveaways. */}
        {workspaceSection === "free-games" && <FreeGamesSidebarPanel />}

        {/* Same deal: the list of games and the personal bests both live in the
            ui store, so this panel and the board read one source. */}
        {workspaceSection === "minigames" && <MinigamesSidebarPanel />}

        {workspaceSection === "settings" && (
          <SettingsSidebarTabs
            settingsSection={settingsProps.settingsSection}
            onSettingsSectionChange={settingsProps.setSettingsSection}
          />
        )}
      </div>

      {workspaceSection !== "settings" && workspaceSection !== "free-games" && (
        <WorkspaceAudioStatus
          activeLobbyId={lobbiesProps.activeLobbyId}
          liveKitConnectionState={liveKitConnectionState}
          audioProcessingProps={audioProcessingProps}
        />
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

          {/* Create-only: the flag is immutable afterwards, so "Lobi Ayarları"
              has no counterpart for it. */}
          <label className="ct-field">
            <span>Oda Türü</span>
            <Select
              value={isTextOnly}
              onChange={handleRoomTypeChange}
              options={[
                { label: "Sesli Oda", value: false },
                { label: "Mesaj Odası", value: true },
              ]}
            />
            <small className="ct-field-hint">
              Mesaj odasında sesli bağlantı kurulmaz, sadece sohbet edilir.
            </small>
          </label>

          <div className="ct-field-row">
            <div className="ct-field-row-text">
              <strong>Kilitli Oda</strong>
              <span>
                {isTextOnly
                  ? "Yalnızca davet edilen kişiler görebilir"
                  : "Yalnızca davet edilen kişiler katılabilir"}
              </span>
            </div>
            <Switch checked={isLocked} onChange={setIsLocked} />
          </div>

          {isLocked && (
            <label className="ct-field">
              <span>İzin Verilecek Kullanıcılar</span>
              <Select
                mode="multiple"
                placeholder="Arkadaşlarından seç..."
                value={allowedUsers}
                onChange={setAllowedUsers}
                options={[
                  ...lobbiesProps.allUsers
                    .filter(
                      (u) =>
                        u.id !== lobbiesProps.currentUserId &&
                        u.id !== SEED_ADMIN_ID,
                    )
                    .map((u) => ({
                      label: `@${u.username} (${u.displayName})`,
                      value: u.id,
                    })),
                  ...lookedUpUsers.map((u) => ({
                    label: `@${u.username} (${u.displayName})`,
                    value: u.userId,
                  })),
                ]}
              />
              <Input.Search
                placeholder="Kullanıcı adıyla ekle"
                enterButton="Ekle"
                value={lookupUsername}
                onChange={(event) => setLookupUsername(event.target.value)}
                onSearch={() => void handleLookupAdd()}
                loading={isLookingUp}
                maxLength={32}
              />
            </label>
          )}

          {/* Sesli odalara özel: şifre yalnızca katılma sırasında sorulur ve
              mesaj odasına katılım diye bir şey yok. */}
          {!isTextOnly && (
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
          )}
        </div>
      </Modal>

      <Modal
        rootClassName="ct-modal"
        title="Arkadaş Ekle"
        open={usersProps.isAddFriendOpen}
        onOk={() => void handleAddFriendSubmit()}
        onCancel={() => usersProps.onAddFriendOpenChange(false)}
        confirmLoading={isSendingFriendRequest}
        okButtonProps={{
          // 3-32 mirrors the backend username pattern and the IPC zod schema.
          // The old 2/64 bounds were copied from the id-shaped block schema, so
          // anything outside 3-32 died as a ZodError and surfaced as the generic
          // "Arkadaşlık isteği gönderilemedi." with no hint about the length.
          disabled: friendUsername.trim().length < 3,
        }}
        okText={isSendingFriendRequest ? "Gönderiliyor..." : "İstek Gönder"}
        cancelText="İptal"
        destroyOnHidden
      >
        <div className="ct-modal-form">
          <label className="ct-field">
            <span>Kullanıcı Adı</span>
            <input
              type="text"
              className="ct-input"
              value={friendUsername}
              onChange={(event) => setFriendUsername(event.target.value)}
              placeholder="Örn. mehmet"
              maxLength={32}
            />
            <small className="ct-field-hint">
              Kullanıcı adını tam olarak yazın.
            </small>
          </label>
        </div>
      </Modal>
    </aside>
  );
}


