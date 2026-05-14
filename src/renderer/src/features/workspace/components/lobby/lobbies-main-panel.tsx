import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ChatMessage, LobbyDescriptor } from "@shared/auth-contracts";
import type { DesktopResult, LobbyStateMember } from "@shared/desktop-api-types";
import type { ParticipantMediaMap, RemoteParticipantAudioPreference } from "@/features/livekit";
import { getApiErrorMessage } from "../../workspace-utils";
import { LobbyChatPanel } from "./lobby-chat-panel";
import { useLobbyStageLayout } from "./lobby-stage-layout";
import { type LobbyParticipantView } from "./lobby-participant-tile";

// Modular Imports
import { useLobbyParticipants } from "./hooks/use-lobby-participants";
import { useLobbyStageSlots } from "./hooks/use-lobby-stage-slots";
import { LobbySelectionScreen } from "./parts/LobbySelectionScreen";
import { LobbyActionToolbar } from "./parts/LobbyActionToolbar";
import { LobbyStageView } from "./parts/LobbyStageView";

interface LobbiesMainPanelProps {
  lobbiesCount: number;
  lobbies: LobbyDescriptor[];
  activeLobbyId: string | null;
  activeLobbyName: string | null;
  currentUserId: string;
  currentUsername: string;
  micEnabled: boolean;
  headphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteParticipantStreams: ParticipantMediaMap;
  remoteParticipantAudioPreferences: Record<string, RemoteParticipantAudioPreference>;
  activeSpeakerIds: string[];
  avatarByUserId: Record<string, string | null | undefined>;
  joiningLobbyId: string | null;
  onJoinLobby: (lobbyId: string) => void;
  onSetRemoteParticipantMuted: (participantUserId: string, muted: boolean) => void;
  onSetRemoteParticipantVolume: (participantUserId: string, volumePercent: number) => void;
  lobbyStateQuery: UseQueryResult<DesktopResult<{ lobbyId: string; members: LobbyStateMember[]; size: number; revision: number; }>, Error>;
  lobbyMessagesQuery: UseQueryResult<DesktopResult<{ messages: ChatMessage[] }>, Error>;
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
}

const DEFAULT_REMOTE_AUDIO_PREFERENCE: RemoteParticipantAudioPreference = {
  muted: false,
  volumePercent: 100,
};

