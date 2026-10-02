import type { CSSProperties, ReactNode } from "react";
import { Avatar, Slider } from "antd";
import { getDisplayInitials, getUsernameHue } from "../../workspace-utils";

export interface MenuIdentity {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  /** One line under the name: where they are, or what the menu is for. */
  detail: string;
}

export interface MenuVolume {
  key: string;
  label: string;
  icon: ReactNode;
  value: number;
  muted?: boolean;
  onChange: (volumePercent: number) => void;
}

// The frame around a right-click menu about one person: who it is, then their
// volumes as sliders, then the menu's own rows. The name used to be a disabled
// heading row and each volume a heading row plus a slider row -- chrome paying
// full item padding, and a moderator about to press "Odadan At" in a crowded
// room had only "@username" in small caps to check whose menu it was.
export function ContextMenuPanel({
  identity,
  volumes = [],
  menu,
}: {
  identity: MenuIdentity;
  volumes?: MenuVolume[];
  menu: ReactNode;
}) {
  return (
    // The overlay is portalled, but React events still bubble along the
    // component tree -- into a lobby row that joins the room on click. A drag
    // on a slider must not end up there.
    <div className="ct-menu-panel" onClick={(event) => event.stopPropagation()}>
      <div className="ct-menu-identity">
        <Avatar
          size={34}
          src={identity.avatarUrl || undefined}
          style={{ "--ct-name-h": getUsernameHue(identity.userId) } as CSSProperties}
        >
          {getDisplayInitials(identity.name)}
        </Avatar>
        <div className="ct-menu-identity-text">
          <strong title={identity.name}>{identity.name}</strong>
          <span>{identity.detail}</span>
        </div>
      </div>

      {volumes.map((volume) => (
        <div key={volume.key} className="ct-menu-volume">
          <div className="ct-menu-volume-row">
            <span>
              {volume.icon}
              {volume.label}
            </span>
            <b>{volume.muted ? "susturuldu" : `%${volume.value}`}</b>
          </div>
          <Slider
            min={0}
            max={200}
            step={5}
            value={volume.value}
            onChange={volume.onChange}
            tooltip={{ formatter: (value) => `%${value}` }}
            aria-label={volume.label}
          />
        </div>
      ))}

      {menu}
    </div>
  );
}
