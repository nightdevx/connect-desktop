import { memo, useEffect, useRef, useState, type MouseEvent } from "react";
import { Avatar, Tooltip } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  CustomerServiceOutlined,
  MutedOutlined,
  DesktopOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  PicRightOutlined,
  SignalFilled,
} from "@ant-design/icons";
import { Track } from "livekit-client";
import type { LobbyStateMember } from "@shared/desktop-api-types";
import { logLiveKitDebug } from "@/services/debug-log";
import { getDisplayInitials } from "../../workspace-utils";
import { AudioDeviceDropdown } from "../common/AudioDeviceDropdown";
import { useWindowActive } from "../../hooks/media/use-window-active";
import {
  closePip,
  openPip,
  pipKeyFor,
  usePipKey,
} from "../../hooks/media/pip-stream";
import {
  useConnectionQuality,
  type ParticipantConnectionQuality,
} from "@/features/livekit";
import { ScreenWatcherBadge } from "./lobby-screen-watchers";
import { useLobbyEmoteFlash } from "@/store/lobby-emote-flash";

// useWindowActive reports whether this app window is in the foreground.
//
// It only gates the LOCAL preview: the person sharing their screen is looking
// at the real thing, not at a thumbnail of it, and decoding + compositing that
// thumbnail behind another window is pure waste on the machine already paying
// to capture and encode the stream. Remote streams are deliberately NOT paused
// — watching one is now an explicit choice, and stopping it because the viewer
// alt-tabbed would undo that choice for them.
const CONNECTION_QUALITY_LABEL: Record<ParticipantConnectionQuality, string> = {
  excellent: "Bağlantı iyi",
  good: "Bağlantı iyi",
  poor: "Bağlantısı zayıf",
  lost: "Bağlantısı koptu",
  unknown: "Bağlantı durumu bilinmiyor",
};

// Written out rather than interpolated so the class names stay greppable —
// scripts/check-css-classes.cjs matches literals, and a built-up name is
// exactly the kind that survives a stylesheet rename with nothing to show it.
const CONNECTION_QUALITY_CLASS: Record<ParticipantConnectionQuality, string> = {
  excellent: "ct-quality-excellent",
  good: "ct-quality-good",
  poor: "ct-quality-poor",
  lost: "ct-quality-lost",
  unknown: "ct-quality-unknown",
};

export interface LobbyParticipantView extends LobbyStateMember {
  isLocalUser: boolean;
  isPlaceholder?: boolean;
  // Derived locally from LiveKit's active-speaker signal, not from the server.
  speaking: boolean;
}


interface LobbyParticipantTileProps {
  participant: LobbyParticipantView;
  avatarUrl?: string | null;
  previewStream?: Track | MediaStream | null;
  kind?: "camera" | "screen" | "avatar";
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
  // Screen shares are opt-in. isWatchingScreen is whether THIS viewer has
  // subscribed; onWatchScreen starts it.
  isWatchingScreen?: boolean;
  onWatchScreen?: (userId: string) => void;
  /**
   * Roster display names, for the audience badge on a screen tile.
   *
   * Deliberately absent from the memo comparator below: the badge reads the
   * audience itself and re-renders on its own, and a rename is not worth
   * re-rendering a live video element for.
   */
  nameByUserId?: Record<string, string>;
}

