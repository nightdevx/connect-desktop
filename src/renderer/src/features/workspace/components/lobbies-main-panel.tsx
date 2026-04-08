import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  PlugZap,
} from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  ChatMessage,
  LobbyDescriptor,
} from "../../../../../shared/auth-contracts";
import type {
  DesktopResult,
  LobbyStateMember,
} from "../../../../../shared/desktop-api-types";
import type { ParticipantMediaMap } from "../../../services/livekit-media-session";
import { getApiErrorMessage } from "../workspace-utils";
import { LobbyChatPanel } from "./lobby-chat-panel";
import {
  LobbyParticipantTile,
  type LobbyParticipantView,
} from "./lobby-participant-tile";
import { useLobbyStageLayout } from "./lobby-stage-layout";

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
  avatarByUserId: Record<string, string | null | undefined>;
  joiningLobbyId: string | null;
  onJoinLobby: (lobbyId: string) => void;
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
}

function resolvePreviewStream(
  participant: LobbyParticipantView,
  localCameraStream: MediaStream | null,
  localScreenStream: MediaStream | null,
  remoteParticipantStreams: ParticipantMediaMap,
): MediaStream | null {
  const remoteStreams = remoteParticipantStreams[participant.userId];

  if (participant.isLocalUser && participant.screenSharing) {
    return localScreenStream;
  }

  if (participant.isLocalUser && participant.cameraEnabled) {
    return localCameraStream;
  }

  if (participant.screenSharing) {
    return remoteStreams?.screen ?? null;
  }

  if (participant.cameraEnabled) {
    return remoteStreams?.camera ?? null;
  }

  return null;
}

