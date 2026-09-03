import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import {
  CaretRightFilled,
  DesktopOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  PauseOutlined,
  SoundOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from "@ant-design/icons";
import { Dropdown, type MenuProps } from "antd";
import { formatWatchTime, livePosition } from "@shared/watch";
import {
  readWatchMuted,
  readWatchVolumePercent,
  saveWatchMuted,
  saveWatchVolumePercent,
} from "@/store/watch-volume";
import type { WatchRoom } from "./use-watch-room";
import { WatchPlayer } from "./watch-player";

interface WatchStageTileProps {
  room: WatchRoom;
  /**
   * Whether THIS viewer has opened the video.
   *
   * Opt-in, exactly like a screen share: the tile is on everybody's stage the
   * moment somebody starts a session, but nothing is fetched or decoded until
   * the viewer says so. Held by the lobby panel rather than here — see the
   * comment at its declaration for why a tile cannot own it.
   */
  optedIn: boolean;
  onOptIn: () => void;
  onOptOut: () => void;
  isFocusedLayout?: boolean;
  isCompact?: boolean;
  isSelected?: boolean;
  onActivate?: (event: MouseEvent<HTMLElement>) => void;
}

const SKIP_SECONDS = 10;

/**
 * The keys a range input moves on.
 *
 * Listed rather than treating any key as a drag: Tab and Shift are pressed on
 * this control all the time without moving it, and committing on those sent a
 * seek to the position the room was already at — a real state change fanned out
 * to everybody in the room for a keystroke that changed nothing.
 */
const SCRUB_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/**
 * The room's video on the lobby stage, as one of the tiles.
 *
 * It carries `ct-lobby-participant-tile` and takes an ordinary stage slot, so
 * the fit, the 16:9 box, the focused layout and the thumbnail rail all apply to
 * it with no cases of their own — a shared video is presented exactly like the
 * screen share it stands in for, rather than as a fixed slab above the stage
 * squeezing everyone else into the remaining height.
 *
 * Every transport control here — the bar, the right-click menu — goes to the
 * SERVER rather than to the local player. That is what lets this behave like an
 * ordinary video while staying in step: a pause is a pause for the room, and
 * this player follows the room exactly as everybody else's does.
 *
 * Volume and mute are the deliberate exception. They never leave this machine,
 * like the volume on somebody's screen share, and they are remembered between
 * sessions.
 *
 * ponytail: taking a slot means the tile is re-parented when the stage switches
 * layouts, and re-parenting an iframe reloads it — so focusing the video costs
 * a short reload before the drift loop puts it back in step. Acceptable because
 * the position is server-authoritative and the resolve is cached (see
 * RESOLVE_CACHE_MS). The upgrade, if that reload ever reads as a fault, is to
 * keep one player mounted off-stage and position it over the slot's measured
 * box instead of putting it inside the slot.
 */
export function WatchStageTile({
  room,
  optedIn,
  onOptIn,
  onOptOut,
  isFocusedLayout = false,
  isCompact = false,
  isSelected = false,
  onActivate,
}: WatchStageTileProps): JSX.Element | null {
  const [muted, setMuted] = useState(readWatchMuted);
  const [volume, setVolume] = useState(readWatchVolumePercent);
  // Redrawn once a second so the clock and the bar move; the position itself is
  // always computed from the server's clock, never stored.
  const [, setTick] = useState(0);
  const [scrubValue, setScrubValue] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrubbingRef = useRef(false);
  // The whole tile, not just the picture: the transport bar and the title are
  // siblings of the stage, so presenting the stage alone put the film on screen
  // with no way to pause it.
  const tileRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => saveWatchMuted(muted), [muted]);
  useEffect(() => saveWatchVolumePercent(volume), [volume]);

  // Read back off the DOM rather than assumed, for the reason the participant
  // tile documents: this element can be unmounted while it still owns
  // fullscreen — the stage re-parents it on every layout switch — and a flag
  // set optimistically would stay stuck at true on the replacement.
  useEffect(() => {
    const syncPresentation = (): void => {
      setIsFullscreen(
        tileRef.current !== null && document.fullscreenElement === tileRef.current,
      );
    };

    syncPresentation();
    document.addEventListener("fullscreenchange", syncPresentation);
    return () => {
      document.removeEventListener("fullscreenchange", syncPresentation);
      setIsFullscreen(false);
    };
  }, [optedIn]);

  const { state, canControl, isSending } = room;
  const video = state.video;
  const duration = video?.durationSeconds ?? 0;
  const livePos = livePosition(state, room.skewMs);
  const position = scrubbingRef.current ? scrubValue : livePos;

  const toggle = useCallback(() => {
    if (!canControl || isSending) {
      return;
    }
    if (state.playing) {
      void room.pause(livePos);
    } else {
      void room.play(livePos);
    }
  }, [canControl, isSending, livePos, room, state.playing]);

  const skip = useCallback(
    (delta: number) => {
      const bounded = duration > 0 ? Math.min(duration, livePos + delta) : livePos + delta;
      void room.seek(Math.max(0, bounded));
    },
    [duration, livePos, room],
  );

  // Ends a drag, sending the seek only if the pointer actually finished on the
  // control. Wired to cancellation as well as to release: an interrupted drag —
  // the window losing focus, an OS gesture — used to leave scrubbingRef true, so
  // the bar and the clock froze on the abandoned value for the rest of the
  // session while never sending anything.
  const endScrub = useCallback(
    (commit: boolean) => {
      if (!scrubbingRef.current) {
        return;
      }
      scrubbingRef.current = false;
      if (commit) {
        void room.seek(scrubValue);
      }
    },
    [room, scrubValue],
  );

  const toggleFullscreen = useCallback((event?: MouseEvent) => {
    event?.stopPropagation();
    const tile = tileRef.current;
    if (!tile) {
      return;
    }
    if (document.fullscreenElement === tile) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    void tile.requestFullscreen().catch(() => {});
  }, []);

  if (!state.active || !video) {
    return null;
  }

  const menuItems: MenuProps["items"] = [
    ...(canControl
      ? [
          {
            key: "toggle",
            icon: state.playing ? <PauseOutlined /> : <CaretRightFilled />,
            label: state.playing ? "Duraklat" : "Oynat",
            disabled: isSending,
            onClick: toggle,
          },
          {
            key: "back",
            icon: <StepBackwardOutlined />,
            label: `${SKIP_SECONDS} sn geri`,
            disabled: isSending,
            onClick: () => skip(-SKIP_SECONDS),
          },
          {
            key: "forward",
            icon: <StepForwardOutlined />,
            label: `${SKIP_SECONDS} sn ileri`,
            disabled: isSending,
            onClick: () => skip(SKIP_SECONDS),
          },
          { type: "divider" as const },
        ]
      : [{ key: "no-control", label: "Yayını başlatan yönetiyor", disabled: true }]),
    {
      key: "watching",
      icon: <DesktopOutlined />,
      label: optedIn ? "İzlemeyi bırak" : "Yayını izle",
      onClick: optedIn ? onOptOut : onOptIn,
    },
    {
      key: "mute",
      icon: <SoundOutlined />,
      label: muted ? "Sesi aç" : "Sustur",
      disabled: !optedIn,
      onClick: () => setMuted((value) => !value),
    },
    ...(canControl
      ? [
          { type: "divider" as const },
          {
            key: "stop",
            label: "Yayını bitir",
            danger: true,
            disabled: isSending,
            onClick: () => void room.stop(),
          },
        ]
      : []),
  ];

  const title = video.title || "Birlikte İzle";

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
      <article
        className={[
          "ct-lobby-participant-tile",
          "ct-watch-tile",
          "screen-share",
          isSelected ? "selected" : "",
          isFocusedLayout ? "focused" : "",
          // Not compact while it fills the screen, whatever slot it was in when
          // the button was pressed. The rail thumbnail hides the transport bar
          // and the title — correct at 200px, and a film with no visible way to
          // pause it at full size. Dropping the class beats fighting the
          // specificity tie between .compact and :fullscreen.
          isCompact && !isFullscreen ? "compact" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={tileRef}
        aria-label={`Birlikte izleme: ${title}`}
        aria-pressed={isSelected ? true : undefined}
        // Drives the transport bar's visibility from CSS. On the root because
        // the bar is a sibling of the stage the surface lives in, so a sibling
        // selector on the surface itself matched nothing.
        data-idle={state.playing ? undefined : "true"}
        onClick={onActivate}
        onDoubleClick={optedIn ? () => toggleFullscreen() : undefined}
        title="Sol tık: büyüt / Çift tık: tam ekran / Sağ tık: seçenekler"
      >
        <div className="ct-watch-tile__stage">
          {optedIn ? (
            <>
              <WatchPlayer room={room} muted={muted} volume={volume} />

              {/* Sits over the frame and takes every pointer event on the
                  picture. Without it a click reaches the embedded player, which
                  pauses ITSELF while the room stays playing — so the drift loop
                  keeps dragging it forward and the video stutters along with no
                  sound. Right-click is the same story: the menu underneath
                  would be the embed's, not this one's.

                  It forwards the click on rather than swallowing it, so the
                  tile behaves like every other one on the stage: a click
                  focuses. Play and pause live on the bar and in the menu, which
                  is what keeps a stray click from pausing the whole room. */}
              <button
                type="button"
                className="ct-watch-tile__surface"
                aria-label={isSelected ? "Küçült" : "Büyüt"}
                data-idle={state.playing ? undefined : "true"}
                onClick={onActivate}
                onDoubleClick={() => toggleFullscreen()}
              >
                {!state.playing ? (
                  <span className="ct-watch-tile__badge">
                    <PauseOutlined />
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                className={
                  isFullscreen
                    ? "ct-lobby-tile-fullscreen-exit-btn"
                    : "ct-lobby-tile-fullscreen-btn"
                }
                onClick={toggleFullscreen}
                title={isFullscreen ? "Tam Ekrandan Çık" : "Tam Ekran Yap"}
              >
                {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              </button>
            </>
          ) : (
            /* Nothing is loaded until this is pressed — no frame, no resolve, no
               bytes — exactly as a screen share subscribes nothing until you ask
               for it. */
            <div className="ct-lobby-tile-watch-prompt">
              <DesktopOutlined />
              <span className="ct-lobby-tile-watch-title">
                {video.startedByName} bir video açtı
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOptIn();
                }}
                className="ct-lobby-tile-watch-btn"
              >
                Videoyu izle
              </button>
              <span className="ct-lobby-tile-watch-hint">{title}</span>
            </div>
          )}
        </div>

        <div className="ct-watch-tile__meta">
          <span className="ct-watch-tile__name" title={title}>
            {title}
          </span>
          <span className="ct-watch-tile__starter">{video.startedByName} başlattı</span>
        </div>

        {optedIn ? (
          <div
            className="ct-watch-tile__bar"
            // The bar is chrome on a tile whose click focuses it. Without this,
            // pressing pause also focused or unfocused the video underneath.
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="ct-watch-tile__btn"
              disabled={!canControl || isSending}
              title={canControl ? undefined : "Yayını başlatan yönetiyor"}
              onClick={toggle}
            >
              {state.playing ? <PauseOutlined /> : <CaretRightFilled />}
            </button>

            <input
              type="range"
              className="ct-watch-tile__scrub"
              min={0}
              max={duration > 0 ? duration : 1}
              step={0.5}
              value={Math.min(position, duration > 0 ? duration : 1)}
              disabled={!canControl || duration <= 0}
              aria-label="Videoda ilerle"
              title={
                duration > 0
                  ? undefined
                  : "Süre bilinene kadar ileri sarılamaz — oynatıcı yüklendiğinde açılır"
              }
              onPointerDown={() => {
                scrubbingRef.current = true;
                setScrubValue(livePos);
              }}
              onChange={(event) => setScrubValue(Number(event.target.value))}
              onPointerUp={() => endScrub(true)}
              onPointerCancel={() => endScrub(false)}
              onLostPointerCapture={() => endScrub(false)}
              // A range responds to the arrow, Home and End keys, which fire
              // change without ever firing a pointer event. Without this the
              // thumb moved, no seek was sent, and the next second's redraw
              // snapped it back: seeking by keyboard silently did nothing.
              onKeyDown={(event) => {
                if (!SCRUB_KEYS.has(event.key) || scrubbingRef.current) {
                  return;
                }
                scrubbingRef.current = true;
                setScrubValue(livePos);
              }}
              onKeyUp={(event) => {
                if (SCRUB_KEYS.has(event.key)) {
                  endScrub(true);
                }
              }}
              onBlur={() => endScrub(false)}
            />

            <span className="ct-watch-tile__time">
              {formatWatchTime(position)}
              {duration > 0 ? ` / ${formatWatchTime(duration)}` : ""}
            </span>

            <button
              type="button"
              className="ct-watch-tile__btn"
              onClick={() => setMuted((value) => !value)}
              title={muted ? "Sesi aç" : "Sustur"}
              aria-label={muted ? "Sesi aç" : "Sustur"}
              data-off={muted ? "true" : undefined}
            >
              <SoundOutlined />
            </button>

            <input
              type="range"
              className="ct-watch-tile__volume"
              min={0}
              max={100}
              value={volume}
              aria-label="Ses seviyesi"
              title="Ses seviyesi — yalnızca sende"
              onChange={(event) => {
                setVolume(Number(event.target.value));
                setMuted(false);
              }}
            />
          </div>
        ) : null}
      </article>
    </Dropdown>
  );
}
