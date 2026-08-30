import type { ReactNode } from "react";
import {
  IconAmmo,
  IconBarracks,
  IconChevronLeft,
  IconCredits,
  IconMap,
  IconMissions,
  IconStar,
  IconSupplies,
  IconWeapon,
} from "./icons";

export type TabId = "map" | "loadout" | "barracks" | "missions";

interface PhoneFrameProps {
  children: ReactNode;
}

export function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="ct-gl-stage">
      <div className="ct-gl-phone">
        <div className="ct-gl-notch" aria-hidden="true" />
        <div className="ct-gl-screen">{children}</div>
      </div>
    </div>
  );
}

export function compactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1000)}K`;
  }
  if (value >= 1_000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return `${Math.round(value)}`;
}

interface WalletProps {
  supplies: number;
  ammo: number;
  credits: number;
}

export function Wallet({ supplies, ammo, credits }: WalletProps) {
  return (
    <div className="ct-gl-wallet">
      <span className="ct-gl-coin" data-kind="supplies">
        <span className="ct-gl-coin-badge">
          <IconSupplies className="ct-gl-icon" />
        </span>
        <span className="ct-gl-coin-value">{compactNumber(supplies)}</span>
      </span>
      <span className="ct-gl-coin" data-kind="ammo">
        <span className="ct-gl-coin-badge">
          <IconAmmo className="ct-gl-icon" />
        </span>
        <span className="ct-gl-coin-value">{compactNumber(ammo)}</span>
      </span>
      <span className="ct-gl-coin" data-kind="credits">
        <span className="ct-gl-coin-badge">
          <IconCredits className="ct-gl-icon" />
        </span>
        <span className="ct-gl-coin-value">{compactNumber(credits)}</span>
      </span>
    </div>
  );
}

interface TopBarProps {
  rank: string;
  level: number;
  ratio: number;
  supplies: number;
  ammo: number;
  credits: number;
  onBack?: () => void;
}

export function TopBar({
  rank,
  level,
  ratio,
  supplies,
  ammo,
  credits,
  onBack,
}: TopBarProps) {
  return (
    <header className="ct-gl-topbar">
      {onBack ? (
        <button type="button" className="ct-gl-back" onClick={onBack} aria-label="Geri">
          <IconChevronLeft className="ct-gl-icon" />
        </button>
      ) : (
        <span className="ct-gl-crest" title={rank}>
          <span className="ct-gl-crest-level">{level + 1}</span>
          <span className="ct-gl-crest-ring" style={{ "--gl-ratio": ratio } as React.CSSProperties} />
        </span>
      )}
      <Wallet supplies={supplies} ammo={ammo} credits={credits} />
    </header>
  );
}

interface GameButtonProps {
  children: ReactNode;
  onClick: () => void;
  tone?: "primary" | "ghost" | "danger" | "gold";
  wide?: boolean;
  disabled?: boolean;
}

export function GameButton({
  children,
  onClick,
  tone = "ghost",
  wide,
  disabled,
}: GameButtonProps) {
  return (
    <button
      type="button"
      className="ct-gl-btn"
      data-tone={tone}
      data-wide={wide ? "yes" : "no"}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="ct-gl-btn-face">{children}</span>
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { id: T; label: string }[];
  onSelect: (id: T) => void;
}

export function Segmented<T extends string>({ value, options, onSelect }: SegmentedProps<T>) {
  return (
    <div className="ct-gl-segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={option.id === value}
          className="ct-gl-segment"
          data-active={option.id === value ? "yes" : "no"}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface TabBarProps {
  active: TabId;
  onSelect: (tab: TabId) => void;
}

const TABS: readonly { id: TabId; label: string; Icon: typeof IconMap }[] = [
  { id: "map", label: "Harita", Icon: IconMap },
  { id: "loadout", label: "Teçhizat", Icon: IconWeapon },
  { id: "barracks", label: "Kışla", Icon: IconBarracks },
  { id: "missions", label: "Görev", Icon: IconMissions },
];

export function TabBar({ active, onSelect }: TabBarProps) {
  return (
    <nav className="ct-gl-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="ct-gl-tab"
          data-active={tab.id === active ? "yes" : "no"}
          onClick={() => onSelect(tab.id)}
        >
          <tab.Icon className="ct-gl-tab-icon" />
          <span className="ct-gl-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

interface StarsProps {
  filled: number;
  size?: "sm" | "md" | "lg";
}

export function Stars({ filled, size = "sm" }: StarsProps) {
  return (
    <span className="ct-gl-stars" data-size={size}>
      {[1, 2, 3].map((slot) => (
        <IconStar
          key={slot}
          className={slot <= filled ? "ct-gl-star-on" : "ct-gl-star-off"}
        />
      ))}
    </span>
  );
}

interface SectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Section({ title, action, children }: SectionProps) {
  return (
    <section className="ct-gl-section">
      <div className="ct-gl-section-head">
        <span className="ct-gl-section-title">{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

interface MeterProps {
  ratio: number;
  tone?: "blue" | "green" | "gold";
}

export function Meter({ ratio, tone = "blue" }: MeterProps) {
  return (
    <span className="ct-gl-meter" data-tone={tone}>
      <span
        className="ct-gl-meter-fill"
        style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
      />
    </span>
  );
}