function resolveParticipantRenderKey(
  participant: LobbyParticipantView,
  activeLobbyId: string | null,
): string {
  return `${activeLobbyId ?? "no-lobby"}:${participant.userId}:${participant.joinedAt}`;
}

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
  avatarByUserId,
  joiningLobbyId,
  onJoinLobby,
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
  const [localFallbackJoinedAt, setLocalFallbackJoinedAt] = useState<string>(
    () => new Date().toISOString(),
  );

  const lobbyParticipants = useMemo<LobbyParticipantView[]>(() => {
    const merged = lobbyMembers.map((member) => {
      if (member.userId !== currentUserId) {
        return {
          ...member,
          isLocalUser: false,
        };
      }

      return {
        ...member,
        muted: !micEnabled,
        deafened: !headphoneEnabled,
        cameraEnabled,
        screenSharing: screenEnabled,
        isLocalUser: true,
      };
    });

    if (
      !merged.some((member) => member.userId === currentUserId) &&
      activeLobbyId
    ) {
      merged.unshift({
        userId: currentUserId,
        username: currentUsername,
        joinedAt: localFallbackJoinedAt,
        muted: !micEnabled,
        deafened: !headphoneEnabled,
        speaking: false,
        cameraEnabled,
        screenSharing: screenEnabled,
        isLocalUser: true,
      });
    }

    return merged.sort((left, right) => {
      if (left.isLocalUser !== right.isLocalUser) {
        return left.isLocalUser ? -1 : 1;
      }

      if (left.speaking !== right.speaking) {
        return left.speaking ? -1 : 1;
      }

      return left.username.localeCompare(right.username, "tr");
    });
  }, [
    activeLobbyId,
    cameraEnabled,
    currentUserId,
    currentUsername,
    headphoneEnabled,
    localFallbackJoinedAt,
    lobbyMembers,
    micEnabled,
    screenEnabled,
  ]);

  const { stagePanelRef, stageLayoutStyle } = useLobbyStageLayout(
    lobbyParticipants.length,
    isLobbyChatOpen,
  );

  useEffect(() => {
    setIsLobbyChatOpen(true);
  }, [activeLobbyId]);

  useEffect(() => {
    if (!activeLobbyId) {
      return;
    }

    setLocalFallbackJoinedAt(new Date().toISOString());
  }, [activeLobbyId]);

  if (!activeLobbyId) {
    return (
      <article className="ct-content-card">
        <h3>Lobi Yönetimi</h3>
        <p>Aktif lobi sayısı: {lobbiesCount}</p>
        <p>
          Bir lobiye katılarak üyeleri ve lobi sohbetini görüntüleyebilirsin.
        </p>

        <ul className="ct-list mt-3">
          {lobbies.map((lobby) => (
            <li key={lobby.id} className="ct-list-item">
              <div>
                <p>{lobby.name}</p>
                <span>{lobby.memberCount} uye</span>
              </div>
              <button
                type="button"
                className="ct-list-action"
                onClick={() => onJoinLobby(lobby.id)}
                disabled={joiningLobbyId !== null}
              >
                {joiningLobbyId === lobby.id ? "Bağlanıyor..." : "Katıl"}
              </button>
            </li>
          ))}
        </ul>
      </article>
    );
  }

  return (
    <article className="ct-content-card ct-lobby-room-card connected">
      <div
        className={`ct-lobby-room-grid ct-lobby-room-grid-v2 ${isLobbyChatOpen ? "chat-open" : "chat-closed"}`}
      >
        <section className="ct-lobby-stage-panel" ref={stagePanelRef}>
          <button
            type="button"
            className="ct-lobby-chat-toggle in-stage"
            onClick={() => setIsLobbyChatOpen((previous) => !previous)}
            aria-label={`${activeLobbyName ?? "Lobi"} sohbetini ${isLobbyChatOpen ? "kapat" : "aç"}`}
            title={isLobbyChatOpen ? "Sohbeti Kapat" : "Sohbeti Aç"}
          >
            {isLobbyChatOpen ? (
              <>
                <ChevronRight size={14} aria-hidden="true" /> Sohbeti Kapat
              </>
            ) : (
              <>
                <ChevronLeft size={14} aria-hidden="true" /> Sohbeti Aç
              </>
            )}
          </button>

          {lobbyStateQuery.isPending && (
            <div className="ct-list-state">Üye durumları yükleniyor...</div>
          )}

          {!lobbyStateQuery.isPending && lobbyStateQuery.isError && (
            <div className="ct-list-state error">
              Üye durumları alınamadı: {lobbyStateQuery.error.message}
            </div>
          )}

          {!lobbyStateQuery.isPending &&
            !lobbyStateQuery.isError &&
            !lobbyStateQuery.data?.ok && (
              <div className="ct-list-state error">
                Üye durumları alınamadı:{" "}
                {getApiErrorMessage(lobbyStateQuery.data?.error)}
              </div>
            )}

          {!lobbyStateQuery.isPending &&
            !lobbyStateQuery.isError &&
            lobbyStateQuery.data?.ok &&
            lobbyParticipants.length === 0 && (
              <div className="ct-list-state">Bu lobide henüz üye yok.</div>
            )}

          <div className="ct-lobby-stage-grid" style={stageLayoutStyle}>
            {lobbyParticipants.map((participant) => (
              <LobbyParticipantTile
                key={resolveParticipantRenderKey(participant, activeLobbyId)}
                participant={participant}
                avatarUrl={avatarByUserId[participant.userId]}
                previewStream={resolvePreviewStream(
                  participant,
                  localCameraStream,
                  localScreenStream,
                  remoteParticipantStreams,
                )}
              />
            ))}
          </div>

          <div className="ct-lobby-stage-actions" aria-label="Lobi işlevleri">
            <button
              type="button"
              className={`ct-lobby-stage-icon-action ${micEnabled ? "active" : ""}`}
              onClick={onToggleMic}
              title={`Mikrofon ${micEnabled ? "açık" : "kapalı"}`}
              aria-label="Mikrofon"
            >
              {micEnabled ? (
                <Mic size={15} aria-hidden="true" />
              ) : (
                <MicOff size={15} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              className={`ct-lobby-stage-icon-action ${headphoneEnabled ? "active" : ""}`}
              onClick={onToggleHeadphone}
              title={`Kulaklık ${headphoneEnabled ? "açık" : "kapalı"}`}
              aria-label="Kulaklık"
            >
              <Headphones size={15} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={`ct-lobby-stage-icon-action ${screenEnabled ? "active" : ""}`}
              onClick={onToggleScreen}
              title={`Yayın ${screenEnabled ? "açık" : "kapalı"}`}
              aria-label="Yayın"
            >
              <MonitorUp size={15} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={`ct-lobby-stage-icon-action ${cameraEnabled ? "active" : ""}`}
              onClick={onToggleCamera}
              title={`Kamera ${cameraEnabled ? "açık" : "kapalı"}`}
              aria-label="Kamera"
            >
              <Camera size={15} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="ct-lobby-stage-icon-action danger"
              onClick={onLeaveLobby}
              disabled={isLeavingLobby}
              title={isLeavingLobby ? "Lobiden ayrılıyor" : "Lobiden ayrıl"}
              aria-label="Lobiden ayrıl"
            >
              <PlugZap size={15} aria-hidden="true" />
            </button>
          </div>
        </section>

        <aside
          className={`ct-lobby-chat-slot ${isLobbyChatOpen ? "open" : ""}`}
          aria-hidden={!isLobbyChatOpen}
        >
          <button
            type="button"
            className="ct-lobby-chat-backdrop"
            onClick={() => setIsLobbyChatOpen(false)}
            aria-label="Sohbet panelini kapat"
          />

          <div className="ct-lobby-chat-drawer">
            <header className="ct-lobby-chat-drawer-header">
              <p>
                <MessageSquare size={14} aria-hidden="true" /> Lobi Sohbeti
              </p>
              <button
                type="button"
                className="ct-lobby-chat-toggle"
                onClick={() => setIsLobbyChatOpen((previous) => !previous)}
                aria-label={isLobbyChatOpen ? "Sohbeti kapat" : "Sohbeti aç"}
                title={isLobbyChatOpen ? "Sohbeti Kapat" : "Sohbeti Aç"}
              >
                {isLobbyChatOpen ? (
                  <>
                    <ChevronRight size={14} aria-hidden="true" /> Kapat
                  </>
                ) : (
                  <>
                    <ChevronLeft size={14} aria-hidden="true" /> Aç
                  </>
                )}
              </button>
            </header>

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
          </div>
        </aside>
      </div>
    </article>
  );
}
