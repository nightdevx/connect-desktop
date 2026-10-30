import type { LobbyFeatureId } from "@shared/desktop-api-types";
import { useEffect, useState } from "react";
import { Button, Switch, Modal, Select, Input, InputNumber, Tooltip } from "antd";
import {
  CheckOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  PlusOutlined,
  SoundOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { MODAL_WIDTH, ModalHeading } from "@/ui/modal-heading";
import type { FriendEntry, LobbyDescriptor } from "@shared/auth-contracts";
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
import type { FriendsController } from "../../hooks/user/use-friends";
import { FreeGamesSidebarPanel } from "@/features/free-games";
import { MinigamesSidebarPanel } from "@/features/minigames";
import { LobbiesCompactList, LobbiesSidebarPanel } from "../lobby";
import { SettingsSidebarTabs } from "../settings";
import { WorkspaceAudioStatus } from "./workspace-audio-status";
import { getApiErrorMessage } from "../../workspace-utils";
import { Avatar } from "../odak/odak-parts";
import { SEED_ADMIN_ID } from "@/features/auth";
import workspaceService from "../../services";
import { toast } from "@/services/toast";

interface WorkspaceSidebarProps {
  sectionTitle: string;
  workspaceSection: WorkspaceSection;
  /** Folded to a strip of icons (room badges in Lobiler), so the page gets the width. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  // Arkadaşlar draws its own page over the shell (OdakFriendsPage); this
  // sidebar is hidden there and only keeps the Arkadaş Ekle modal, which the
  // page's button opens through the shell.
  usersProps: {
    friends: FriendsController;
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
    /**
     * The room the voice is connected to, a 1:1 call included. activeLobbyId is
     * null during a call (the lobby list must not highlight a call room), and
     * the connection card read it: a running call showed "Lobiye bağlı değil".
     */
    voiceRoomId?: string | null;
    /** The text room being read, which is never a connection — see WorkspaceShell. */
    openTextRoomId: string | null;
    joiningLobbyId: string | null;
    unreadByLobbyId: Record<string, number>;
    /** The room menu's "Okundu işaretle". */
    onMarkLobbyRead: (lobbyId: string) => void;
    onJoinLobby: (lobbyId: string) => void;
    onCreateLobby: (
      name: string,
      isLocked?: boolean,
      allowedUsers?: string[],
      password?: string,
      isTextOnly?: boolean,
      capacity?: number,
    ) => Promise<boolean>;
    onUpdateLobby: (
      lobbyId: string,
      name: string,
      isLocked?: boolean,
      allowedUsers?: string[],
      password?: string | null,
      capacity?: number,
      disabledFeatures?: LobbyFeatureId[],
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

const ROOM_TYPES = [
  { textOnly: false, icon: <SoundOutlined />, title: "Sesli oda", hint: "Konuşma, ekran, müzik" },
  { textOnly: true, icon: <MessageOutlined />, title: "Mesaj odası", hint: "Yalnız yazışma" },
];

export function WorkspaceSidebar({
  sectionTitle,
  workspaceSection,
  collapsed = false,
  onToggleCollapsed,
  usersProps,
  lobbiesProps,
  settingsProps,
  audioProcessingProps,
  liveKitConnectionState,
}: WorkspaceSidebarProps) {
  const [isCreateLobbyOpen, setIsCreateLobbyOpen] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
  const [newLobbyPassword, setNewLobbyPassword] = useState("");
  const [isTextOnly, setIsTextOnly] = useState(false);
  // Empty means "whatever the server's default is", which is what every room
  // used to get with no way to say otherwise.
  const [newLobbyCapacity, setNewLobbyCapacity] = useState<number | null>(null);
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
  // The server's answer stays in the dialog: a refusal under the field, a
  // success in place of the form.
  const [friendError, setFriendError] = useState<string | null>(null);
  const [friendSent, setFriendSent] = useState<{ username: string; message: string } | null>(
    null,
  );

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
        toast.error(
          result.error?.code === "USER_NOT_FOUND" ||
            result.error?.code === "VALIDATION_ERROR"
            ? "Kullanıcı bulunamadı."
            : getApiErrorMessage(result.error),
        );
        return;
      }

      const user = result.data.user;
      if (user.userId === lobbiesProps.currentUserId) {
        toast.info("Oda sahibi zaten girebilir.");
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

  // The modal is opened from the friends page, through the shell, so the field
  // is cleared on the transition rather than at the caller.
  useEffect(() => {
    if (usersProps.isAddFriendOpen) {
      setFriendUsername("");
      setFriendError(null);
      setFriendSent(null);
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
        setFriendError(result.message);
        return;
      }

      setFriendSent({ username: friendUsername.trim(), message: result.message });
      setFriendUsername("");
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
      // A text room has no roster to limit, so its ceiling is never sent.
      isTextOnly ? undefined : (newLobbyCapacity ?? undefined),
    );
    if (!created) {
      return;
    }

    setNewLobbyName("");
    setIsLocked(false);
    setAllowedUsers([]);
    setNewLobbyPassword("");
    setIsTextOnly(false);
    setNewLobbyCapacity(null);
    setLookedUpUsers([]);
    setLookupUsername("");
    setIsCreateLobbyOpen(false);
  };

  // Rendered by both the folded and the open sidebar: Arkadaş ekle is also
  // opened from the friends page, whichever way the sidebar is.
  // 3-32 mirrors the backend username pattern and the IPC zod schema. The old
  // 2/64 bounds were copied from the id-shaped block schema, so anything
  // outside 3-32 died as a ZodError and surfaced as the generic "Arkadaşlık
  // isteği gönderilemedi." with no hint about the length.
  const canSendFriendRequest = friendUsername.trim().length >= 3;
  const closeAddFriend = (): void => usersProps.onAddFriendOpenChange(false);
  const addFriendModal = (
    <Modal
      rootClassName="ct-modal"
      title={
        <ModalHeading
          icon={<UserAddOutlined />}
          title="Arkadaş ekle"
          description={
            friendSent ? undefined : "Kullanıcı adını yaz; kabul edince listende görünür."
          }
        />
      }
      open={usersProps.isAddFriendOpen}
      onOk={() => void handleAddFriendSubmit()}
      onCancel={closeAddFriend}
      confirmLoading={isSendingFriendRequest}
      okButtonProps={{ disabled: !canSendFriendRequest }}
      okText={isSendingFriendRequest ? "Gönderiliyor…" : "İstek gönder"}
      cancelText="Vazgeç"
      footer={
        friendSent
          ? [
              <Button key="again" onClick={() => setFriendSent(null)}>
                Bir kişi daha
              </Button>,
              <Button key="done" type="primary" onClick={closeAddFriend}>
                Tamam
              </Button>,
            ]
          : undefined
      }
      width={MODAL_WIDTH.s}
      destroyOnHidden
    >
      {friendSent ? (
        <div className="ct-modal-success" role="status">
          <span className="ct-modal-success-mark" aria-hidden="true">
            <CheckOutlined />
          </span>
          <strong>{friendSent.message.replace(/\.$/, "")}</strong>
          <span>@{friendSent.username} kabul edince arkadaş listende görünür.</span>
          <div className="ct-confirm-subject">
            <Avatar
              userId={friendSent.username}
              name={friendSent.username}
              className="ct-confirm-subject-avatar"
            />
            <span className="ct-confirm-subject-name">
              <strong>{friendSent.username}</strong>
              <span>@{friendSent.username}</span>
            </span>
            <span className="ct-confirm-subject-detail">
              <ClockCircleOutlined /> Yanıt bekliyor
            </span>
          </div>
        </div>
      ) : (
        <div className="ct-modal-form">
          <label className="ct-field">
            <span>Kullanıcı adı</span>
            <span className="ct-field-at">
              <span aria-hidden="true">@</span>
              <input
                type="text"
                className={`ct-input${friendError ? " invalid" : ""}`}
                value={friendUsername}
                onChange={(event) => {
                  setFriendUsername(event.target.value);
                  setFriendError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSendFriendRequest) {
                    event.preventDefault();
                    void handleAddFriendSubmit();
                  }
                }}
                placeholder="kullanıcı adı"
                maxLength={32}
                autoFocus
                aria-invalid={friendError ? true : undefined}
                aria-describedby="ct-add-friend-hint"
              />
            </span>
            {friendError ? (
              <small id="ct-add-friend-hint" className="ct-field-error" role="alert">
                <ExclamationCircleOutlined />
                {friendError}
              </small>
            ) : (
              <small id="ct-add-friend-hint" className="ct-field-hint">
                En az 3 harf; adı tam olarak yaz.
              </small>
            )}
          </label>
        </div>
      )}
    </Modal>
  );

  // Both branches too: the folded strip has its own "+" at the foot.
  const createLobbyModal = (
    <Modal
      rootClassName="ct-modal"
      title={
        <ModalHeading
          icon={<PlusOutlined />}
          title="Yeni oda oluştur"
          description="Arkadaşlarının katılabileceği bir oda aç."
        />
      }
      open={isCreateLobbyOpen}
      onOk={() => void handleCreateLobbySubmit()}
      onCancel={() => setIsCreateLobbyOpen(false)}
      confirmLoading={lobbiesProps.isCreatingLobby}
      okButtonProps={{ disabled: newLobbyName.trim().length < 2 }}
      okText={lobbiesProps.isCreatingLobby ? "Oluşturuluyor…" : "Oluştur"}
      cancelText="Vazgeç"
      width={MODAL_WIDTH.m}
      destroyOnHidden
    >
      <div className="ct-modal-form">
        <label className="ct-field">
          <span className="ct-field-label-row">
            Oda adı
            <span className="ct-field-count">{newLobbyName.length}/64</span>
          </span>
          <input
            type="text"
            className="ct-input"
            value={newLobbyName}
            onChange={(event) => setNewLobbyName(event.target.value)}
            placeholder="Örn. Oyun Odası"
            maxLength={64}
            autoFocus
          />
        </label>

        {/* Create-only: the flag is immutable afterwards, so "Lobi Ayarları"
            has no counterpart for it. Two cards rather than a select: the
            hint under each says what the type means. */}
        <div className="ct-field">
          <span id="ct-room-type-label">Tür</span>
          <div className="ct-choice-row" role="radiogroup" aria-labelledby="ct-room-type-label">
            {ROOM_TYPES.map((choice) => (
              <button
                key={choice.title}
                type="button"
                role="radio"
                aria-checked={isTextOnly === choice.textOnly}
                className={`ct-choice${isTextOnly === choice.textOnly ? " selected" : ""}`}
                onClick={() => handleRoomTypeChange(choice.textOnly)}
              >
                <strong>
                  {choice.icon}
                  {choice.title}
                </strong>
                <span>{choice.hint}</span>
                {isTextOnly === choice.textOnly && (
                  <span className="ct-choice-check" aria-hidden="true">
                    <CheckOutlined />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Voice only: nobody is ever on a text room's roster, so a limit
            there would be a number that never applies to anything. */}
        {!isTextOnly && (
          <label className="ct-field">
            <span>Kişi sınırı</span>
            <InputNumber
              className="ct-input-number"
              min={2}
              max={100}
              value={newLobbyCapacity}
              onChange={(value) => setNewLobbyCapacity(value ?? null)}
              placeholder="Sunucu varsayılanı"
            />
            <small className="ct-field-hint">
              Boş bırakırsan sunucunun varsayılan sınırı geçerli olur.
            </small>
          </label>
        )}

        <div className="ct-field-row">
          <div className="ct-field-row-text">
            <strong>Kilitli oda</strong>
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
            <span>İzin verilecek kişiler</span>
            <Select
              mode="multiple"
              placeholder="Arkadaşlarından seç…"
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
            <span>Oda şifresi (isteğe bağlı)</span>
            <Input.Password
              placeholder="Şifre belirle (boş = şifresiz)"
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
  );

  if (collapsed) {
    return (
      <aside key="folded" className="ct-sidebar collapsed" aria-label="Yan panel">
        <header className="ct-sidebar-header">
          <Tooltip title="Kenar çubuğunu genişlet" placement="right">
            <button
              type="button"
              className="ct-sidebar-header-action"
              onClick={onToggleCollapsed}
              aria-label="Kenar çubuğunu genişlet"
              aria-expanded={false}
            >
              <MenuUnfoldOutlined />
            </button>
          </Tooltip>
        </header>
        {/* Lobiler gets its own strip; every other section is a list of icon
            rows already, and the stylesheet folds it to the icons. */}
        <div className="ct-sidebar-body">
          {workspaceSection === "lobbies" && (
            <LobbiesCompactList
              lobbies={lobbiesProps.lobbies}
              lobbyMembersById={lobbiesProps.lobbyMembersById}
              activeLobbyId={lobbiesProps.activeLobbyId}
              openTextRoomId={lobbiesProps.openTextRoomId}
              joiningLobbyId={lobbiesProps.joiningLobbyId}
              renamingLobbyId={lobbiesProps.renamingLobbyId}
              deletingLobbyId={lobbiesProps.deletingLobbyId}
              unreadByLobbyId={lobbiesProps.unreadByLobbyId}
              onMarkLobbyRead={lobbiesProps.onMarkLobbyRead}
              onJoinLobby={lobbiesProps.onJoinLobby}
              onCreateLobby={handleCreateLobbyClick}
              isCreatingLobby={lobbiesProps.isCreatingLobby}
            />
          )}

          {workspaceSection === "free-games" && <FreeGamesSidebarPanel />}

          {workspaceSection === "minigames" && <MinigamesSidebarPanel />}

          {workspaceSection === "settings" && (
            <SettingsSidebarTabs
              settingsSection={settingsProps.settingsSection}
              onSettingsSectionChange={settingsProps.setSettingsSection}
            />
          )}
        </div>
        {createLobbyModal}
        {addFriendModal}
      </aside>
    );
  }

  return (
    <aside key="full" className="ct-sidebar" aria-label="Yan panel">

      <header className="ct-sidebar-header">
        <h3>{sectionTitle}</h3>

        {workspaceSection === "lobbies" && (
          <Tooltip title="Oda oluştur">
            <button
              type="button"
              className="ct-sidebar-header-action ct-sidebar-header-create"
              onClick={handleCreateLobbyClick}
              disabled={lobbiesProps.isCreatingLobby}
              aria-label="Lobi oluştur"
            >
              <PlusOutlined />
            </button>
          </Tooltip>
        )}

        {onToggleCollapsed && (
          <Tooltip title="Kenar çubuğunu daralt">
            <button
              type="button"
              className="ct-sidebar-header-action"
              onClick={onToggleCollapsed}
              aria-label="Kenar çubuğunu daralt"
              aria-expanded={true}
            >
              <MenuFoldOutlined />
            </button>
          </Tooltip>
        )}
      </header>

      <div className="ct-sidebar-body">
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
            onMarkLobbyRead={lobbiesProps.onMarkLobbyRead}
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

      {/* Not in Arkadaşlar either: the sidebar is hidden under its page. */}
      {(workspaceSection === "lobbies" || workspaceSection === "minigames") && (
        <WorkspaceAudioStatus
          activeLobbyId={lobbiesProps.voiceRoomId ?? lobbiesProps.activeLobbyId}
          liveKitConnectionState={liveKitConnectionState}
          audioProcessingProps={audioProcessingProps}
        />
      )}

      {createLobbyModal}

      {addFriendModal}
    </aside>
  );
}


