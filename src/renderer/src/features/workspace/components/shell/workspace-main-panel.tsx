import type { Dispatch, SetStateAction } from "react";
import type {
  ChatMessage,
  LobbyDescriptor,
  UserRole,
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
  UseDirectMessagesResult,
  UseLobbyRoomResult,
  CallSessionState,
} from "../../hooks";
import type { OngoingCallInfo } from "../../hooks/user/use-call-session";
import { LobbiesMainPanel } from "../lobby";
import { FreeGamesMainPanel } from "@/features/free-games";
import { MinigamesMainPanel } from "@/features/minigames";
import { SettingsMainPanel } from "../settings";
import type {
  AudioPreferences,
  CameraPreferences,
  StreamPreferences,
} from "../settings/settings-main-panel-types";
import { UsersDirectMessagesPanel } from "../user";
import type { FriendsHomePanelProps } from "../user";
import type {
  ParticipantMediaMap,
  RemoteParticipantAudioPreference,
} from "@/features/livekit";

interface WorkspaceMainPanelProps {
  sectionTitle: string;
  currentUsername: string;
  currentUserId: string;
  micEnabled: boolean;
  headphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteParticipantStreams: ParticipantMediaMap;
  remoteParticipantAudioPreferences: Record<
    string,
    RemoteParticipantAudioPreference
  >;
  activeSpeakerIds: string[];
  avatarByUserId: Record<string, string | null | undefined>;
  workspaceSection: WorkspaceSection;
  settingsSection: SettingsSection;
  currentUserRole: UserRole;
  onLogout: () => void;
  isLoggingOut: boolean;
  cameraPreferences: CameraPreferences;
  audioPreferences: AudioPreferences;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  streamPreferences: StreamPreferences;
  onSaveCameraPreferences: (next: CameraPreferences) => void;
  onSaveAudioPreferences: (next: AudioPreferences) => void;
  onSaveStreamPreferences: (next: StreamPreferences) => void;
  lobbies: LobbyDescriptor[];
  activeLobbyId: string | null;
  /**
   * activeLobbyId with 1:1 call rooms filtered out.
   *
   * A call runs in a room named `call_<id>` through the same machinery as a
   * lobby, so the raw id is what the media and DM surfaces need. The lobbies
   * panel must not see it: it opens its connected-room layer for any non-null
   * id, which meant being in a call replaced the lobby list with an empty room.
   */
  lobbyRoomId: string | null;
  unreadLobbyMessages: number;
  joiningLobbyId: string | null;
  onJoinLobby: (lobbyId: string) => void;
  onSetRemoteParticipantMuted: (
    participantUserId: string,
    muted: boolean,
  ) => void;
  onSetRemoteParticipantVolume: (
    participantUserId: string,
    volumePercent: number,
  ) => void;
  /** Their soundboard only, silenced locally. */
  onSetRemoteParticipantEmoteMuted: (
    participantUserId: string,
    muted: boolean,
  ) => void;
  onSetRemoteParticipantCameraHidden: (
    participantUserId: string,
    hidden: boolean,
  ) => void;
  onSetRemoteParticipantScreenAudioMuted: (
    participantUserId: string,
    muted: boolean,
  ) => void;
  onSetRemoteParticipantScreenAudioVolume: (
    participantUserId: string,
    volumePercent: number,
  ) => void;
  lobbyStateQuery: UseQueryResult<
    DesktopResult<{
      lobbyId: string;
      members: LobbyStateMember[];
      size: number;
      revision: number;
    }>,
    Error
  >;
  lobbyMessagesQuery: UseQueryResult<
    DesktopResult<{ messages: ChatMessage[] }>,
    Error
  >;
  lobbyMembers: LobbyStateMember[];
  lobbyMessages: ChatMessage[];
  lobbyMessageDraft: string;
  setLobbyMessageDraft: Dispatch<SetStateAction<string>>;
  // Optional body override, all the way down to the hook. `() => void` is
  // assignable to this, so a stale signature anywhere on this chain compiles
  // fine and drops the GIF URL at runtime -- keep it honest at every hop.
  onSendLobbyMessage: (bodyOverride?: string) => void;
  onDeleteLobbyMessage: (messageId: string) => void;
  isSendingLobbyMessage: boolean;
  deletingLobbyMessageId: string | null;
  // Screen shares are opt-in; nothing is subscribed until the viewer asks.
  isWatchingScreen: (userId: string) => boolean;
  onWatchScreen: (userId: string) => void;
  onStopWatchingScreen: (userId: string) => void;
  lobbyChatExtras: {
    replyTo: UseLobbyRoomResult["lobbyReplyTo"];
    setReplyTo: UseLobbyRoomResult["setLobbyReplyTo"];
    pendingAttachment: UseLobbyRoomResult["lobbyPendingAttachment"];
    setPendingAttachment: UseLobbyRoomResult["setLobbyPendingAttachment"];
    editMessage: UseLobbyRoomResult["editLobbyMessage"];
    toggleReaction: UseLobbyRoomResult["toggleLobbyReaction"];
    searchQuery: string;
    searchResults: UseLobbyRoomResult["lobbySearchResults"];
    isSearching: boolean;
    runSearch: UseLobbyRoomResult["runLobbySearch"];
    clearSearch: UseLobbyRoomResult["clearLobbySearch"];
  };
  isLeavingLobby: boolean;
  onToggleMic: () => void;
  onToggleHeadphone: () => void;
  onToggleScreen: () => void;
  onToggleCamera: () => void;
  onLeaveLobby: () => void;
  selectedUser: UserDirectoryEntry | null;
  // What stands in for a conversation when none is selected. currentUserId is
  // already a prop of the panel below, so it is filled in there.
  friendsHome: Omit<FriendsHomePanelProps, "currentUserId">;
  onCopyUsername: (username: string) => Promise<void>;
  directMessagesProps: {
    directMessagesQuery: UseDirectMessagesResult["directMessagesQuery"];
    directMessages: UseDirectMessagesResult["directMessages"];
    messageDraft: string;
    setMessageDraft: Dispatch<SetStateAction<string>>;
    isSendingMessage: boolean;
    // Same override as onSendLobbyMessage above, and the same reason it has to
    // be written out here rather than left as `() => void`.
    sendDirectMessage: (bodyOverride?: string) => void;
    deleteDirectMessage: (messageId: string) => void;
    deletingDirectMessageId: string | null;
    onTyping: () => void;
    isPeerTyping: boolean;
    currentUsername: string;
    isSelectedUserBlocked: boolean;
    isBlockUpdating: boolean;
    onToggleBlocked: (userId: string) => Promise<void> | void;
    onLoadOlderMessages: () => void;
    isLoadingOlderMessages: boolean;
    hasMoreMessages: boolean;
    replyTo: UseDirectMessagesResult["replyTo"];
    setReplyTo: UseDirectMessagesResult["setReplyTo"];
    pendingAttachment: UseDirectMessagesResult["pendingAttachment"];
    setPendingAttachment: UseDirectMessagesResult["setPendingAttachment"];
    editMessage: UseDirectMessagesResult["handleEditMessage"];
    toggleReaction: UseDirectMessagesResult["handleToggleReaction"];
    searchQuery: string;
    searchResults: UseDirectMessagesResult["searchResults"];
    isSearching: boolean;
    runSearch: UseDirectMessagesResult["runSearch"];
    clearSearch: UseDirectMessagesResult["clearSearch"];
  };
  onSelectAudioInputDevice: (deviceId: string | null) => void;
  onSelectAudioOutputDevice: (deviceId: string | null) => void;
  onInitiateCall?: (targetUser: UserDirectoryEntry) => void;
  callState: CallSessionState;
  ongoingCall: OngoingCallInfo | null;
  onAcceptCall: () => void;
  onRejectCall: () => void;
  onCancelCall: () => void;
  onEndActiveCall: () => void;
  onRejoinCall: () => void;
}

