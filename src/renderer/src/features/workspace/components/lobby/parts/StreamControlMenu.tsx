import { useCallback, useState } from "react";
import { Tooltip } from "antd";
import { DownOutlined, LoadingOutlined } from "@ant-design/icons";
import type { ScreenCaptureSourceDescriptor } from "@shared/desktop-api-types";
import { SCREEN_SHARE_QUALITY_OPTIONS } from "@/features/screen-share";
import { OdakMenu, type OdakMenuEntry } from "@/ui/odak-menu";
import {
  getLiveScreenShareControls,
  type LiveScreenShareControls,
  type ScreenShareFrameRate,
} from "../../../hooks/media/live-screen-share";

// Mirrors Ayarlar → Yayın Ayarları exactly. Two lists of framerates that drift
// apart is how a menu ends up offering a rate the capture path cannot honour.
const FRAME_RATE_OPTIONS: ScreenShareFrameRate[] = [15, 30, 60];

const describeSource = (source: ScreenCaptureSourceDescriptor): string => {
  return source.kind === "screen" && source.displayId
    ? `${source.name} · Ekran ${source.displayId}`
    : source.name;
};

/**
 * Settings for a screen share that is already running: quality, framerate and
 * which screen. Sits next to the stop button so ending the share and adjusting
 * it are no longer the same click.
 *
 * Renders nothing until the media hook has registered its controls — there is
 * nothing to adjust before a share exists.
 */
export function StreamControlMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [sources, setSources] = useState<ScreenCaptureSourceDescriptor[]>([]);
  const controls = getLiveScreenShareControls();

  const handleOpenChange = useCallback((open: boolean): void => {
    setIsOpen(open);
    if (!open) return;

    // Windows come and go; a list cached from the last time the menu was opened
    // would offer sources that no longer exist.
    void getLiveScreenShareControls()?.listSources().then(setSources);
  }, []);

  // The registration is refreshed whenever the media hook's callbacks change,
  // so the slot is read at click time rather than captured at render time.
  const runChange = useCallback(
    (apply: (live: LiveScreenShareControls) => Promise<void>): void => {
      const live = getLiveScreenShareControls();
      if (!live) return;

      setIsOpen(false);
      setIsBusy(true);
      void apply(live).finally(() => setIsBusy(false));
    },
    [],
  );

  if (!controls) {
    return null;
  }

  const currentFrameRate = controls.getFrameRate();
  const currentQuality = controls.getQuality();
  const currentSourceId = controls.getSourceId();
  const isSystemAudioOn = controls.isSystemAudioOn();

  // The current choice of each list carries the ✓, on the right.
  const sourceItems: OdakMenuEntry[] = sources.length
    ? sources.map((source) => ({
        key: `source-${source.id}`,
        label: describeSource(source),
        checked: source.id === currentSourceId,
        onSelect: () => runChange((live) => live.changeSource(source.id)),
      }))
    : [{ key: "source-empty", label: "Kaynaklar yükleniyor…", disabled: true, onSelect: () => undefined }];

  const items: OdakMenuEntry[] = [
    {
      // A switch: two states, and the row says which one it is in. First,
      // because it is the only setting here that changes what viewers HEAR
      // rather than how the picture looks. Applying it closes the menu, as
      // every change here does: the button spins until it lands.
      type: "toggle",
      key: "system-audio",
      icon: "volume",
      label: "Yayın sesi",
      description: "Bilgisayarının sesi de yayına gider",
      on: isSystemAudioOn,
      onChange: (on) => runChange((live) => live.setSystemAudio(on)),
    },
    { type: "divider" },
    {
      // The value it is set to, on the right of the row: the menu used to say
      // only what could be changed, never what it was.
      type: "submenu",
      key: "quality",
      icon: "gauge",
      label: "Kalite",
      value: SCREEN_SHARE_QUALITY_OPTIONS.find((option) => option.id === currentQuality)?.label,
      items: SCREEN_SHARE_QUALITY_OPTIONS.map((option) => ({
        key: `quality-${option.id}`,
        label: option.label,
        description: option.description.replace("•", "·"),
        checked: option.id === currentQuality,
        onSelect: () => runChange((live) => live.changeQuality(option.id)),
      })),
    },
    {
      type: "submenu",
      key: "framerate",
      icon: "zap",
      label: "Kare hızı",
      value: `${currentFrameRate} FPS`,
      items: FRAME_RATE_OPTIONS.map((frameRate) => ({
        key: `framerate-${frameRate}`,
        label: `${frameRate} FPS`,
        checked: frameRate === currentFrameRate,
        onSelect: () => runChange((live) => live.changeFrameRate(frameRate)),
      })),
    },
    {
      type: "submenu",
      key: "source",
      icon: "monitor",
      label: "Ekranı değiştir",
      items: sourceItems,
    },
  ];

  return (
    <OdakMenu
      items={items}
      trigger="click"
      placement="top"
      open={isOpen}
      onOpenChange={handleOpenChange}
      disabled={isBusy}
    >
      <Tooltip title={isBusy ? "Yayın ayarı uygulanıyor" : "Yayın Ayarları"}>
        <button
          type="button"
          className="ct-stream-menu-btn"
          aria-label="Yayın ayarları"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-busy={isBusy}
          disabled={isBusy}
        >
          {/* Re-capturing a desktop takes up to a second. A dead-looking button
              for that long reads as a broken menu, and the stop button beside it
              stays enabled on purpose — stopping cancels the swap in flight. */}
          {isBusy ? <LoadingOutlined /> : <DownOutlined />}
        </button>
      </Tooltip>
    </OdakMenu>
  );
}
