import type {
  ChatMessage,
  LobbyDescriptor,
  UserRole,
  UserDirectoryEntry,
} from "../../../../../shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "../../../../../shared/desktop-api-types";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  SettingsSection,
  WorkspaceSection,
} from "../../../store/ui-store";
import type { UseDirectMessagesResult } from "../hooks/use-direct-messages";
import { LobbiesMainPanel } from "./lobbies-main-panel";
import {
  SettingsMainPanel,
  type AudioPreferences,
  type CameraPreferences,
  type StreamPreferences,
} from "./settings-main-panel";
import { UsersDirectMessagesPanel } from "./users-direct-messages-panel";
import type { ParticipantMediaMap } from "../../../services/livekit-media-session";
import type { RemoteParticipantAudioPreference } from "../../../services/livekit-stream-manager";

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
  avatarByUserId: Record<string, string | null | undefined>;
  workspaceSection: WorkspaceSection;
  settingsSection: SettingsSection;
  currentUserRole: UserRole;
  currentUserCreatedAt: string;
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
  activeLobbyName: string | null;
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
  setLobbyMessageDraft: (value: string) => void;
  onSendLobbyMessage: () => void;
  onDeleteLobbyMessage: (messageId: string) => void;
  isSendingLobbyMessage: boolean;
  deletingLobbyMessageId: string | null;
  isLeavingLobby: boolean;
  onToggleMic: () => void;
  onToggleHeadphone: () => void;
  onToggleScreen: () => void;
  onToggleCamera: () => void;
  onLeaveLobby: () => void;
  selectedUser: UserDirectoryEntry | null;
  onCopyUsername: (username: string) => Promise<void>;
  directMessagesProps: {
    directMessagesQuery: UseDirectMessagesResult["directMessagesQuery"];
    directMessages: UseDirectMessagesResult["directMessages"];
    messageDraft: string;
    setMessageDraft: (value: string) => void;
    isSendingMessage: boolean;
    sendDirectMessage: () => void;
    deleteDirectMessage: (messageId: string) => void;
    deletingDirectMessageId: string | null;
  };
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
  avatarByUserId,
  workspaceSection,
  settingsSection,
  currentUserRole,
  currentUserCreatedAt,
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
  activeLobbyName,
  joiningLobbyId,
  onJoinLobby,
  onSetRemoteParticipantMuted,
  onSetRemoteParticipantVolume,
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
  isLeavingLobby,
  onToggleMic,
  onToggleHeadphone,
  onToggleScreen,
  onToggleCamera,
  onLeaveLobby,
  selectedUser,
  onCopyUsername,
  directMessagesProps,
}: WorkspaceMainPanelProps) {
  const hideWorkspaceIntro =
    (workspaceSection === "users" && selectedUser !== null) ||
    (workspaceSection === "lobbies" && activeLobbyId !== null);

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
            selectedUser={selectedUser}
            onCopyUsername={onCopyUsername}
            directMessagesQuery={directMessagesProps.directMessagesQuery}
            directMessages={directMessagesProps.directMessages}
            messageDraft={directMessagesProps.messageDraft}
            onMessageDraftChange={directMessagesProps.setMessageDraft}
            onSendMessage={directMessagesProps.sendDirectMessage}
            onDeleteMessage={directMessagesProps.deleteDirectMessage}
            deletingMessageId={directMessagesProps.deletingDirectMessageId}
            isSendingMessage={directMessagesProps.isSendingMessage}
          />
        )}

        {workspaceSection === "lobbies" && (
          <LobbiesMainPanel
            lobbiesCount={lobbies.length}
            lobbies={lobbies}
            activeLobbyId={activeLobbyId}
            activeLobbyName={activeLobbyName}
            currentUserId={currentUserId}
            currentUsername={currentUsername}
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
            avatarByUserId={avatarByUserId}
            joiningLobbyId={joiningLobbyId}
            onJoinLobby={onJoinLobby}
            onSetRemoteParticipantMuted={onSetRemoteParticipantMuted}
            onSetRemoteParticipantVolume={onSetRemoteParticipantVolume}
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
            isLeavingLobby={isLeavingLobby}
            onToggleMic={onToggleMic}
            onToggleHeadphone={onToggleHeadphone}
            onToggleScreen={onToggleScreen}
            onToggleCamera={onToggleCamera}
            onLeaveLobby={onLeaveLobby}
          />
        )}

        {workspaceSection === "settings" && (
          <SettingsMainPanel
            settingsSection={settingsSection}
            currentUsername={currentUsername}
            currentUserRole={currentUserRole}
            currentUserCreatedAt={currentUserCreatedAt}
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
      </div>
    </section>
  );
}