function LobbyParticipantTileImpl({
  participant,
  avatarUrl,
  previewStream = null,
  kind = "avatar",
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
  isWatchingScreen = false,
  onWatchScreen,
  nameByUserId,
}: LobbyParticipantTileProps) {
  const windowActive = useWindowActive();

  // A remote screen tile with nothing playing means the stream exists but this
  // viewer has not asked for it. Offer the button instead of a black rectangle.
  const showWatchPrompt =
    kind === "screen" &&
    !participant.isLocalUser &&
    !participant.isPlaceholder &&
    !isWatchingScreen &&
    !previewStream &&
    Boolean(onWatchScreen);
  const micOpen = !participant.muted && !participant.serverMuted;
  const connectionQuality = useConnectionQuality(participant.userId);
  const headphoneOpen = !participant.deafened;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // PiP plays on a module-owned element, not on this one, so the flag has to
  // come from there: this tile is unmounted and rebuilt every time the stage
  // switches layouts, and state of its own would not survive that.
  const pipKey = pipKeyFor(participant.userId, kind);
  const isPictureInPicture = usePipKey() === pipKey;
  // videoWidth stays 0 until a frame's worth of metadata has decoded, and a PiP
  // window opened on a stream that never produces one is an empty grey box.
  const [hasVideoTrack, setHasVideoTrack] = useState(false);

  const canUsePictureInPicture = hasVideoTrack && document.pictureInPictureEnabled;

  // Your own preview, while you are working in another app, is a video nobody
  // is looking at. The capture and the encode still run — viewers need them —
  // but the local decode/composite does not have to. Fullscreen is exempt: it
  // keeps the preview on screen after the app window has stopped being the
  // focused one, so suspending it there is the same bug wearing a different
  // surface. PiP no longer needs the same exemption — it renders on its own
  // element, which this one never touches.
  const previewSuspended =
    participant.isLocalUser && !windowActive && !isFullscreen;

  const handleVideoLoadedMetadata = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    setHasVideoTrack(videoElement.videoWidth > 0);
    videoElement.play().catch(() => {});
  };

  const handleToggleFullscreen = (event: MouseEvent) => {
    event.stopPropagation();
    const containerElement = containerRef.current;
    if (!containerElement) return;

    if (document.fullscreenElement === containerElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }

    // One surface at a time. Leaving the stream in a PiP window while it also
    // fills the screen is two decodes of one track and two sets of controls
    // arguing over it.
    closePip();

    containerElement.requestFullscreen().catch((err) => {
      console.error("Fullscreen request failed:", err);
    });
  };

  const handleTogglePictureInPicture = (event: MouseEvent) => {
    event.stopPropagation();
    if (!previewStream) return;

    if (isPictureInPicture) {
      closePip();
      return;
    }

    // Deliberately not awaited: the fullscreen transition takes long enough
    // that awaiting it would spend the click's transient activation, and
    // requestPictureInPicture is refused without a live user gesture.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    void openPip(pipKey, previewStream);
  };

  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (!previewStream) return;
    handleToggleFullscreen(event);
  };

  // Fullscreen is read back off the DOM, never assumed.
  //
  // The old fullscreenchange listener bailed out on `if (containerRef.current)`,
  // which is exactly the case that breaks it: when the container unmounts while
  // it still owns fullscreen — the local screen-share stream drops for a frame,
  // or focusing someone re-parents this tile — React nulls the ref before the
  // event lands, so isFullscreen stayed stuck at true. The tile then kept
  // rendering the exit button, whose click took the "not fullscreen" branch and
  // *re-entered* fullscreen instead of leaving, and previewSuspended never came
  // back on for the local user.
  useEffect(() => {
    const containerElement = containerRef.current;

    const syncPresentation = (): void => {
      setIsFullscreen(
        containerElement !== null &&
          document.fullscreenElement === containerElement,
      );
    };

    syncPresentation();

    document.addEventListener("fullscreenchange", syncPresentation);

    return () => {
      document.removeEventListener("fullscreenchange", syncPresentation);
      // This element is on its way out, so whatever it was presenting is
      // already gone. The next run re-derives from the replacement.
      setIsFullscreen(false);
    };
  }, [previewStream]);

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

  // Suspend/resume the local preview with window focus. Kept in its own effect
  // so it does not re-attach the stream — pausing is enough to stop the decode,
  // and detaching would make coming back cost a fresh negotiation.
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !previewStream) {
      return;
    }

    // The live DOM, not previewSuspended alone: Windows blurs the window during
    // the fullscreen transition, so the blur lands a render before
    // fullscreenchange does and we would pause the very video we are promoting
    // to the whole screen — fullscreen opening on a frozen frame.
    const presenting =
      containerRef.current !== null &&
      document.fullscreenElement === containerRef.current;

    if (previewSuspended && !presenting) {
      videoElement.pause();
      return;
    }

    videoElement.play().catch(() => {
      // Autoplay can be refused while the window is still coming forward; the
      // next focus event retries.
    });
  }, [previewSuspended, previewStream]);

  const emoteFlash = useLobbyEmoteFlash(participant.userId);

  return (
    <article
      className={[
        "ct-lobby-participant-tile",
        "ct-stagger-entry",
        participant.speaking ? "speaking" : "",
        emoteFlash ? "emoting" : "",
        participant.isLocalUser ? "local-user" : "",
        isSelected ? "selected" : "",
        isFocusedLayout ? "focused" : "",
        isCompact ? "compact" : "",
        kind === "screen" ? "screen-share" : "",
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
      {emoteFlash && (
        <span className="ct-lobby-tile-emote-flash" aria-live="polite">
          <span aria-hidden="true">🔊</span>
          <span>{emoteFlash.label}</span>
        </span>
      )}

      {/* Both chips sit in one top-LEFT strip. The audience badge used to be
          parked top-right at the same 12px inset as the fullscreen button,
          which is drawn a layer above it — so hovering a screen tile covered
          "who is watching" with the control that expands it. */}
      {kind === "screen" && (
        <div className="ct-lobby-tile-topbar">
          <span className="ct-lobby-tile-kind-badge" title="Ekran paylaşımı">
            <DesktopOutlined />
            <span>Ekran</span>
          </span>

          {!participant.isPlaceholder && (
            <ScreenWatcherBadge
              ownerUserId={participant.userId}
              nameByUserId={nameByUserId ?? {}}
            />
          )}
        </div>
      )}

      {showWatchPrompt && (
        <div
          className="ct-lobby-tile-watch-prompt"
          
        >
          <DesktopOutlined  />
          <span className="ct-lobby-tile-watch-title">
            {participant.username} yayında
          </span>
          <button
            type="button"
            onClick={(event) => {
              // The tile itself handles click as "focus this participant".
              event.stopPropagation();
              onWatchScreen?.(participant.userId);
            }}
            className="ct-lobby-tile-watch-btn"
          >
            Yayını izle
          </button>
          <span className="ct-lobby-tile-watch-hint">
            Bırakmak için sağ tıklayın
          </span>
        </div>
      )}

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
            onEmptied={() => setHasVideoTrack(false)}
          />
          {canUsePictureInPicture && (
            <button
              onClick={handleTogglePictureInPicture}
              className={`ct-lobby-tile-pip-btn ${isPictureInPicture ? "active" : ""}`}
              title={
                isPictureInPicture ? "Küçük Ekranı Kapat" : "Küçük Ekranda Aç"
              }
            >
              <PicRightOutlined />
            </button>
          )}
          {isFullscreen ? (
            <button
              onClick={handleToggleFullscreen}
              className="ct-lobby-tile-fullscreen-exit-btn"
              title="Tam Ekrandan Çık"
            >
              <FullscreenExitOutlined  />
            </button>
          ) : (
            <button
              onClick={handleToggleFullscreen}
              className="ct-lobby-tile-fullscreen-btn"
              title="Tam Ekran Yap"
            >
              <FullscreenOutlined  />
            </button>
          )}
        </div>
      )}

      <div
        className={`ct-lobby-tile-center-logo ${previewStream ? "media-on" : ""}`}
        aria-hidden="true"
      >
        {/* The face is the whole tile when there is no video, so it is sized
            for that rather than for a list row. The container queries in
            features/lobby.css step it back down as the tile narrows — antd
            writes the size inline, so those have to win with !important. */}
        <Avatar
          size={isCompact ? 64 : 120}
          src={avatarUrl}
          className="ct-lobby-avatar-container"
        >
          {getDisplayInitials(participant.username)}
        </Avatar>
      </div>

      {/* A placeholder tile is someone the call is waiting on. The dimmed,
          dashed tile says "not here yet"; this says why. */}
      {participant.isPlaceholder && (
        <span className="ct-lobby-tile-ringing">Aranıyor…</span>
      )}

      <footer className="ct-lobby-tile-footer">
        <div className="ct-lobby-tile-userline">
          <p title={participant.username}>
            {kind === "screen" ? `${participant.username} · Ekran` : participant.username}
          </p>
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
                  <AudioOutlined  />
                ) : (
                  <AudioMutedOutlined  />
                )}
              </span>
            </AudioDeviceDropdown>
          ) : (
            <Tooltip title={localAudioMuted ? "Siz susturdunuz" : (micOpen ? "Mikrofon açık" : "Mikrofon kapalı")}>
              <span className={`ct-lobby-flag ${localAudioMuted ? "muted" : (micOpen ? "active" : "inactive")}`}>
                {localAudioMuted ? (
                  <AudioMutedOutlined  />
                ) : micOpen ? (
                  <AudioOutlined  />
                ) : (
                  <AudioMutedOutlined  />
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
                <CustomerServiceOutlined
                  className={headphoneOpen ? undefined : "ct-icon-slashed"}
                />
              </span>
            </AudioDeviceDropdown>
          ) : (
            <span
              className={`ct-lobby-flag ${headphoneOpen ? "active" : "inactive"}`}
            >
              <CustomerServiceOutlined
                className={headphoneOpen ? undefined : "ct-icon-slashed"}
              />
            </span>
          )}

          {participant.screenSharing && (
            <Tooltip title={localScreenAudioMuted ? "Yayın sesini susturdunuz" : "Ekran paylaşımı açık"}>
              <span className={`ct-lobby-flag ${localScreenAudioMuted ? "muted" : "signal"}`}>
                {localScreenAudioMuted ? (
                  <MutedOutlined  />
                ) : (
                  <DesktopOutlined  />
                )}
              </span>
            </Tooltip>
          )}

          {connectionQuality !== "unknown" &&
            connectionQuality !== "excellent" && (
              <Tooltip title={CONNECTION_QUALITY_LABEL[connectionQuality]}>
                <span
                  className={`ct-lobby-flag ${CONNECTION_QUALITY_CLASS[connectionQuality]}`}
                >
                  <SignalFilled />
                </span>
              </Tooltip>
            )}
        </div>
      </footer>
    </article>
  );
}



