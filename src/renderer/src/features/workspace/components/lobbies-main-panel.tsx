import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Button, Tooltip } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  CustomerServiceOutlined,
  DesktopOutlined,
  VideoCameraOutlined,
  LogoutOutlined,
  LeftOutlined,
  RightOutlined,
  MessageOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
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
  activeSpeakerIds: string[];
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

type ParticipantSourcePreference = "auto" | "screen" | "camera";

interface StageParticipantSlot {
  slotId: string;
  participant: LobbyParticipantView;
  sourcePreference: ParticipantSourcePreference;
}

function resolveMappedTracks(
  participant: LobbyParticipantView,
  remoteParticipantStreams: ParticipantMediaMap,
) {
  let mappedTracks = remoteParticipantStreams[participant.userId];

  if (!mappedTracks) {
    mappedTracks = remoteParticipantStreams[participant.username];
  }

  if (!mappedTracks) {
    const entry = Object.entries(remoteParticipantStreams).find(
      ([id]) =>
        id.includes(participant.userId) || participant.userId.includes(id),
    );
    if (entry) {
      mappedTracks = entry[1];
    }
  }

  return mappedTracks;
}

function resolveSourceStream(
  participant: LobbyParticipantView,
  localCameraStream: MediaStream | null,
  localScreenStream: MediaStream | null,
  remoteParticipantStreams: ParticipantMediaMap,
  source: "screen" | "camera",
): MediaStream | any | null {
  const mappedTracks = resolveMappedTracks(
    participant,
    remoteParticipantStreams,
  );

  if (source === "screen") {
    if (participant.screenSharing) {
      if (mappedTracks?.screen) return mappedTracks.screen;
      if (participant.isLocalUser) return localScreenStream;
    }
    return null;
  }

  if (participant.cameraEnabled) {
    if (mappedTracks?.camera) return mappedTracks.camera;
    if (participant.isLocalUser) return localCameraStream;
  }

  return null;
}

function resolvePreviewStream(
  participant: LobbyParticipantView,
  localCameraStream: MediaStream | null,
  localScreenStream: MediaStream | null,
  remoteParticipantStreams: ParticipantMediaMap,
  sourcePreference: ParticipantSourcePreference = "auto",
): MediaStream | any | null {
  if (sourcePreference === "screen") {
    return resolveSourceStream(
      participant,
      localCameraStream,
      localScreenStream,
      remoteParticipantStreams,
      "screen",
    );
  }

  if (sourcePreference === "camera") {
    return resolveSourceStream(
      participant,
      localCameraStream,
      localScreenStream,
      remoteParticipantStreams,
      "camera",
    );
  }

  return (
    resolveSourceStream(
      participant,
      localCameraStream,
      localScreenStream,
      remoteParticipantStreams,
      "screen",
    ) ??
    resolveSourceStream(
      participant,
      localCameraStream,
      localScreenStream,
      remoteParticipantStreams,
      "camera",
    )
  );
}

