import { useCallback, useState } from "react";
import { Dropdown, Tooltip, type MenuProps } from "antd";
import {
  AudioMutedOutlined,
  CheckOutlined,
  DownOutlined,
  LoadingOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import type { ScreenCaptureSourceDescriptor } from "@shared/desktop-api-types";
import { SCREEN_SHARE_QUALITY_OPTIONS } from "@/features/screen-share";
import {
  getLiveScreenShareControls,
  type LiveScreenShareControls,
  type ScreenShareFrameRate,
} from "../../../hooks/media/live-screen-share";

// Mirrors Ayarlar → Yayın Ayarları exactly. Two lists of framerates that drift
// apart is how a menu ends up offering a rate the capture path cannot honour.
const FRAME_RATE_OPTIONS: ScreenShareFrameRate[] = [15, 30, 60];

// Keeps unselected rows aligned with the selected one; antd reserves the icon
// slot per item, not per menu.
const checkmark = (selected: boolean) => {
  return selected ? <CheckOutlined /> : <span className="ct-stream-menu-check" />;
};

const describeSource = (source: ScreenCaptureSourceDescriptor): string => {
  return source.kind === "screen" && source.displayId
    ? `${source.name} • Ekran ${source.displayId}`
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

  const sourceItems: MenuProps["items"] = sources.length
    ? sources.map((source) => ({
        key: `source-${source.id}`,
        icon: checkmark(source.id === currentSourceId),
        label: describeSource(source),
        onClick: () => runChange((live) => live.changeSource(source.id)),
      }))
    : [{ key: "source-empty", label: "Kaynaklar yükleniyor...", disabled: true }];

  const items: MenuProps["items"] = [
    {
      // A toggle, not a submenu: there are two states and the row already says
      // which one it is in. Sits first because it is the only setting here that
      // changes what viewers HEAR rather than how the picture looks.
      key: "system-audio",
      icon: isSystemAudioOn ? <SoundOutlined /> : <AudioMutedOutlined />,
      label: isSystemAudioOn ? "Yayın Sesini Kapat" : "Yayın Sesini Aç",
      onClick: () => runChange((live) => live.setSystemAudio(!isSystemAudioOn)),
    },
    { type: "divider" },
    {
      key: "quality",
      label: "Kalite",
      children: SCREEN_SHARE_QUALITY_OPTIONS.map((option) => ({
        key: `quality-${option.id}`,
        icon: checkmark(option.id === currentQuality),
        label: `${option.label} • ${option.description}`,
        onClick: () => runChange((live) => live.changeQuality(option.id)),
      })),
    },
    {
      key: "framerate",
      label: "Kare Hızı",
      children: FRAME_RATE_OPTIONS.map((frameRate) => ({
        key: `framerate-${frameRate}`,
        icon: checkmark(frameRate === currentFrameRate),
        label: `${frameRate} FPS`,
        onClick: () => runChange((live) => live.changeFrameRate(frameRate)),
      })),
    },
    {
      key: "source",
      label: "Ekran Değiştir",
      children: sourceItems,
    },
  ];

  return (
    <Dropdown
      menu={{ items }}
      trigger={["click"]}
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
    </Dropdown>
  );
}
