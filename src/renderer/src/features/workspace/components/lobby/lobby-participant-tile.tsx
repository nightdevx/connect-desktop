import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Avatar, Tooltip } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  CustomerServiceOutlined,
  MutedOutlined,
  DesktopOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from "@ant-design/icons";
import { Track } from "livekit-client";
import type { LobbyStateMember } from "@shared/desktop-api-types";
import { logLiveKitDebug } from "@/features/livekit";
import { getDisplayInitials } from "../../workspace-utils";
import { AudioDeviceDropdown } from "../common/AudioDeviceDropdown";

export interface LobbyParticipantView extends LobbyStateMember {
  isLocalUser: boolean;
  isPlaceholder?: boolean;
}


interface LobbyParticipantTileProps {
  participant: LobbyParticipantView;
  avatarUrl?: string | null;
  previewStream?: Track | MediaStream | null;
  isSelected?: boolean;
  isFocusedLayout?: boolean;
  isCompact?: boolean;
  onActivate?: (event: MouseEvent<HTMLElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  // Local User Device Props
  audioInputDevices?: MediaDeviceInfo[];
  audioOutputDevices?: MediaDeviceInfo[];
  selectedAudioInputDeviceId?: string | null;
  selectedAudioOutputDeviceId?: string | null;
  onSelectAudioInputDevice?: (deviceId: string | null) => void;
  onSelectAudioOutputDevice?: (deviceId: string | null) => void;
  // Local preferences for this remote participant
  localAudioMuted?: boolean;
  localScreenAudioMuted?: boolean;
}

export function LobbyParticipantTile({
  participant,
  avatarUrl,
  previewStream = null,
  isSelected = false,
  isFocusedLayout = false,
  isCompact = false,
  onActivate,
  onContextMenu,
  audioInputDevices = [],
  audioOutputDevices = [],
  selectedAudioInputDeviceId = null,
  selectedAudioOutputDeviceId = null,
  onSelectAudioInputDevice,
  onSelectAudioOutputDevice,
  localAudioMuted = false,
  localScreenAudioMuted = false,
}: LobbyParticipantTileProps) {
  const micOpen = !participant.muted;
  const headphoneOpen = !participant.deafened;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleToggleFullscreen = (event: MouseEvent) => {
    event.stopPropagation();
    const containerElement = containerRef.current;
    if (!containerElement) return;

    if (document.fullscreenElement === containerElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerElement.requestFullscreen().catch((err) => {
        console.error("Fullscreen request failed:", err);
      });
    }
  };

  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (!previewStream) return;
    handleToggleFullscreen(event);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (containerRef.current) {
        setIsFullscreen(document.fullscreenElement === containerRef.current);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (!previewStream) {
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
      }
      return;
    }

    // Force attributes for better reliability in some Chromium/Electron environments
    videoElement.muted = true;
    videoElement.setAttribute("autoplay", "true");
    videoElement.setAttribute("playsinline", "true");

    const isLiveKitTrack = previewStream instanceof Track;

    if (isLiveKitTrack) {
      const track = previewStream as Track;
      track.attach(videoElement);
      // LiveKit attach sets srcObject, but we should ensure it plays
      videoElement.play().catch((err) => {
        if (err.name !== "NotAllowedError" && err.name !== "AbortError") {
          logLiveKitDebug?.("participant-tile", "play-failed", { err });
        }
      });

      return () => {
        track.detach(videoElement);
      };
    } else {
      const mediaStream = previewStream as MediaStream | null;
      if (videoElement.srcObject !== mediaStream) {
        videoElement.srcObject = mediaStream;
        if (mediaStream instanceof MediaStream) {
          mediaStream.getVideoTracks().forEach((t) => {
            t.enabled = true;
          });
        }
      }

      const tryPlay = () => {
        videoElement.play().catch((err) => {
          if (err.name !== "AbortError") {
            // Try again once after a short delay if it fails
            setTimeout(() => {
              if (videoRef.current) videoRef.current.play().catch(() => {});
            }, 200);
          }
        });
      };

      tryPlay();

      return () => {
        if (videoElement.srcObject === mediaStream) {
          videoElement.srcObject = null;
        }
      };
    }
  }, [previewStream]);

  return (
    <article
      className={[
        "ct-lobby-participant-tile",
        participant.speaking ? "speaking" : "",
        participant.isLocalUser ? "local-user" : "",
        isSelected ? "selected" : "",
        isFocusedLayout ? "focused" : "",
        isCompact ? "compact" : "",
        participant.isPlaceholder ? "ct-call-placeholder-pulsing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={participant.username}
      aria-pressed={!participant.isLocalUser && isSelected ? true : undefined}
      onContextMenu={onContextMenu}
      onClick={!participant.isLocalUser && !participant.isPlaceholder ? onActivate : undefined}

      onDoubleClick={handleDoubleClick}
      title={
        participant.isLocalUser
          ? undefined
          : "Sol tık: büyüt / Çift tık: tam ekran / Sağ tık: seçenekler"
      }
    >
      {previewStream && (
        <div
          ref={containerRef}
          className={`ct-lobby-video-container ${isFullscreen ? "fullscreen" : ""}`}
          onDoubleClick={handleDoubleClick}
        >
          <video
            ref={videoRef}
            className="ct-lobby-tile-video"
            autoPlay
            playsInline
            muted
            onLoadedMetadata={handleVideoLoadedMetadata}
          />
          {isFullscreen ? (
            <button
              onClick={handleToggleFullscreen}
              className="ct-lobby-tile-fullscreen-exit-btn"
              title="Tam Ekrandan Çık"
            >
              <FullscreenExitOutlined style={{ fontSize: "16px" }} />
            </button>
          ) : (
            <button
              onClick={handleToggleFullscreen}
              className="ct-lobby-tile-fullscreen-btn"
              title="Tam Ekran Yap"
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "rgba(15, 15, 15, 0.7)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 30,
                opacity: 0,
                transform: "scale(0.9)",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                backdropFilter: "blur(6px)",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              }}
            >
              <FullscreenOutlined style={{ fontSize: "14px" }} />
            </button>
          )}
        </div>
      )}

      <div
        className={`ct-lobby-tile-center-logo ${previewStream ? "media-on" : ""}`}
        aria-hidden="true"
      >
        <Avatar
          size={isCompact ? 40 : 64}
          src={avatarUrl}
          className="ct-lobby-avatar-container"
          style={{
            background: "rgba(30, 30, 30, 0.9)",
            border: "1.5px solid rgba(255, 255, 255, 0.15)",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontWeight: "bold",
            fontSize: isCompact ? "14px" : "20px",
          }}
        >
          {getDisplayInitials(participant.username)}
        </Avatar>
      </div>

      <footer className="ct-lobby-tile-footer">
        <div className="ct-lobby-tile-userline">
          <p title={participant.username}>{participant.username}</p>
        </div>

        <div
          className="ct-lobby-tile-flags"
          aria-label="Kullanıcı durum simgeleri"
        >
          {participant.isLocalUser ? (
            <AudioDeviceDropdown
              kind="input"
              devices={audioInputDevices}
              selectedDeviceId={selectedAudioInputDeviceId}
              onSelectDevice={onSelectAudioInputDevice || (() => {})}
            >
              <span
                className={`ct-lobby-flag ${micOpen ? "active" : "inactive"}`}
                title="Sağ tık: giriş cihazı"
              >
                {micOpen ? (
                  <AudioOutlined style={{ fontSize: "11px", color: "#10b981" }} />
                ) : (
                  <AudioMutedOutlined style={{ fontSize: "11px", color: "#6b7280" }} />
                )}
              </span>
            </AudioDeviceDropdown>
          ) : (
            <Tooltip title={localAudioMuted ? "Siz susturdunuz" : (micOpen ? "Mikrofon açık" : "Mikrofon kapalı")}>
              <span className={`ct-lobby-flag ${localAudioMuted ? "muted" : (micOpen ? "active" : "inactive")}`}>
                {localAudioMuted ? (
                  <AudioMutedOutlined style={{ fontSize: "11px", color: "#ef4444" }} />
                ) : micOpen ? (
                  <AudioOutlined style={{ fontSize: "11px", color: "#10b981" }} />
                ) : (
                  <AudioMutedOutlined style={{ fontSize: "11px", color: "#6b7280" }} />
                )}
              </span>
            </Tooltip>
          )}

          {participant.isLocalUser ? (
            <AudioDeviceDropdown
              kind="output"
              devices={audioOutputDevices}
              selectedDeviceId={selectedAudioOutputDeviceId}
              onSelectDevice={onSelectAudioOutputDevice || (() => {})}
            >
              <span
                className={`ct-lobby-flag ${headphoneOpen ? "active" : "inactive"}`}
                title="Sağ tık: çıkış cihazı"
              >
                {headphoneOpen ? (
                  <CustomerServiceOutlined style={{ fontSize: "11px", color: "#10b981" }} />
                ) : (
                  <MutedOutlined style={{ fontSize: "11px", color: "#6b7280" }} />
                )}
              </span>
            </AudioDeviceDropdown>
          ) : (
            <span
              className={`ct-lobby-flag ${headphoneOpen ? "active" : "inactive"}`}
            >
              {headphoneOpen ? (
                <CustomerServiceOutlined style={{ fontSize: "11px", color: "#10b981" }} />
              ) : (
                <MutedOutlined style={{ fontSize: "11px", color: "#6b7280" }} />
              )}
            </span>
          )}

          {participant.screenSharing && (
            <Tooltip title={localScreenAudioMuted ? "Yayın sesini susturdunuz" : "Ekran paylaşımı açık"}>
              <span className={`ct-lobby-flag ${localScreenAudioMuted ? "muted" : "signal"}`}>
                {localScreenAudioMuted ? (
                  <MutedOutlined style={{ fontSize: "11px", color: "#ef4444" }} />
                ) : (
                  <DesktopOutlined style={{ fontSize: "11px", color: "#ffffff" }} />
                )}
              </span>
            </Tooltip>
          )}
        </div>
      </footer>
    </article>
  );
}