export function WorkspaceMainPanel({
  sectionTitle,
  currentUsername,
  currentUserId,
  micEnabled,
  headphoneEnabled,
  cameraEnabled,
  screenEnabled,
  localCameraStream,
  localScreenStream,
  remoteParticipantStreams,
  remoteParticipantAudioPreferences,
  activeSpeakerIds,
  avatarByUserId,
  workspaceSection,
  settingsSection,
  currentUserRole,
  onLogout,
  isLoggingOut,
  cameraPreferences,
  audioPreferences,
  audioInputDevices,
  audioOutputDevices,
  streamPreferences,
  onSaveCameraPreferences,
  onSaveAudioPreferences,
  onSaveStreamPreferences,
  lobbies,
  activeLobbyId,
  lobbyRoomId,
  unreadLobbyMessages,
  joiningLobbyId,
  onJoinLobby,
  onSetRemoteParticipantMuted,
  onSetRemoteParticipantVolume,
  onSetRemoteParticipantEmoteMuted,
  onSetRemoteParticipantCameraHidden,
  onSetRemoteParticipantScreenAudioMuted,
  onSetRemoteParticipantScreenAudioVolume,
  lobbyStateQuery,
  lobbyMessagesQuery,
  lobbyMembers,
  lobbyMessages,
  lobbyMessageDraft,
  setLobbyMessageDraft,
  onSendLobbyMessage,
  onDeleteLobbyMessage,
  isSendingLobbyMessage,
  deletingLobbyMessageId,
  isWatchingScreen,
  onWatchScreen,
  onStopWatchingScreen,
  lobbyChatExtras,
  isLeavingLobby,
  onToggleMic,
  onToggleHeadphone,
  onToggleScreen,
  onToggleCamera,
  onLeaveLobby,
  selectedUser,
  friendsHome,
  onCopyUsername,
  directMessagesProps,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
  onInitiateCall,
  callState,
  ongoingCall,
  onAcceptCall,
  onRejectCall,
  onCancelCall,
  onEndActiveCall,
  onRejoinCall,
}: WorkspaceMainPanelProps) {
  // The friends home fills the no-selection case now, so the users section owns
  // its whole panel: keeping the selectedUser test would have stacked the
  // "Arkadaşlar / Hoş geldin" intro on top of a screen that already has a title.
  // Settings is here for the same reason: every settings page opens with its
  // own title, icon and description, so the generic "Ayarlar / Hoş geldin"
  // above it was a second header that named the section less precisely than the
  // one underneath it — and spent 70px of a panel that scrolls.
  const hideWorkspaceIntro =
    workspaceSection === "users" ||
    workspaceSection === "settings" ||
    workspaceSection === "free-games" ||
    workspaceSection === "minigames" ||
    (workspaceSection === "lobbies" && lobbyRoomId !== null);

  return (
    <section
      className={`ct-main-panel ${hideWorkspaceIntro ? "no-header" : ""}`}
      aria-label="Ana içerik"
    >
      {!hideWorkspaceIntro && (
        <header className="ct-main-panel-header">
          <div>
            <h2>{sectionTitle}</h2>
            <p>Hoş geldin, {currentUsername}. Çalışma alanın hazır.</p>
          </div>
        </header>
      )}

      <div
        className={`ct-main-panel-content ${workspaceSection === "users" ? "chat-mode" : workspaceSection === "lobbies" ? "lobby-mode" : ""}`}
      >
        {workspaceSection === "users" && (
          <UsersDirectMessagesPanel
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            selectedUser={selectedUser}
            friendsHome={friendsHome}
            onCopyUsername={onCopyUsername}
            onSetRemoteParticipantMuted={onSetRemoteParticipantMuted}
            onSetRemoteParticipantVolume={onSetRemoteParticipantVolume}
            onSetRemoteParticipantCameraHidden={onSetRemoteParticipantCameraHidden}
            onSetRemoteParticipantScreenAudioMuted={onSetRemoteParticipantScreenAudioMuted}
            onSetRemoteParticipantScreenAudioVolume={onSetRemoteParticipantScreenAudioVolume}
            isWatchingScreen={isWatchingScreen}
            onWatchScreen={onWatchScreen}
            onStopWatchingScreen={onStopWatchingScreen}
            directMessagesQuery={directMessagesProps.directMessagesQuery}
            directMessages={directMessagesProps.directMessages}
            messageDraft={directMessagesProps.messageDraft}
            onMessageDraftChange={directMessagesProps.setMessageDraft}
            onTyping={directMessagesProps.onTyping}
            isPeerTyping={directMessagesProps.isPeerTyping}
            currentUsername={directMessagesProps.currentUsername}
            isSelectedUserBlocked={directMessagesProps.isSelectedUserBlocked}
            isBlockUpdating={directMessagesProps.isBlockUpdating}
            onToggleBlocked={directMessagesProps.onToggleBlocked}
            onLoadOlderMessages={directMessagesProps.onLoadOlderMessages}
            isLoadingOlderMessages={directMessagesProps.isLoadingOlderMessages}
            hasMoreMessages={directMessagesProps.hasMoreMessages}
            onSendMessage={directMessagesProps.sendDirectMessage}
            onDeleteMessage={directMessagesProps.deleteDirectMessage}
            deletingMessageId={directMessagesProps.deletingDirectMessageId}
            isSendingMessage={directMessagesProps.isSendingMessage}
            replyTo={directMessagesProps.replyTo}
            onSetReplyTo={directMessagesProps.setReplyTo}
            pendingAttachment={directMessagesProps.pendingAttachment}
            onSetPendingAttachment={directMessagesProps.setPendingAttachment}
            onEditMessage={directMessagesProps.editMessage}
            onToggleReaction={directMessagesProps.toggleReaction}
            searchQuery={directMessagesProps.searchQuery}
            searchResults={directMessagesProps.searchResults}
            isSearching={directMessagesProps.isSearching}
            onRunSearch={directMessagesProps.runSearch}
            onClearSearch={directMessagesProps.clearSearch}
            onInitiateCall={onInitiateCall}
            micEnabled={micEnabled}
            headphoneEnabled={headphoneEnabled}
            cameraEnabled={cameraEnabled}
            screenEnabled={screenEnabled}
            localCameraStream={localCameraStream}
            localScreenStream={localScreenStream}
            remoteParticipantStreams={remoteParticipantStreams}
            remoteParticipantAudioPreferences={remoteParticipantAudioPreferences}
            activeSpeakerIds={activeSpeakerIds}
            avatarByUserId={avatarByUserId}
            lobbyMembers={lobbyMembers}
            onToggleMic={onToggleMic}
            onToggleHeadphone={onToggleHeadphone}
            onToggleScreen={onToggleScreen}
            onToggleCamera={onToggleCamera}
            audioInputDevices={audioInputDevices}
            audioOutputDevices={audioOutputDevices}
            selectedAudioInputDeviceId={audioPreferences.selectedAudioInputDeviceId}
            selectedAudioOutputDeviceId={audioPreferences.selectedAudioOutputDeviceId}
            onSelectAudioInputDevice={onSelectAudioInputDevice}
            onSelectAudioOutputDevice={onSelectAudioOutputDevice}
            isLeavingLobby={isLeavingLobby}
            activeLobbyId={activeLobbyId}
            callState={callState}
            ongoingCall={ongoingCall}
            onAcceptCall={onAcceptCall}
            onRejectCall={onRejectCall}
            onCancelCall={onCancelCall}
            onEndActiveCall={onEndActiveCall}
            onRejoinCall={onRejoinCall}
          />
        )}

        {workspaceSection === "lobbies" && (
          <LobbiesMainPanel
            lobbiesCount={lobbies.length}
            lobbies={lobbies}
            activeLobbyId={lobbyRoomId}
            unreadLobbyMessages={unreadLobbyMessages}
            currentUserId={currentUserId}
            currentUsername={currentUsername}
            currentUserRole={currentUserRole}
            micEnabled={micEnabled}
            headphoneEnabled={headphoneEnabled}
            cameraEnabled={cameraEnabled}
            screenEnabled={screenEnabled}
            localCameraStream={localCameraStream}
            localScreenStream={localScreenStream}
            remoteParticipantStreams={remoteParticipantStreams}
            remoteParticipantAudioPreferences={
              remoteParticipantAudioPreferences
            }
            activeSpeakerIds={activeSpeakerIds}
            avatarByUserId={avatarByUserId}
            joiningLobbyId={joiningLobbyId}
            onJoinLobby={onJoinLobby}
            onSetRemoteParticipantMuted={onSetRemoteParticipantMuted}
            onSetRemoteParticipantVolume={onSetRemoteParticipantVolume}
            onSetRemoteParticipantEmoteMuted={onSetRemoteParticipantEmoteMuted}
            onSetRemoteParticipantCameraHidden={onSetRemoteParticipantCameraHidden}
            onSetRemoteParticipantScreenAudioMuted={onSetRemoteParticipantScreenAudioMuted}
            onSetRemoteParticipantScreenAudioVolume={onSetRemoteParticipantScreenAudioVolume}
            lobbyStateQuery={lobbyStateQuery}
            lobbyMessagesQuery={lobbyMessagesQuery}
            lobbyMembers={lobbyMembers}
            lobbyMessages={lobbyMessages}
            lobbyMessageDraft={lobbyMessageDraft}
            setLobbyMessageDraft={setLobbyMessageDraft}
            onSendLobbyMessage={onSendLobbyMessage}
            onDeleteLobbyMessage={onDeleteLobbyMessage}
            isSendingLobbyMessage={isSendingLobbyMessage}
            deletingLobbyMessageId={deletingLobbyMessageId}
            isWatchingScreen={isWatchingScreen}
            onWatchScreen={onWatchScreen}
            onStopWatchingScreen={onStopWatchingScreen}
            lobbyReplyTo={lobbyChatExtras.replyTo}
            onSetLobbyReplyTo={lobbyChatExtras.setReplyTo}
            lobbyPendingAttachment={lobbyChatExtras.pendingAttachment}
            onSetLobbyPendingAttachment={lobbyChatExtras.setPendingAttachment}
            onEditLobbyMessage={lobbyChatExtras.editMessage}
            onToggleLobbyReaction={lobbyChatExtras.toggleReaction}
            lobbySearchQuery={lobbyChatExtras.searchQuery}
            lobbySearchResults={lobbyChatExtras.searchResults}
            isSearchingLobbyMessages={lobbyChatExtras.isSearching}
            onRunLobbySearch={lobbyChatExtras.runSearch}
            onClearLobbySearch={lobbyChatExtras.clearSearch}
            isLeavingLobby={isLeavingLobby}
            onToggleMic={onToggleMic}
            onToggleHeadphone={onToggleHeadphone}
            onToggleScreen={onToggleScreen}
            onToggleCamera={onToggleCamera}
            onLeaveLobby={onLeaveLobby}
            audioInputDevices={audioInputDevices}
            audioOutputDevices={audioOutputDevices}
            selectedAudioInputDeviceId={audioPreferences.selectedAudioInputDeviceId}
            selectedAudioOutputDeviceId={audioPreferences.selectedAudioOutputDeviceId}
            onSelectAudioInputDevice={onSelectAudioInputDevice}
            onSelectAudioOutputDevice={onSelectAudioOutputDevice}
            // The same controller the friends home runs on — the lobby's
            // participant menu needs it to say whether "Arkadaş Ekle" is even
            // the right label for the person under the cursor.
            friends={friendsHome.friends}
          />
        )}

        {workspaceSection === "settings" && (
          <SettingsMainPanel
            settingsSection={settingsSection}
            currentUsername={currentUsername}
            onLogout={onLogout}
            isLoggingOut={isLoggingOut}
            cameraPreferences={cameraPreferences}
            audioPreferences={audioPreferences}
            audioInputDevices={audioInputDevices}
            audioOutputDevices={audioOutputDevices}
            streamPreferences={streamPreferences}
            onSaveCameraPreferences={onSaveCameraPreferences}
            onSaveAudioPreferences={onSaveAudioPreferences}
            onSaveStreamPreferences={onSaveStreamPreferences}
          />
        )}

        {/* No props: the page fetches through main and holds its own state,
            so the shell neither carries it nor re-renders for it. */}
        {workspaceSection === "free-games" && <FreeGamesMainPanel />}

        {/* Unmounted with the section, which is what stops a snake ticking and
            a minesweeper clock counting behind a lobby. No room is threaded in:
            a two-player table is its own lobby and belongs to no voice room. */}
        {workspaceSection === "minigames" && (
          <MinigamesMainPanel currentUserId={currentUserId} />
        )}
      </div>
    </section>
  );
}