function resolveParticipantRenderKey(
  participant: LobbyParticipantView,
  activeLobbyId: string | null,
  sourcePreference: ParticipantSourcePreference,
): string {
  return `${activeLobbyId ?? "no-lobby"}:${participant.userId}:${participant.joinedAt}:${sourcePreference}`;
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
  const [focusedParticipantId, setFocusedParticipantId] = useState<
    string | null
  >(null);
  const [audioPanelParticipantId, setAudioPanelParticipantId] = useState<
    string | null
  >(null);
  const [localFallbackJoinedAt, setLocalFallbackJoinedAt] = useState<string>(
    () => new Date().toISOString(),
  );

  const activeSpeakerLookup = useMemo(() => {
    const list = activeSpeakerIds
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    return {
      list,
      set: new Set(list),
    };
  }, [activeSpeakerIds]);

  const lobbyParticipants = useMemo<LobbyParticipantView[]>(() => {
    const merged = lobbyMembers.map((member) => {
      const isActiveSpeaker =
        activeSpeakerLookup.set.has(member.userId) ||
        activeSpeakerLookup.set.has(member.username) ||
        activeSpeakerLookup.list.some(
          (id) =>
            id.includes(member.userId) ||
            member.userId.includes(id) ||
            id.includes(member.username) ||
            member.username.includes(id),
        );
      const speaking = isActiveSpeaker || (member.speaking && !member.muted);

      if (member.userId !== currentUserId) {
        return {
          ...member,
          speaking,
          isLocalUser: false,
        };
      }

      const localMuted = !micEnabled;
      const localSpeaking = isActiveSpeaker && !localMuted;

      return {
        ...member,
        muted: localMuted,
        deafened: !headphoneEnabled,
        speaking: localSpeaking,
        cameraEnabled,
        screenSharing: screenEnabled,
        isLocalUser: true,
      };
    });

    if (
      !merged.some((member) => member.userId === currentUserId) &&
      activeLobbyId
    ) {
      const localMuted = !micEnabled;
      const localActiveSpeaker =
        activeSpeakerLookup.set.has(currentUserId) ||
        activeSpeakerLookup.set.has(currentUsername) ||
        activeSpeakerLookup.list.some(
          (id) =>
            id.includes(currentUserId) ||
            currentUserId.includes(id) ||
            id.includes(currentUsername) ||
            currentUsername.includes(id),
        );
      merged.unshift({
        userId: currentUserId,
        username: currentUsername,
        joinedAt: localFallbackJoinedAt,
        muted: localMuted,
        deafened: !headphoneEnabled,
        speaking: localActiveSpeaker && !localMuted,
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
    activeSpeakerLookup,
    cameraEnabled,
    currentUserId,
    currentUsername,
    headphoneEnabled,
    localFallbackJoinedAt,
    lobbyMembers,
    localCameraStream,
    localScreenStream,
    micEnabled,
    screenEnabled,
  ]);

  const stageParticipantSlots = useMemo<StageParticipantSlot[]>(() => {
    return lobbyParticipants.flatMap((participant): StageParticipantSlot[] => {
      if (participant.cameraEnabled && participant.screenSharing) {
        return [
          {
            slotId: resolveParticipantRenderKey(
              participant,
              activeLobbyId,
              "screen",
            ),
            participant,
            sourcePreference: "screen",
          },
          {
            slotId: resolveParticipantRenderKey(
              participant,
              activeLobbyId,
              "camera",
            ),
            participant,
            sourcePreference: "camera",
          },
        ];
      }

      if (participant.screenSharing) {
        return [
          {
            slotId: resolveParticipantRenderKey(
              participant,
              activeLobbyId,
              "screen",
            ),
            participant,
            sourcePreference: "screen",
          },
        ];
      }

      if (participant.cameraEnabled) {
        return [
          {
            slotId: resolveParticipantRenderKey(
              participant,
              activeLobbyId,
              "camera",
            ),
            participant,
            sourcePreference: "camera",
          },
        ];
      }

      return [
        {
          slotId: resolveParticipantRenderKey(
            participant,
            activeLobbyId,
            "auto",
          ),
          participant,
          sourcePreference: "auto",
        },
      ];
    });
  }, [activeLobbyId, lobbyParticipants]);

  const { stagePanelRef, stageLayoutStyle } = useLobbyStageLayout(
    stageParticipantSlots.length,
    isLobbyChatOpen,
  );

  useEffect(() => {
    setIsLobbyChatOpen(true);
    setFocusedParticipantId(null);
    setAudioPanelParticipantId(null);
  }, [activeLobbyId]);

  useEffect(() => {
    if (!activeLobbyId) {
      return;
    }
    setLocalFallbackJoinedAt(new Date().toISOString());
  }, [activeLobbyId]);

  useEffect(() => {
    if (!focusedParticipantId && !audioPanelParticipantId) {
      return;
    }
    if (focusedParticipantId) {
      const focusedStillPresent = lobbyParticipants.some(
        (p) => !p.isLocalUser && p.userId === focusedParticipantId,
      );
      if (!focusedStillPresent) {
        setFocusedParticipantId(null);
      }
    }
    if (audioPanelParticipantId) {
      const audioPanelStillPresent = lobbyParticipants.some(
        (p) => !p.isLocalUser && p.userId === audioPanelParticipantId,
      );
      if (!audioPanelStillPresent) {
        setAudioPanelParticipantId(null);
      }
    }
  }, [audioPanelParticipantId, focusedParticipantId, lobbyParticipants]);

  const selectedPreference = audioPanelParticipantId
    ? (remoteParticipantAudioPreferences[audioPanelParticipantId] ??
      DEFAULT_REMOTE_AUDIO_PREFERENCE)
    : DEFAULT_REMOTE_AUDIO_PREFERENCE;

  const focusedParticipantSlot = useMemo(
    () =>
      focusedParticipantId
        ? (stageParticipantSlots.find(
            (slot) => slot.participant.userId === focusedParticipantId,
          ) ?? null)
        : null,
    [focusedParticipantId, stageParticipantSlots],
  );

  const nonFocusedParticipantSlots = useMemo(
    () =>
      focusedParticipantId
        ? stageParticipantSlots.filter(
            (slot) => slot.participant.userId !== focusedParticipantId,
          )
        : stageParticipantSlots,
    [focusedParticipantId, stageParticipantSlots],
  );

  const handleParticipantFocus = (
    event: MouseEvent<HTMLElement>,
    participant: LobbyParticipantView,
  ): void => {
    if (participant.isLocalUser) {
      return;
    }
    event.stopPropagation();
    setAudioPanelParticipantId(null);
    setFocusedParticipantId((prev) =>
      prev === participant.userId ? null : participant.userId,
    );
  };

  const handleParticipantContextMenu = (
    event: MouseEvent<HTMLElement>,
    participant: LobbyParticipantView,
  ): void => {
    if (participant.isLocalUser) {
      return;
    }
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
      {/* 1. Lobi Odası Seç (Lobby Selection Screen) */}
      <article
        className="ct-content-card flex flex-col justify-between"
        style={{
          padding: "24px",
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          opacity: !activeLobbyId ? 1 : 0,
          transform: !activeLobbyId ? "translateY(0) scale(1)" : "translateY(-16px) scale(0.97)",
          pointerEvents: !activeLobbyId ? "auto" : "none",
          transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          visibility: !activeLobbyId ? "visible" : "hidden"
        }}
      >
        <div className="flex flex-col items-center justify-center text-center py-16" style={{ flex: 1 }}>
          <ExclamationCircleOutlined style={{ fontSize: "32px", color: "rgba(255,255,255,0.15)", marginBottom: "16px" }} />
          <h3 className="text-base font-semibold text-white mb-2">Lobi Odası Seç</h3>
          <p className="text-xs text-[#8f8f8f] max-w-[340px] mb-8">
            Katılmak istediğin lobi odasını seçerek diğer kullanıcılarla sesli, görüntülü veya yazılı iletişime geçebilirsin.
          </p>
        </div>

        <div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Aktif Odalar ({lobbiesCount})
          </p>
          <ul className="ct-list flex flex-col gap-2">
            {lobbies.map((lobby) => (
              <li
                key={lobby.id}
                className="ct-list-item clickable flex items-center justify-between"
                style={{ padding: "12px 16px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.02)" }}
              >
                <div>
                  <p className="text-sm font-semibold text-white"># {lobby.name}</p>
                  <span className="text-xs text-zinc-500">{lobby.memberCount} üye aktif</span>
                </div>
                <Button
                  type="default"
                  onClick={() => onJoinLobby(lobby.id)}
                  disabled={joiningLobbyId !== null}
                  style={{
                    background: "#ffffff",
                    color: "#000000",
                    fontWeight: "600",
                    fontSize: "12px",
                    border: "none",
                    borderRadius: "6px",
                  }}
                >
                  {joiningLobbyId === lobby.id ? <LoadingOutlined /> : "Katıl"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </article>

      {/* 2. Aktif Lobi Odası (Active Lobby Room Stage View) */}
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
                  <RightOutlined style={{ fontSize: "11px", marginRight: "4px" }} /> Sohbeti Kapat
                </>
              ) : (
                <>
                  <LeftOutlined style={{ fontSize: "11px", marginRight: "4px" }} /> Sohbeti Aç
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

            <div
              className={`ct-lobby-stage-grid ${focusedParticipantSlot ? "focused-layout" : ""}`}
              style={stageLayoutStyle}
            >
              {focusedParticipantSlot ? (
                <>
                  <div className="ct-lobby-focused-slot">
                    <LobbyParticipantTile
                      key={focusedParticipantSlot.slotId}
                      participant={focusedParticipantSlot.participant}
                      avatarUrl={
                        avatarByUserId[focusedParticipantSlot.participant.userId]
                      }
                      previewStream={resolvePreviewStream(
                        focusedParticipantSlot.participant,
                        localCameraStream,
                        localScreenStream,
                        remoteParticipantStreams,
                        focusedParticipantSlot.sourcePreference,
                      )}
                      isSelected={
                        focusedParticipantId ===
                          focusedParticipantSlot.participant.userId ||
                        audioPanelParticipantId ===
                          focusedParticipantSlot.participant.userId
                      }
                      isFocusedLayout
                      showAudioControls={
                        !focusedParticipantSlot.participant.isLocalUser &&
                        audioPanelParticipantId ===
                          focusedParticipantSlot.participant.userId
                      }
                      audioPreference={selectedPreference}
                      onToggleMute={() => handleMute(!selectedPreference.muted)}
                      onVolumeChange={handleVolume}
                      onActivate={(event) =>
                        handleParticipantFocus(
                          event,
                          focusedParticipantSlot.participant,
                        )
                      }
                      onContextMenu={(event) =>
                        handleParticipantContextMenu(
                          event,
                          focusedParticipantSlot.participant,
                        )
                      }
                    />
                  </div>

                  {nonFocusedParticipantSlots.length > 0 && (
                    <div className="ct-lobby-participant-rail" role="list">
                      {nonFocusedParticipantSlots.map((slot) => (
                        <LobbyParticipantTile
                          key={slot.slotId}
                          participant={slot.participant}
                          avatarUrl={avatarByUserId[slot.participant.userId]}
                          previewStream={resolvePreviewStream(
                            slot.participant,
                            localCameraStream,
                            localScreenStream,
                            remoteParticipantStreams,
                            slot.sourcePreference,
                          )}
                          isCompact
                          isSelected={
                            focusedParticipantId === slot.participant.userId ||
                            audioPanelParticipantId === slot.participant.userId
                          }
                          showAudioControls={
                            audioPanelParticipantId === slot.participant.userId
                          }
                          audioPreference={
                            audioPanelParticipantId === slot.participant.userId
                              ? selectedPreference
                              : undefined
                          }
                          onToggleMute={() =>
                            handleMute(!selectedPreference.muted)
                          }
                          onVolumeChange={handleVolume}
                          onActivate={(event) =>
                            handleParticipantFocus(event, slot.participant)
                          }
                          onContextMenu={(event) =>
                            handleParticipantContextMenu(event, slot.participant)
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                stageParticipantSlots.map((slot) => (
                  <LobbyParticipantTile
                    key={slot.slotId}
                    participant={slot.participant}
                    avatarUrl={avatarByUserId[slot.participant.userId]}
                    previewStream={resolvePreviewStream(
                      slot.participant,
                      localCameraStream,
                      localScreenStream,
                      remoteParticipantStreams,
                      slot.sourcePreference,
                    )}
                    isSelected={
                      focusedParticipantId === slot.participant.userId ||
                      audioPanelParticipantId === slot.participant.userId
                    }
                    showAudioControls={
                      audioPanelParticipantId === slot.participant.userId
                    }
                    audioPreference={
                      audioPanelParticipantId === slot.participant.userId
                        ? selectedPreference
                        : undefined
                    }
                    onToggleMute={() => handleMute(!selectedPreference.muted)}
                    onVolumeChange={handleVolume}
                    onActivate={(event) =>
                      handleParticipantFocus(event, slot.participant)
                    }
                    onContextMenu={(event) =>
                      handleParticipantContextMenu(event, slot.participant)
                    }
                  />
                ))
              )}
            </div>

            <div className="ct-lobby-stage-actions" aria-label="Lobi işlevleri">
              <Tooltip title={micEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç"}>
                <Button
                  size="large"
                  className={`ct-lobby-action-btn ${micEnabled ? "active" : ""}`}
                  icon={micEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
                  onClick={onToggleMic}
                />
              </Tooltip>

              <Tooltip title={headphoneEnabled ? "Kulaklığı Kapat" : "Kulaklığı Aç"}>
                <Button
                  size="large"
                  className={`ct-lobby-action-btn ${headphoneEnabled ? "active" : ""}`}
                  icon={<CustomerServiceOutlined />}
                  onClick={onToggleHeadphone}
                />
              </Tooltip>

              <Tooltip title={screenEnabled ? "Ekran Paylaşımını Durdur" : "Ekranı Paylaş"}>
                <Button
                  size="large"
                  className={`ct-lobby-action-btn ${screenEnabled ? "active" : ""}`}
                  icon={<DesktopOutlined />}
                  onClick={onToggleScreen}
                />
              </Tooltip>

              <Tooltip title={cameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}>
                <Button
                  size="large"
                  className={`ct-lobby-action-btn ${cameraEnabled ? "active" : ""}`}
                  icon={<VideoCameraOutlined />}
                  onClick={onToggleCamera}
                />
              </Tooltip>

              <Tooltip title="Lobiden Ayrıl">
                <Button
                  size="large"
                  className="ct-lobby-action-btn danger"
                  icon={<LogoutOutlined />}
                  onClick={onLeaveLobby}
                  loading={isLeavingLobby}
                  disabled={isLeavingLobby}
                />
              </Tooltip>
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
                  <MessageOutlined style={{ fontSize: "13px", marginRight: "6px" }} /> Lobi Sohbeti
                </p>
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
    </div>
  );
}
