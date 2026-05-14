import { useEffect, useRef, type MouseEvent } from "react";
import { Slider, Avatar, Tooltip } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  CustomerServiceOutlined,
  MutedOutlined,
  SoundOutlined,
  DesktopOutlined,
} from "@ant-design/icons";
import type { LobbyStateMember } from "@shared/desktop-api-types";
import { type RemoteParticipantAudioPreference, logLiveKitDebug } from "@/features/livekit";
import { getDisplayInitials } from "../../workspace-utils";

export interface LobbyParticipantView extends LobbyStateMember {
  isLocalUser: boolean;
}

interface LobbyParticipantTileProps {
  participant: LobbyParticipantView;
  avatarUrl?: string | null;
  previewStream?: any; // MediaStream or livekit Track
  /** Ses kontrol paneli bu tile için açıksa true */
  isSelected?: boolean;
  isFocusedLayout?: boolean;
  isCompact?: boolean;
  showAudioControls?: boolean;
  audioPreference?: RemoteParticipantAudioPreference;
  onToggleMute?: () => void;
  onVolumeChange?: (volumePercent: number) => void;
  onActivate?: (event: MouseEvent<HTMLElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
}

export function LobbyParticipantTile({
  participant,
  avatarUrl,
  previewStream = null,
  isSelected = false,
  isFocusedLayout = false,
  isCompact = false,
  showAudioControls = false,
  audioPreference,
  onToggleMute,
  onVolumeChange,
  onActivate,
  onContextMenu,
}: LobbyParticipantTileProps) {
  const micOpen = !participant.muted;
  const headphoneOpen = !participant.deafened;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isLocal = participant.isLocalUser;
  const effectivePreference = audioPreference ?? {
    muted: false,
    volumePercent: 100,
  };
  const effectiveVolume = Number.isFinite(effectivePreference.volumePercent)
    ? Math.min(200, Math.max(0, Math.round(effectivePreference.volumePercent)))
    : 100;
  const canShowAudioControls = showAudioControls && !isLocal;

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

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

    const isLiveKitTrack = typeof previewStream.attach === "function";

    if (isLiveKitTrack) {
      previewStream.attach(videoElement);
      // LiveKit attach sets srcObject, but we should ensure it plays
      videoElement.play().catch((err) => {
        if (err.name !== "NotAllowedError" && err.name !== "AbortError") {
          logLiveKitDebug?.("participant-tile", "play-failed", { err });
        }
      });

      return () => {
        previewStream.detach(videoElement);
      };
    } else {
      if (videoElement.srcObject !== previewStream) {
        videoElement.srcObject = previewStream;
        if (previewStream instanceof MediaStream) {
          previewStream.getVideoTracks().forEach((t) => {
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
        if (videoElement.srcObject === previewStream) {
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
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={participant.username}
      aria-pressed={!participant.isLocalUser && isSelected ? true : undefined}
      onContextMenu={onContextMenu}
      onClick={!participant.isLocalUser ? onActivate : undefined}
      title={
        participant.isLocalUser
          ? undefined
          : "Sol tık: büyüt / Sağ tık: ses paneli"
      }
    >
      {previewStream && (
        <video
          ref={videoRef}
          className="ct-lobby-tile-video"
          autoPlay
          playsInline
          muted
          onLoadedMetadata={handleVideoLoadedMetadata}
        />
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
          <span className={`ct-lobby-flag ${micOpen ? "active" : "inactive"}`}>
            {micOpen ? (
              <AudioOutlined style={{ fontSize: "11px", color: "#10b981" }} />
            ) : (
              <AudioMutedOutlined style={{ fontSize: "11px", color: "#6b7280" }} />
            )}
          </span>
          <span
            className={`ct-lobby-flag ${headphoneOpen ? "active" : "inactive"}`}
          >
            {headphoneOpen ? (
              <CustomerServiceOutlined style={{ fontSize: "11px", color: "#10b981" }} />
            ) : (
              <MutedOutlined style={{ fontSize: "11px", color: "#6b7280" }} />
            )}
          </span>
          {participant.screenSharing && (
            <span className="ct-lobby-flag signal" title="Ekran paylaşımı açık">
              <DesktopOutlined style={{ fontSize: "11px", color: "#ffffff" }} />
            </span>
          )}
        </div>
      </footer>

      {canShowAudioControls && (
        <div
          className="ct-lobby-inline-audio-controls-premium"
          role="group"
          aria-label={`${participant.username} ses ayarlari`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className={`ct-lobby-inline-mute-btn ${effectivePreference.muted ? "muted" : ""}`}
            onClick={() => onToggleMute?.()}
            title={effectivePreference.muted ? "Sesi aç" : "Sustur"}
            aria-label={effectivePreference.muted ? "Sesi aç" : "Sustur"}
            style={{
              background: effectivePreference.muted ? "#ffffff" : "rgba(255,255,255,0.06)",
            }}
          >
            {effectivePreference.muted ? (
              <MutedOutlined style={{ fontSize: "11px", color: "#000000" }} />
            ) : (
              <SoundOutlined style={{ fontSize: "11px", color: "#ffffff" }} />
            )}
          </button>

          <div style={{ flex: 1, padding: "0 4px" }}>
            <Slider
              min={0}
              max={200}
              step={5}
              value={effectiveVolume}
              onChange={onVolumeChange}
              tooltip={{ formatter: (v) => `%${v}` }}
              styles={{
                track: {
                  background: "#ffffff",
                },
                handle: {
                  background: "#ffffff",
                  borderColor: "#ffffff",
                },
              }}
              style={{ margin: 0, padding: "4px 0" }}
            />
          </div>

          <span className="ct-lobby-inline-volume-value">
            %{effectiveVolume}
          </span>
        </div>
      )}
    </article>
  );
}


