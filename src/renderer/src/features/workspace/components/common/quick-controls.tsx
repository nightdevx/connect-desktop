import { Tooltip } from "antd";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AudioMutedOutlined,
  AudioOutlined,
  CustomerServiceOutlined,
  DisconnectOutlined,
  StopOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import {
  getDisplayInitials,
  getPresenceColor,
  getUserStatusLabel,
  hueStyle,
} from "../../workspace-utils";
import type { PresenceStatus } from "@shared/auth-contracts";
import { useMediaStats, type LiveKitConnectionStatus } from "@/features/livekit";
import type { FriendsController } from "../../hooks/user/use-friends";
import { useWorkspaceAudioConnection } from "../../hooks/lobby/use-workspace-audio-connection";
import { UserProfileCardPopover } from "../user/user-profile-card";

import { AudioDeviceDropdown } from "./AudioDeviceDropdown";

interface QuickControlsProps {
  currentUsername: string;
  currentUserId: string;
  currentUserAvatarUrl?: string | null;
  /** Only so the card can render; nothing here acts on your own friends list. */
  friends: FriendsController;
  hasActiveLobby: boolean;
  isLeavingLobby: boolean;
  micEnabled: boolean;
  /**
   * A moderator took this user's microphone away.
   *
   * Disabled rather than flipped: micEnabled is what the person WANTS, it
   * survives the restriction, and the session republishes from it the moment the
   * mute lifts — which is what stopped a lifted mute needing a leave-and-rejoin.
   */
  micLocked: boolean;
  headphoneEnabled: boolean;
  /** This user's own screen share, not somebody else's being watched. */
  screenShareEnabled: boolean;
  /** This user's own camera. */
  cameraEnabled: boolean;
  /** Who is seeing it right now, e.g. "Genel odasındaki 4 kişi görüyor". */
  mediaAudience?: string;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioInputDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  onSelectAudioInputDevice: (deviceId: string | null) => void;
  onSelectAudioOutputDevice: (deviceId: string | null) => void;
  onToggleMic: () => void;
  onToggleHeadphone: () => void;
  onStopScreenShare: () => void;
  onStopCamera: () => void;
  onDisconnect: () => void;
  /** The call row (CallDock variant="strip"), above the reminders. */
  callStrip?: ReactNode;
  /** This user's presence, for the dot and the line under the name. */
  presenceStatus?: PresenceStatus;
  /** Where they are: the room's name, or "Görüşmede: …". */
  whereLabel?: string;
  /** The room the voice is in, a call's included; with the transport state
      it drives the connection dot. */
  voiceRoomId?: string | null;
  liveKitConnectionState?: LiveKitConnectionStatus;
}

const VOICE_DOT: Record<LiveKitConnectionStatus, "connected" | "reconnecting" | "disconnected"> = {
  connected: "connected",
  connecting: "reconnecting",
  reconnecting: "reconnecting",
  disconnected: "disconnected",
  closed: "disconnected",
};

/**
 * The voice connection at a glance, in the dock, so it shows with the
 * sidebar folded too (the full status card is the open sidebar's). Coloured by
 * the transport state; the tooltip is the card's own wording. Its own
 * component because that wording reads the once-a-second media sample, and
 * only this dot should re-render for it.
 */
function VoiceConnectionDot({
  voiceRoomId,
  state,
}: {
  voiceRoomId: string;
  state: LiveKitConnectionStatus;
}) {
  // Between two reconnect attempts the session passes through "disconnected"
  // for a few dozen milliseconds; the dot turns red only once that holds, so
  // it does not blink red and amber while the app is still retrying.
  const [shown, setShown] = useState(state);
  useEffect(() => {
    const down = state === "disconnected" || state === "closed";
    const timer = window.setTimeout(() => setShown(state), down ? 1000 : 0);
    return () => window.clearTimeout(timer);
  }, [state]);
  const mediaStats = useMediaStats();
  const { statusText } = useWorkspaceAudioConnection({
    activeLobbyId: voiceRoomId,
    liveKitConnectionState: shown,
    mediaStats,
  });
  return (
    <Tooltip title={statusText}>
      <span className={`ct-quick-voice ${VOICE_DOT[shown]}`} role="img" aria-label={statusText} />
    </Tooltip>
  );
}

