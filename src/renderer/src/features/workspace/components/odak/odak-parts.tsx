import type { CSSProperties, ReactNode } from "react";
import type { PresenceStatus, SelectablePresenceStatus } from "@shared/auth-contracts";
import type { WorkspaceSection } from "@/store/ui-store";
import { getDisplayInitials, getUserStatusLabel, hueStyle } from "../../workspace-utils";

/** The pieces the Odak rail and the Odak pages share: the line icons, the
    sections in rail order, the presence choices and the avatar. */

export const Icon = ({ children, size = 19 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const SpeakerIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </Icon>
);

export const UsersIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

export const GamepadIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <line x1="6" x2="10" y1="12" y2="12" />
    <line x1="8" x2="8" y1="10" y2="14" />
    <line x1="15" x2="15.01" y1="13" y2="13" />
    <line x1="18" x2="18.01" y1="11" y2="11" />
    <rect width="20" height="12" x="2" y="6" rx="2" />
  </Icon>
);

const GiftIcon = () => (
  <Icon>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 11 5 12 8c1-3 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5" />
  </Icon>
);

const SlidersIcon = () => (
  <Icon>
    <line x1="4" x2="4" y1="21" y2="14" />
    <line x1="4" x2="4" y1="10" y2="3" />
    <line x1="12" x2="12" y1="21" y2="12" />
    <line x1="12" x2="12" y1="8" y2="3" />
    <line x1="20" x2="20" y1="21" y2="16" />
    <line x1="20" x2="20" y1="12" y2="3" />
    <line x1="2" x2="6" y1="14" y2="14" />
    <line x1="10" x2="14" y1="8" y2="8" />
    <line x1="18" x2="22" y1="16" y2="16" />
  </Icon>
);

const ShieldIcon = () => (
  <Icon>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </Icon>
);

/** A list item's place in a staggered entrance: the stylesheet turns --i into
    a delay, capped at eight steps. */
export const staggerStyle = (index: number): CSSProperties =>
  ({ "--i": String(index) }) as CSSProperties;

export const SECTIONS: Array<{ id: WorkspaceSection; label: string; icon: ReactNode }> = [
  { id: "lobbies", label: "Lobiler", icon: <SpeakerIcon /> },
  { id: "users", label: "Arkadaşlar", icon: <UsersIcon /> },
  { id: "minigames", label: "Oyunlar", icon: <GamepadIcon /> },
  { id: "free-games", label: "Fırsatlar", icon: <GiftIcon /> },
  { id: "settings", label: "Ayarlar", icon: <SlidersIcon /> },
  { id: "admin", label: "Yönetim", icon: <ShieldIcon /> },
];

export const PRESENCE_OPTIONS: Array<{ value: SelectablePresenceStatus; label: string }> = [
  { value: "online", label: "Çevrimiçi" },
  { value: "idle", label: "Boşta" },
  { value: "dnd", label: "Rahatsız etmeyin" },
  { value: "offline", label: "Çevrimdışı görün" },
];

// One shape per status, so colour is never the only cue (F4.1): a solid dot,
// a crescent moon, a disc with a bar through it, a hollow ring. A 10-unit box
// drawn in currentColor; the holes show whatever is behind the glyph, which
// on an avatar is the ring's own colour.
const PRESENCE_SHAPES: Record<PresenceStatus, ReactNode> = {
  online: <circle cx="5" cy="5" r="5" />,
  idle: <path d="M5.3 0A5 5 0 1 1 0 5.3 3.75 3.75 0 0 0 5.3 0Z" />,
  dnd: (
    <path
      fillRule="evenodd"
      d="M5 0a5 5 0 1 1 0 10A5 5 0 0 1 5 0ZM3.25 3.75h3.5a1.25 1.25 0 0 1 0 2.5h-3.5a1.25 1.25 0 0 1 0-2.5Z"
    />
  ),
  offline: (
    <path
      fillRule="evenodd"
      d="M5 0a5 5 0 1 1 0 10A5 5 0 0 1 5 0Zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
    />
  ),
};

/** A presence glyph, sized by its container's class. Decorative: the badge
    around it, or the text beside it, says the status in words. */
export const PresenceGlyph = ({ status, className = "" }: { status: PresenceStatus; className?: string }) => (
  <svg className={`ct-presence-glyph ${status} ${className}`} viewBox="0 0 10 10" aria-hidden="true">
    {PRESENCE_SHAPES[status]}
  </svg>
);

/** What a badge says aloud: "offline" here is what others see, not the pick. */
export const presenceBadgeLabel = (status: PresenceStatus): string =>
  getUserStatusLabel(status !== "offline", status);

export function Avatar({
  userId,
  name,
  avatarUrl,
  presence,
  className,
}: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  presence?: PresenceStatus;
  className: string;
}) {
  return (
    <span className={`ct-odak-avatar ${className}`} style={hueStyle(userId)} aria-hidden="true">
      {avatarUrl ? <img src={avatarUrl} alt="" /> : getDisplayInitials(name)}
      {presence && (
        <span className="ct-odak-presence" role="img" aria-label={presenceBadgeLabel(presence)}>
          <PresenceGlyph status={presence} />
        </span>
      )}
    </span>
  );
}
