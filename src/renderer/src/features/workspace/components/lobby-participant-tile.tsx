import { useEffect, useRef, type MouseEvent } from "react";
import { Headphones, Mic, MicOff, MonitorUp, VolumeX } from "lucide-react";
import type { LobbyStateMember } from "../../../../../shared/desktop-api-types";
import { getDisplayInitials } from "../workspace-utils";

export interface LobbyParticipantView extends LobbyStateMember {
  isLocalUser: boolean;
}

interface LobbyParticipantTileProps {
  participant: LobbyParticipantView;
  avatarUrl?: string | null;
  previewStream?: MediaStream | null;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
}

export function LobbyParticipantTile({
  participant,
  avatarUrl,
  previewStream = null,
  onContextMenu,
}: LobbyParticipantTileProps) {
  const micOpen = !participant.muted;
  const headphoneOpen = !participant.deafened;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (videoElement.srcObject !== previewStream) {
      videoElement.srcObject = previewStream;
    }

    if (previewStream) {
      void videoElement.play().catch(() => {
        // Browser may block autoplay until user gesture.
      });
    }

    return () => {
      if (videoElement.srcObject === previewStream) {
        videoElement.srcObject = null;
      }
    };
  }, [previewStream]);

  return (
    <article
      className={`ct-lobby-participant-tile ${participant.speaking ? "speaking" : ""} ${participant.isLocalUser ? "local-user" : ""}`}
      aria-label={participant.username}
      onContextMenu={onContextMenu}
      title={participant.isLocalUser ? undefined : "Sag tik: kullanici sesi"}
    >
      {previewStream && (
        <video
          ref={videoRef}
          className="ct-lobby-tile-video"
          autoPlay
          playsInline
          muted
        />
      )}

      <div
        className={`ct-lobby-tile-center-logo ${previewStream ? "media-on" : ""}`}
        aria-hidden="true"
      >
        {avatarUrl ? (
          <img className="ct-lobby-tile-avatar" src={avatarUrl} alt="" />
        ) : (
          getDisplayInitials(participant.username)
        )}
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
              <Mic size={12} aria-hidden="true" />
            ) : (
              <MicOff size={12} aria-hidden="true" />
            )}
          </span>
          <span
            className={`ct-lobby-flag ${headphoneOpen ? "active" : "inactive"}`}
          >
            {headphoneOpen ? (
              <Headphones size={12} aria-hidden="true" />
            ) : (
              <VolumeX size={12} aria-hidden="true" />
            )}
          </span>
          {participant.screenSharing && (
            <span className="ct-lobby-flag signal" title="Ekran paylaşımı açık">
              <MonitorUp size={12} aria-hidden="true" />
            </span>
          )}
        </div>
      </footer>
    </article>
  );
}
