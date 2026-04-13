import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  RotateCcw,
  PlugZap,
  Volume2,
  VolumeX,
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
import type {
  ParticipantMediaMap,
  RemoteParticipantAudioPreference,
} from "../../../services/livekit-stream-manager";
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
  remoteParticipantAudioPreferences: Record<
    string,
    RemoteParticipantAudioPreference
  >;
  avatarByUserId: Record<string, string | null | undefined>;
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
}

const DEFAULT_REMOTE_AUDIO_PREFERENCE: RemoteParticipantAudioPreference = {
  muted: false,
  volumePercent: 100,
};

const clampRemoteVolumePercent = (volumePercent: number): number => {
  if (!Number.isFinite(volumePercent)) {
    return DEFAULT_REMOTE_AUDIO_PREFERENCE.volumePercent;
  }

  return Math.min(200, Math.max(0, Math.round(volumePercent)));
};

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
  remoteParticipantAudioPreferences,
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
  const [participantContextMenu, setParticipantContextMenu] = useState<{
    participant: LobbyParticipantView;
    x: number;
    y: number;
  } | null>(null);
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
    setParticipantContextMenu(null);
  }, [activeLobbyId]);

  useEffect(() => {
    if (!activeLobbyId) {
      return;
    }

    setLocalFallbackJoinedAt(new Date().toISOString());
  }, [activeLobbyId]);

  useEffect(() => {
    if (!participantContextMenu) {
      return;
    }

    const stillPresent = lobbyParticipants.some(
      (participant) =>
        !participant.isLocalUser &&
        participant.userId === participantContextMenu.participant.userId,
    );

    if (!stillPresent) {
      setParticipantContextMenu(null);
    }
  }, [lobbyParticipants, participantContextMenu]);

  useEffect(() => {
    if (!participantContextMenu) {
      return;
    }

    const closeMenu = (): void => {
      setParticipantContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [participantContextMenu]);

  const participantContextMenuStyle = useMemo(() => {
    if (!participantContextMenu || typeof window === "undefined") {
      return undefined;
    }

    const menuWidth = 300;
    const menuHeight = 300;
    const padding = 8;

    const clampedX = Math.min(
      Math.max(participantContextMenu.x, padding),
      window.innerWidth - menuWidth - padding,
    );

    const clampedY = Math.min(
      Math.max(participantContextMenu.y, padding),
      window.innerHeight - menuHeight - padding,
    );

    return {
      left: clampedX,
      top: clampedY,
    };
  }, [participantContextMenu]);

  const selectedRemoteParticipant = participantContextMenu?.participant ?? null;
  const selectedRemoteAudioPreference = selectedRemoteParticipant
    ? (remoteParticipantAudioPreferences[selectedRemoteParticipant.userId] ??
      DEFAULT_REMOTE_AUDIO_PREFERENCE)
    : DEFAULT_REMOTE_AUDIO_PREFERENCE;
  const selectedRemoteVolumePercent = clampRemoteVolumePercent(
    selectedRemoteAudioPreference.volumePercent,
  );

  const handleParticipantContextMenu = (
    event: MouseEvent<HTMLElement>,
    participant: LobbyParticipantView,
  ): void => {
    if (participant.isLocalUser) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setParticipantContextMenu({
      participant,
      x: event.clientX,
      y: event.clientY,
    });
  };

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
                onContextMenu={(event) =>
                  handleParticipantContextMenu(event, participant)
                }
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

          {participantContextMenu && selectedRemoteParticipant && (
            <div
              className="ct-lobby-context-menu ct-participant-context-menu"
              style={participantContextMenuStyle}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <p className="ct-participant-context-menu-title">
                {selectedRemoteParticipant.username}
              </p>

              <div className="ct-participant-context-menu-state-row">
                <span
                  className={`ct-participant-context-menu-state ${selectedRemoteAudioPreference.muted ? "muted" : "active"}`}
                >
                  {selectedRemoteAudioPreference.muted
                    ? "Susturuldu"
                    : "Duyuluyor"}
                </span>
                <span className="ct-participant-context-menu-hint">
                  Cikmak icin ESC
                </span>
              </div>

              <div className="ct-participant-context-menu-actions">
                <button
                  type="button"
                  className={`ct-participant-context-menu-button ${selectedRemoteAudioPreference.muted ? "active" : ""}`}
                  onClick={() => {
                    onSetRemoteParticipantMuted(
                      selectedRemoteParticipant.userId,
                      !selectedRemoteAudioPreference.muted,
                    );
                  }}
                >
                  {selectedRemoteAudioPreference.muted ? (
                    <>
                      <Volume2 size={14} aria-hidden="true" /> Sesi Ac
                    </>
                  ) : (
                    <>
                      <VolumeX size={14} aria-hidden="true" /> Sustur
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="ct-participant-context-menu-button"
                  onClick={() => {
                    onSetRemoteParticipantMuted(
                      selectedRemoteParticipant.userId,
                      false,
                    );
                    onSetRemoteParticipantVolume(
                      selectedRemoteParticipant.userId,
                      100,
                    );
                  }}
                >
                  <RotateCcw size={14} aria-hidden="true" /> Sifirla
                </button>
              </div>

              <label className="ct-participant-context-menu-volume">
                <div className="ct-participant-context-menu-volume-line">
                  <span>Ses Seviyesi</span>
                  <strong>%{selectedRemoteVolumePercent}</strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={selectedRemoteVolumePercent}
                  onChange={(event) => {
                    onSetRemoteParticipantVolume(
                      selectedRemoteParticipant.userId,
                      clampRemoteVolumePercent(Number(event.target.value)),
                    );
                  }}
                />

                <div className="ct-participant-context-menu-stepper">
                  <button
                    type="button"
                    onClick={() => {
                      onSetRemoteParticipantVolume(
                        selectedRemoteParticipant.userId,
                        selectedRemoteVolumePercent - 10,
                      );
                    }}
                  >
                    -10
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSetRemoteParticipantVolume(
                        selectedRemoteParticipant.userId,
                        selectedRemoteVolumePercent + 10,
                      );
                    }}
                  >
                    +10
                  </button>
                </div>

                <div className="ct-participant-context-menu-scale">
                  <span>0</span>
                  <span>100</span>
                  <span>200</span>
                </div>
              </label>

              <div className="ct-participant-context-menu-presets">
                {[0, 80, 100, 150, 200].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={
                      selectedRemoteVolumePercent === preset ? "active" : ""
                    }
                    onClick={() => {
                      onSetRemoteParticipantVolume(
                        selectedRemoteParticipant.userId,
                        preset,
                      );
                    }}
                  >
                    %{preset}
                  </button>
                ))}
              </div>
            </div>
          )}
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