/**
 * The dock at the bottom of the sidebar column: who you are, your microphone
 * and output, the way out of a room, and a live share.
 *
 * Rendered by WorkspaceShell rather than by a sidebar, and that is the point.
 * It used to sit inside WorkspaceSidebar behind `workspaceSection !== "settings"`,
 * and the admin section replaces the sidebar outright -- so the two screens
 * where you are least likely to be watching the room were also the two where
 * your microphone state, and the button that gets you out, disappeared.
 */
export function QuickControls({
  currentUsername,
  currentUserId,
  currentUserAvatarUrl,
  friends,
  hasActiveLobby,
  isLeavingLobby,
  micEnabled,
  micLocked,
  headphoneEnabled,
  screenShareEnabled,
  cameraEnabled,
  mediaAudience,
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputDeviceId,
  selectedAudioOutputDeviceId,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
  onToggleMic,
  onToggleHeadphone,
  onStopScreenShare,
  onStopCamera,
  onDisconnect,
  callStrip,
  presenceStatus = "online",
  whereLabel,
  voiceRoomId,
  liveKitConnectionState = "disconnected",
}: QuickControlsProps) {
  // Two of them: open, the dot stands in for the presence dot on the "where"
  // line, so the room's name keeps its width; folded, the identity row is
  // hidden and the one among the controls shows (odak.css).
  const voiceDot = voiceRoomId ? (
    <VoiceConnectionDot voiceRoomId={voiceRoomId} state={liveKitConnectionState} />
  ) : null;
  return (
    <div className="ct-quick-dock">
      {callStrip}
      {/* Sits ABOVE the identity row on purpose: a share you have forgotten
          about is the one piece of state here with a privacy cost, so it gets
          its own box rather than a fourth icon in a row of icons. */}
      {screenShareEnabled && (
        <div className="ct-quick-share-bar" role="status" aria-live="polite">
          <span className="ct-live-dot" aria-hidden="true" />
          <span className="ct-quick-share-text">
            <strong>Ekranını paylaşıyorsun</strong>
            {mediaAudience && <span>{mediaAudience}</span>}
          </span>
          <button
            type="button"
            className="ct-quick-share-stop"
            onClick={onStopScreenShare}
            title="Ekran paylaşımını durdur"
          >
            <StopOutlined aria-hidden="true" />
            <span className="ct-quick-share-stop-label">Durdur</span>
          </button>
        </div>
      )}

      {/* The same reminder for the camera: it is the other thing on this
          screen that other people are looking at. */}
      {cameraEnabled && (
        <div className="ct-quick-share-bar" role="status" aria-live="polite">
          <VideoCameraOutlined className="ct-quick-share-icon" aria-hidden="true" />
          <span className="ct-quick-share-text">
            <strong>Kameran açık</strong>
            {mediaAudience && <span>{mediaAudience}</span>}
          </span>
          <button
            type="button"
            className="ct-quick-share-stop"
            onClick={onStopCamera}
            title="Kamerayı kapat"
          >
            <StopOutlined aria-hidden="true" />
            <span className="ct-quick-share-stop-label">Kapat</span>
          </button>
        </div>
      )}

      <footer className="ct-quick-idle" aria-label="Hızlı kontroller">
      {/* Your own name was the only one in the app that was not clickable, so
          the card you can open for everybody else -- avatar, handle, join date
          -- was the one thing you could not check about yourself.

          Opens upward: the dock is pinned to the bottom of the window, and the
          card is taller than the space under it. */}
      <UserProfileCardPopover
        userId={currentUserId}
        fallbackName={currentUsername}
        currentUserId={currentUserId}
        friends={friends}
        placement="topLeft"
      >
        <button type="button" className="ct-quick-idle-left" aria-label="Profilin">
          <div className="ct-quick-idle-logo" aria-hidden="true" style={hueStyle(currentUserId)}>
            {currentUserAvatarUrl ? (
              <img
                className="ct-user-avatar-image"
                src={currentUserAvatarUrl}
                alt=""
              />
            ) : (
              getDisplayInitials(currentUsername)
            )}
          </div>
          <div className="ct-quick-idle-meta">
            <strong>{currentUsername}</strong>
            {/* Where you are, or how you appear to everyone else when you are
                nowhere in particular. */}
            <span className="ct-quick-idle-status">
              {voiceDot ?? (
                <span
                  className="ct-quick-idle-dot"
                  style={{ background: getPresenceColor(true, presenceStatus) }}
                  aria-hidden="true"
                />
              )}
              <span className="ct-quick-idle-where">
                {whereLabel ?? getUserStatusLabel(true, presenceStatus)}
              </span>
            </span>
          </div>
        </button>
      </UserProfileCardPopover>

      <div className="ct-quick-controls-inline" aria-label="İşlevler">
        {voiceDot}
        <AudioDeviceDropdown
          kind="input"
          devices={audioInputDevices}
          selectedDeviceId={selectedAudioInputDeviceId}
          onSelectDevice={onSelectAudioInputDevice}
        >
          <Tooltip
            title={
              micLocked
                ? "Bir yetkili mikrofonunuzu kapattı (sağ tık: giriş cihazı)"
                : `Mikrofon ${micEnabled ? "açık" : "kapalı"} (sağ tık: giriş cihazı)`
            }
          >
            <button
              type="button"
              className={`ct-quick-icon-button ${micLocked ? "forced-muted" : micEnabled ? "" : "off"}`}
              onClick={onToggleMic}
              disabled={micLocked}
              // The reason rides on the label rather than a tooltip: a disabled
              // control gets no hover and no focus, so the tooltip is the one
              // place the explanation cannot be read from.
              aria-label={
                micLocked
                  ? "Mikrofon — bir yetkili mikrofonunuzu kapattı"
                  : "Mikrofon"
              }
              aria-pressed={micEnabled}
            >
              {/* The icon carries the state as well as the colour, so it still
                  reads at a glance for anyone who cannot rely on the fill. */}
              {micLocked || !micEnabled ? <AudioMutedOutlined /> : <AudioOutlined />}
            </button>
          </Tooltip>
        </AudioDeviceDropdown>

        <AudioDeviceDropdown
          kind="output"
          devices={audioOutputDevices}
          selectedDeviceId={selectedAudioOutputDeviceId}
          onSelectDevice={onSelectAudioOutputDevice}
        >
          <Tooltip
            title={`Kulaklık ${headphoneEnabled ? "açık" : "kapalı"} (sağ tık: çıkış cihazı)`}
          >
            <button
              type="button"
              className={`ct-quick-icon-button ${headphoneEnabled ? "" : "off"}`}
              onClick={onToggleHeadphone}
              aria-label="Kulaklık"
              aria-pressed={headphoneEnabled}
            >
              <CustomerServiceOutlined
                className={headphoneEnabled ? undefined : "ct-icon-slashed"}
              />
            </button>
          </Tooltip>
        </AudioDeviceDropdown>

          {hasActiveLobby && (
            <Tooltip
              title={isLeavingLobby ? "Lobiden ayrılıyor" : "Lobiden ayrıl"}
            >
              <button
                type="button"
                className="ct-quick-icon-button danger"
                onClick={onDisconnect}
                disabled={isLeavingLobby}
                aria-label="Lobiden ayrıl"
              >
                <DisconnectOutlined />
              </button>
            </Tooltip>
          )}
        </div>
      </footer>
    </div>
  );
}