export function LobbiesMainPanel({
  lobbiesCount,
  lobbies,
  activeLobbyId,
  activeLobbyName,
  currentUserId,
  currentUsername,
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
}: LobbiesMainPanelProps) {
  const [isLobbyChatOpen, setIsLobbyChatOpen] = useState(true);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [audioPanelParticipantId, setAudioPanelParticipantId] = useState<string | null>(null);
  const [localFallbackJoinedAt, setLocalFallbackJoinedAt] = useState<string>(() => new Date().toISOString());

  // 1. Participant Logic Hook
  const { lobbyParticipants } = useLobbyParticipants({
    lobbyMembers,
    currentUserId,
    currentUsername,
    activeLobbyId,
    activeSpeakerIds,
    remoteParticipantStreams,
    micEnabled,
    headphoneEnabled,
    cameraEnabled,
    screenEnabled,
    localFallbackJoinedAt,
  });

  // 2. Stage Slots Hook
  const { stageParticipantSlots } = useLobbyStageSlots({
    lobbyParticipants,
    activeLobbyId,
  });

  const { stagePanelRef, stageLayoutStyle } = useLobbyStageLayout(
    stageParticipantSlots.length,
    isLobbyChatOpen,
  );

  // Sync Effects
  useEffect(() => {
    setIsLobbyChatOpen(true);
    setFocusedParticipantId(null);
    setAudioPanelParticipantId(null);
  }, [activeLobbyId]);

  useEffect(() => {
    if (!activeLobbyId) return;
    setLocalFallbackJoinedAt(new Date().toISOString());
  }, [activeLobbyId]);

  useEffect(() => {
    if (!focusedParticipantId && !audioPanelParticipantId) return;
    if (focusedParticipantId) {
      const focusedStillPresent = lobbyParticipants.some((p) => !p.isLocalUser && p.userId === focusedParticipantId);
      if (!focusedStillPresent) setFocusedParticipantId(null);
    }
    if (audioPanelParticipantId) {
      const audioPanelStillPresent = lobbyParticipants.some((p) => !p.isLocalUser && p.userId === audioPanelParticipantId);
      if (!audioPanelStillPresent) setAudioPanelParticipantId(null);
    }
  }, [audioPanelParticipantId, focusedParticipantId, lobbyParticipants]);

  // Derived Values
  const selectedPreference = audioPanelParticipantId
    ? (remoteParticipantAudioPreferences[audioPanelParticipantId] ?? DEFAULT_REMOTE_AUDIO_PREFERENCE)
    : DEFAULT_REMOTE_AUDIO_PREFERENCE;

  const focusedParticipantSlot = useMemo(
    () => (focusedParticipantId ? (stageParticipantSlots.find((slot) => slot.participant.userId === focusedParticipantId) ?? null) : null),
    [focusedParticipantId, stageParticipantSlots],
  );

  const nonFocusedParticipantSlots = useMemo(
    () => (focusedParticipantId ? stageParticipantSlots.filter((slot) => slot.participant.userId !== focusedParticipantId) : stageParticipantSlots),
    [focusedParticipantId, stageParticipantSlots],
  );

  // Handlers
  const handleParticipantFocus = (event: MouseEvent<HTMLElement>, participant: LobbyParticipantView): void => {
    if (participant.isLocalUser) return;
    event.stopPropagation();
    setAudioPanelParticipantId(null);
    setFocusedParticipantId((prev) => (prev === participant.userId ? null : participant.userId));
  };

  const handleParticipantContextMenu = (event: MouseEvent<HTMLElement>, participant: LobbyParticipantView): void => {
    if (participant.isLocalUser) return;
    event.preventDefault();
    event.stopPropagation();
    setAudioPanelParticipantId(participant.userId);
  };

  const handleMute = (muted: boolean): void => {
    if (!audioPanelParticipantId) return;
    onSetRemoteParticipantMuted(audioPanelParticipantId, muted);
  };

  const handleVolume = (volumePercent: number): void => {
    if (!audioPanelParticipantId) return;
    onSetRemoteParticipantVolume(audioPanelParticipantId, volumePercent);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* 1. Lobby Selection Screen */}
      <LobbySelectionScreen
        activeLobbyId={activeLobbyId}
        lobbiesCount={lobbiesCount}
        lobbies={lobbies}
        joiningLobbyId={joiningLobbyId}
        onJoinLobby={onJoinLobby}
      />

      {/* 2. Active Lobby Room */}
      <article
        className="ct-content-card ct-lobby-room-card connected"
        style={{
          position: "absolute",
          inset: 0,
          opacity: activeLobbyId ? 1 : 0,
          transform: activeLobbyId ? "translateY(0) scale(1)" : "translateY(16px) scale(1.03)",
          pointerEvents: activeLobbyId ? "auto" : "none",
          transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          visibility: activeLobbyId ? "visible" : "hidden"
        }}
      >
        <div className={`ct-lobby-room-grid ct-lobby-room-grid-v2 ${isLobbyChatOpen ? "chat-open" : "chat-closed"}`}>
          <section className="ct-lobby-stage-panel" ref={stagePanelRef}>
            <button
              type="button"
              className="ct-lobby-chat-toggle in-stage"
              onClick={() => setIsLobbyChatOpen((prev) => !prev)}
            >
              {isLobbyChatOpen ? (
                <>
                  <RightOutlined style={{ fontSize: "11px", marginRight: "4px" }} /> Sohbeti Kapat
                </>
              ) : (
                <>
                  <LeftOutlined style={{ fontSize: "11px", marginRight: "4px" }} /> Sohbeti Aç
                </>
              )}
            </button>

            {/* Stage Loading & Error States */}
            {lobbyStateQuery.isPending && <div className="ct-list-state">Üye durumları yükleniyor...</div>}
            {!lobbyStateQuery.isPending && lobbyStateQuery.isError && (
              <div className="ct-list-state error">Üye durumları alınamadı: {lobbyStateQuery.error.message}</div>
            )}
            {!lobbyStateQuery.isPending && !lobbyStateQuery.isError && !lobbyStateQuery.data?.ok && (
              <div className="ct-list-state error">Üye durumları alınamadı: {getApiErrorMessage(lobbyStateQuery.data?.error)}</div>
            )}
            {!lobbyStateQuery.isPending && !lobbyStateQuery.isError && lobbyStateQuery.data?.ok && lobbyParticipants.length === 0 && (
              <div className="ct-list-state">Bu lobide henüz üye yok.</div>
            )}

            {/* Stage Participants Grid */}
            <LobbyStageView
              stageParticipantSlots={stageParticipantSlots}
              focusedParticipantSlot={focusedParticipantSlot}
              nonFocusedParticipantSlots={nonFocusedParticipantSlots}
              avatarByUserId={avatarByUserId}
              localCameraStream={localCameraStream}
              localScreenStream={localScreenStream}
              remoteParticipantStreams={remoteParticipantStreams}
              focusedParticipantId={focusedParticipantId}
              audioPanelParticipantId={audioPanelParticipantId}
              selectedPreference={selectedPreference}
              stageLayoutStyle={stageLayoutStyle}
              handleMute={handleMute}
              handleVolume={handleVolume}
              handleParticipantFocus={handleParticipantFocus}
              handleParticipantContextMenu={handleParticipantContextMenu}
            />

            {/* Bottom Actions Toolbar */}
            <LobbyActionToolbar
              micEnabled={micEnabled}
              headphoneEnabled={headphoneEnabled}
              screenEnabled={screenEnabled}
              cameraEnabled={cameraEnabled}
              isLeavingLobby={isLeavingLobby}
              onToggleMic={onToggleMic}
              onToggleHeadphone={onToggleHeadphone}
              onToggleScreen={onToggleScreen}
              onToggleCamera={onToggleCamera}
              onLeaveLobby={onLeaveLobby}
            />
          </section>

          <aside className={`ct-lobby-chat-slot ${isLobbyChatOpen ? "open" : ""}`}>
            <LobbyChatPanel
              currentUserId={currentUserId}
              lobbyMessagesQuery={lobbyMessagesQuery}
              lobbyMessages={lobbyMessages}
              lobbyMessageDraft={lobbyMessageDraft}
              setLobbyMessageDraft={setLobbyMessageDraft}
              onSendLobbyMessage={onSendLobbyMessage}
              onDeleteLobbyMessage={onDeleteLobbyMessage}
              isSendingLobbyMessage={isSendingLobbyMessage}
              deletingLobbyMessageId={deletingLobbyMessageId}
            />
          </aside>
        </div>
      </article>
    </div>
  );
}