// The stage re-renders on every active-speaker signal from LiveKit — several
// times a second while anyone is talking — and rebuilds the whole slot list, so
// every tile got a brand-new `participant` object and re-rendered its <video>
// subtree even when nothing about it had changed.
//
// The two callback props are deliberately NOT compared: LobbyStageView builds
// them as inline arrows, so they are new on every render and a default
// shallow-equal memo would never hit. They are safe to ignore because the only
// thing they close over is the participant, which IS compared, and the handlers
// themselves only call setState updaters.
export const LobbyParticipantTile = memo(
  LobbyParticipantTileImpl,
  (previous, next) => {
    const a = previous.participant;
    const b = next.participant;

    return (
      a.userId === b.userId &&
      a.username === b.username &&
      a.muted === b.muted &&
      a.serverMuted === b.serverMuted &&
      a.deafened === b.deafened &&
      a.speaking === b.speaking &&
      a.isLocalUser === b.isLocalUser &&
      a.isPlaceholder === b.isPlaceholder &&
      previous.avatarUrl === next.avatarUrl &&
      previous.previewStream === next.previewStream &&
      previous.kind === next.kind &&
      previous.isSelected === next.isSelected &&
      previous.isFocusedLayout === next.isFocusedLayout &&
      previous.isCompact === next.isCompact &&
      previous.localAudioMuted === next.localAudioMuted &&
      previous.localScreenAudioMuted === next.localScreenAudioMuted &&
      previous.isWatchingScreen === next.isWatchingScreen &&
      previous.audioInputDevices === next.audioInputDevices &&
      previous.audioOutputDevices === next.audioOutputDevices &&
      previous.selectedAudioInputDeviceId === next.selectedAudioInputDeviceId &&
      previous.selectedAudioOutputDeviceId === next.selectedAudioOutputDeviceId
    );
  },
);
