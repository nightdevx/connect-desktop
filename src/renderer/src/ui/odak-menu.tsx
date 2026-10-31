import { Dropdown, type DropdownProps, type MenuProps } from "antd";
import {
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { VolumeSlider } from "./volume-slider";

/**
 * The one menu every right-click, ⋯ and drop-down menu in the app is drawn
 * with (ODAK-TASARIM-PLANI.md F10.3; scratchpad katman-tasarim-spec.md §1).
 *
 * antd's Dropdown keeps the trigger, the placement and its flips, the arrow
 * keys, submenus and Esc. This turns a small schema into antd's `menu.items`
 * with the Odak row markup, and adds what antd has no word for: a switch that
 * leaves the menu open, a volume slider and a strip of quick reactions as
 * rows, Space to choose, and a letter to jump. Styles: odak-katman-menu.css.
 */

// 16px line icons, Lucide's paths, one set for every menu.
const PATHS = {
  idcard: (
    <>
      <path d="M16 10h2" />
      <path d="M16 14h2" />
      <path d="M6.17 15a3 3 0 0 1 5.66 0" />
      <circle cx="9" cy="11" r="2" />
      <rect x="2" y="5" width="20" height="14" rx="2" />
    </>
  ),
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  volume: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </>
  ),
  volumeX: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M22 9l-6 6" />
      <path d="M16 9l6 6" />
    </>
  ),
  mic: (
    <>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </>
  ),
  micOff: (
    <>
      <path d="M2 2l20 20" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M12 19v3" />
    </>
  ),
  headphones: (
    <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  // The soundboard, the music dialog and Oda ayarları (0.3.1 F3).
  waveform: (
    <path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2" />
  ),
  hand: (
    <>
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  laugh: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </>
  ),
  frown: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </>
  ),
  drum: (
    <>
      <path d="m2 2 8 8" />
      <path d="m22 2-8 8" />
      <ellipse cx="12" cy="9" rx="10" ry="5" />
      <path d="M7 13.4v7.9" />
      <path d="M12 14v8" />
      <path d="M17 13.4v7.9" />
      <path d="M2 9v8a10 5 0 0 0 20 0V9" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  sparkles: (
    <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" />
  ),
  upload: (
    <>
      <path d="M12 3v12" />
      <path d="m17 8-5-5-5 5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  skip: (
    <>
      <path d="M5 4 15 12 5 20Z" />
      <path d="M19 5v14" />
    </>
  ),
  listX: (
    <>
      <path d="M11 12H3" />
      <path d="M16 6H3" />
      <path d="M16 18H3" />
      <path d="m19 10-4 4" />
      <path d="m15 10 4 4" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
  loader: <path d="M21 12a9 9 0 1 1-6.22-8.56" />,
  lock: (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  shield: (
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  login: (
    <>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="m10 17 5-5-5-5" />
      <path d="M15 12H3" />
    </>
  ),
  move: (
    <>
      <path d="m16 3 4 4-4 4" />
      <path d="M20 7H4" />
      <path d="m8 21-4-4 4-4" />
      <path d="M4 17h16" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  userMinus: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 11h-6" />
    </>
  ),
  userPlus: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </>
  ),
  reply: (
    <>
      <path d="m9 14-5-5 5-5" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </>
  ),
  pencil: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </>
  ),
  sliders: (
    <>
      <path d="M21 4h-7" />
      <path d="M10 4H3" />
      <path d="M21 12h-9" />
      <path d="M8 12H3" />
      <path d="M21 20h-5" />
      <path d="M12 20H3" />
      <path d="M14 2v4" />
      <path d="M8 10v4" />
      <path d="M16 18v4" />
    </>
  ),
  monitor: (
    <>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </>
  ),
  video: (
    <>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  external: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  play: <path d="M6 3 20 12 6 21Z" />,
  pause: (
    <>
      <rect x="14" y="4" width="4" height="16" rx="1" />
      <rect x="6" y="4" width="4" height="16" rx="1" />
    </>
  ),
  back: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  forward: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  stop: <rect width="14" height="14" x="5" y="5" rx="2" />,
  gauge: (
    <>
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </>
  ),
  zap: (
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  ),
  bellOff: (
    <>
      <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
      <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <path d="m2 2 20 20" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type OdakMenuIcon = keyof typeof PATHS;

export function MenuIcon({
  name,
  size = 16,
  stroke = 1.75,
}: {
  name: OdakMenuIcon;
  size?: number;
  stroke?: number;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** A row's leading mark: one of the icons, or anything drawn (a presence dot). */
type Lead = OdakMenuIcon | ReactElement;

/** Set to the reason when the row cannot be used: it is shown on the row. */
type Disabled = boolean | string;

export interface OdakMenuItem {
  type?: "item";
  key: string;
  icon?: Lead;
  /** A verb, sentence case. */
  label: string;
  /** One line under an option whose effect is not obvious. */
  description?: string;
  /** Faint, on the right: "@can", the room's name. */
  value?: ReactNode;
  /** Mono key caps on the right: ["Ctrl", "⇧", "M"]. */
  shortcut?: string[];
  /** The current one of a single choice: a ✓ on the right, nothing else. */
  checked?: boolean;
  danger?: boolean;
  disabled?: Disabled;
  /** Opens a window, so the label ends in "…". */
  opensDialog?: boolean;
  /** Gets the chosen row, for whatever opens beside it (a profile card). */
  onSelect: (row: HTMLElement) => void;
}

/** A switch: the label stays put and the menu stays open. */
export interface OdakMenuToggle {
  type: "toggle";
  key: string;
  icon?: Lead;
  label: string;
  description?: string;
  on: boolean;
  disabled?: Disabled;
  onChange: (on: boolean) => void;
}

export interface OdakMenuSubmenu {
  type: "submenu";
  key: string;
  icon?: Lead;
  label: string;
  /** The value it is set to now, on the right before the ›. */
  value?: ReactNode;
  danger?: boolean;
  disabled?: Disabled;
  /** A small-caps question over the choices: "Ne kadar süre?". */
  title?: string;
  /** A line under them: what the choice will do. */
  footer?: string;
  items: OdakMenuEntry[];
}

export interface OdakMenuGroup {
  type: "group";
  key: string;
  title?: string;
  /** On the right of the title: who it affects ("yalnız senin için"). */
  hint?: string;
  icon?: OdakMenuIcon;
  /** A red block: what affects everybody. Always last. */
  danger?: boolean;
  items: OdakMenuEntry[];
}

/** A volume as a row: 0–200 with a notch at 100. ←→ move it 1 at a time. */
export interface OdakMenuSlider {
  type: "slider";
  key: string;
  icon?: OdakMenuIcon;
  label: string;
  value: number;
  /** In place of the percentage, e.g. "susturuldu". */
  status?: string;
  onChange: (value: number) => void;
}

/** A row of one-tap choices: the quick reactions. Each closes the menu. */
export interface OdakMenuStrip {
  type: "strip";
  key: string;
  items: Array<{ key: string; label: ReactNode; ariaLabel: string; onSelect: () => void }>;
}

export type OdakMenuEntry =
  | OdakMenuItem
  | OdakMenuToggle
  | OdakMenuSubmenu
  | OdakMenuGroup
  | OdakMenuSlider
  | OdakMenuStrip
  | { type: "divider"; key?: string }
  | false
  | null
  | undefined;

const SLIDER_MAX = 200;
const SLIDER_STEP = 1;

const leadNode = (lead: Lead | undefined): ReactNode =>
  lead === undefined ? null : (
    <span className="ct-menu-icon">
      {typeof lead === "string" ? <MenuIcon name={lead} /> : lead}
    </span>
  );

const reasonOf = (disabled: Disabled | undefined): string | undefined =>
  typeof disabled === "string" && disabled ? disabled : undefined;

function Row({
  lead,
  label,
  description,
  tail,
}: {
  lead?: Lead;
  label: string;
  description?: string;
  tail?: ReactNode;
}): JSX.Element {
  return (
    <span className="ct-menu-row">
      {leadNode(lead)}
      <span className="ct-menu-text">
        <span className="ct-menu-label">{label}</span>
        {description && <span className="ct-menu-desc">{description}</span>}
      </span>
      {tail}
    </span>
  );
}

const Check = (): JSX.Element => (
  <span className="ct-menu-check">
    <MenuIcon name="check" stroke={2.2} />
  </span>
);

function MenuSlider({ entry }: { entry: OdakMenuSlider }): JSX.Element {
  return (
    <span className="ct-menu-slider-body">
      <Row
        lead={entry.icon}
        label={entry.label}
        tail={<span className="ct-menu-slider-value">{entry.status ?? `%${entry.value}`}</span>}
      />
      {/* Not a tab stop: the row is the keyboard's place (←→ move it), the
          thumb is the pointer's. */}
      <VolumeSlider
        className="ct-menu-range"
        max={SLIDER_MAX}
        value={entry.value}
        tabIndex={-1}
        label={entry.label}
        onChange={entry.onChange}
      />
      <span className="ct-menu-scale" aria-hidden="true">
        <span>0</span>
        <span>100</span>
        <span>200</span>
      </span>
    </span>
  );
}

interface Built {
  items: NonNullable<MenuProps["items"]>;
  /** Rows whose choice leaves the menu open: switches, sliders. */
  keepOpen: Set<string>;
  sliders: Map<string, OdakMenuSlider>;
}

// antd's item types do not list `role` and the aria attributes, but rc-menu
// passes both through to the <li>. Built loosely, typed once at the end.
type LooseItem = Record<string, unknown>;

function build(entries: OdakMenuEntry[]): Built {
  const keepOpen = new Set<string>();
  const sliders = new Map<string, OdakMenuSlider>();

  const convert = (list: OdakMenuEntry[], topLevel: boolean): LooseItem[] => {
    let order = 0;
    const out: LooseItem[] = [];
    for (const entry of list) {
      if (!entry) {
        continue;
      }
      // Rows step in one after another as the menu opens (12 ms apart).
      const stagger = topLevel ? { style: { "--i": order++ } as CSSProperties } : {};

      if (entry.type === "divider") {
        out.push({ type: "divider", ...stagger });
        continue;
      }

      if (entry.type === "group") {
        out.push({
          type: "group",
          key: entry.key,
          className: `ct-menu-group${entry.danger ? " ct-menu-danger" : ""}`,
          label: entry.title ? (
            <span className="ct-menu-group-title">
              {entry.icon && <MenuIcon name={entry.icon} size={12} />}
              <span className="ct-menu-group-name">{entry.title}</span>
              {entry.hint && <span className="ct-menu-group-hint">{entry.hint}</span>}
            </span>
          ) : undefined,
          children: convert(entry.items, false),
          ...stagger,
        });
        continue;
      }

      if (entry.type === "strip") {
        out.push({
          type: "group",
          key: entry.key,
          className: "ct-menu-strip",
          children: entry.items.map((choice) => ({
            key: `${entry.key}-${choice.key}`,
            label: <span className="ct-menu-strip-choice">{choice.label}</span>,
            "aria-label": choice.ariaLabel,
            onClick: choice.onSelect,
          })),
          ...stagger,
        });
        continue;
      }

      if (entry.type === "slider") {
        keepOpen.add(entry.key);
        sliders.set(entry.key, entry);
        out.push({
          key: entry.key,
          className: "ct-menu-slider",
          "data-slider": entry.key,
          label: <MenuSlider entry={entry} />,
          ...stagger,
        });
        continue;
      }

      if (entry.type === "submenu") {
        const reason = reasonOf(entry.disabled);
        out.push({
          key: entry.key,
          className: entry.danger ? "ct-menu-danger" : undefined,
          disabled: Boolean(entry.disabled),
          label: (
            <Row
              lead={entry.icon}
              label={entry.label}
              tail={
                (reason ?? entry.value) !== undefined && (
                  <span className="ct-menu-value">{reason ?? entry.value}</span>
                )
              }
            />
          ),
          popupClassName: "ct-menu-sub",
          popupRender: (node: ReactNode) => (
            <div className="ct-menu-panel ct-menu-sub-panel">
              {entry.title && (
                <div className="ct-menu-group-title">
                  <span className="ct-menu-group-name">{entry.title}</span>
                </div>
              )}
              {node}
              {entry.footer && <p className="ct-menu-sub-footer">{entry.footer}</p>}
            </div>
          ),
          children: convert(entry.items, false),
          ...stagger,
        });
        continue;
      }

      const reason = reasonOf(entry.disabled);
      if (entry.type === "toggle") {
        keepOpen.add(entry.key);
        const toggle = entry;
        out.push({
          key: toggle.key,
          role: "menuitemcheckbox",
          "aria-checked": toggle.on,
          disabled: Boolean(toggle.disabled),
          label: (
            <Row
              lead={toggle.icon}
              label={toggle.label}
              description={toggle.description}
              tail={
                <>
                  {reason && <span className="ct-menu-value">{reason}</span>}
                  <span className={`ct-menu-switch${toggle.on ? " on" : ""}`} aria-hidden="true" />
                </>
              }
            />
          ),
          onClick: () => toggle.onChange(!toggle.on),
          ...stagger,
        });
        continue;
      }

      const item = entry;
      out.push({
        key: item.key,
        danger: item.danger,
        disabled: Boolean(item.disabled),
        ...(item.checked !== undefined
          ? { role: "menuitemradio", "aria-checked": item.checked }
          : {}),
        label: (
          <Row
            lead={item.icon}
            label={item.opensDialog ? `${item.label}…` : item.label}
            description={item.description}
            tail={
              <>
                {(reason ?? item.value) !== undefined && (
                  <span className="ct-menu-value">{reason ?? item.value}</span>
                )}
                {item.shortcut && item.shortcut.length > 0 && (
                  <span className="ct-menu-keys">
                    {item.shortcut.map((key) => (
                      <kbd key={key} className="ct-menu-key">
                        {key}
                      </kbd>
                    ))}
                  </span>
                )}
                {item.checked && <Check />}
              </>
            }
          />
        ),
        onClick: ({ domEvent }: { domEvent: { currentTarget: EventTarget } }) =>
          item.onSelect(domEvent.currentTarget as HTMLElement),
        ...stagger,
      });
    }
    return out;
  };

  return {
    items: convert(entries, true) as unknown as NonNullable<MenuProps["items"]>,
    keepOpen,
    sliders,
  };
}

const EXPAND_ICON = (
  <span className="ct-menu-chevron">
    <MenuIcon name="chevron" size={14} />
  </span>
);

const ITEM_SELECTOR = '[role^="menuitem"]:not([aria-disabled="true"])';

// Near an edge the menu flips to the other side of its anchor, then slides
// back inside the window if it still does not fit: a tall person menu opened
// low on the stage used to flip up and lose its top rows above the window.
// (antd's type lists only the flips; it passes the shifts on to rc-trigger.)
const OVERFLOW = { adjustX: 1, adjustY: 1, shiftX: true, shiftY: true } as const;
// At a point (a right-click) there is no anchor to keep a gap from, and the
// shift above keeps antd's 4px gap: a menu slid back from the bottom edge
// stayed 4px under it.
const AT_POINT = { offset: [0, 0] };

export interface OdakMenuProps {
  items: OdakMenuEntry[];
  /** Whose or what menu this is, when the anchor does not already say it. */
  header?: ReactNode;
  trigger: "contextMenu" | "click";
  /** Opened from outside at this point of the window (the stage catches its
      own right-click): the menu hangs off it instead of `children`. */
  anchorPoint?: { x: number; y: number };
  /** Controlled, for a menu opened from outside. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: DropdownProps["placement"];
  /** 220–320; the stylesheet's default otherwise. */
  width?: number;
  disabled?: boolean;
  children?: ReactElement;
}

export function OdakMenu({
  items,
  header,
  trigger,
  anchorPoint,
  open,
  onOpenChange,
  placement,
  width,
  disabled,
  children,
}: OdakMenuProps): JSX.Element {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  // Set by the click that is about to close the menu, when that click was a
  // switch or a slider: antd closes on every item click.
  const keepOpenRef = useRef(false);
  const built = build(items);

  const handleOpenChange: DropdownProps["onOpenChange"] = (next, info) => {
    if (!next && info?.source === "menu" && keepOpenRef.current) {
      keepOpenRef.current = false;
      return;
    }
    setInnerOpen(next);
    onOpenChange?.(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const active = document.activeElement;
    const row = active instanceof HTMLElement ? active.closest<HTMLElement>('[role^="menuitem"]') : null;

    const slider = row?.getAttribute("data-slider");
    if (slider && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const entry = built.sliders.get(slider);
      if (entry) {
        event.preventDefault();
        const step = event.key === "ArrowRight" ? SLIDER_STEP : -SLIDER_STEP;
        entry.onChange(Math.min(SLIDER_MAX, Math.max(0, entry.value + step)));
      }
      return;
    }

    // rc-menu chooses with Enter only.
    if (event.key === " " && row) {
      event.preventDefault();
      row.click();
      return;
    }

    // A letter jumps to the next row that starts with it.
    if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const list = row?.closest(".ant-dropdown-menu") ?? event.currentTarget.querySelector(".ant-dropdown-menu");
    if (!list) {
      return;
    }
    const letter = event.key.toLocaleLowerCase("tr");
    const rows = [...list.querySelectorAll<HTMLElement>(ITEM_SELECTOR)].filter(
      (candidate) => candidate.closest(".ant-dropdown-menu") === list,
    );
    const start = row ? rows.indexOf(row) + 1 : 0;
    const next = [...rows.slice(start), ...rows.slice(0, start)].find((candidate) =>
      (candidate.querySelector(".ct-menu-label")?.textContent ?? "")
        .trim()
        .toLocaleLowerCase("tr")
        .startsWith(letter),
    );
    next?.focus();
  };

  return (
    <Dropdown
      trigger={[trigger]}
      open={isOpen}
      onOpenChange={handleOpenChange}
      placement={placement}
      autoAdjustOverflow={OVERFLOW}
      align={trigger === "contextMenu" || anchorPoint ? AT_POINT : undefined}
      disabled={disabled}
      autoFocus
      destroyOnHidden
      rootClassName="ct-menu-root"
      menu={{
        items: built.items,
        expandIcon: EXPAND_ICON,
        subMenuOpenDelay: 0.1,
        onClick: ({ key }) => {
          keepOpenRef.current = built.keepOpen.has(key);
        },
      }}
      popupRender={(menu) => (
        // The popup is portalled, but React events still bubble along the
        // component tree: into a lobby row that joins the room on click, a
        // card that opens a conversation, a tile that takes the stage.
        <div
          className="ct-menu-panel"
          style={width ? { width } : undefined}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          // antd focuses this wrapper on open; the list is what takes keys.
          onFocus={(event) => {
            if (event.target === event.currentTarget) {
              event.currentTarget.querySelector<HTMLElement>(".ant-dropdown-menu")?.focus();
            }
          }}
          onKeyDown={handleKeyDown}
        >
          {header}
          {menu}
        </div>
      )}
    >
      {anchorPoint ? (
        <div
          style={{
            position: "fixed",
            left: anchorPoint.x,
            top: anchorPoint.y,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      ) : (
        children
      )}
    </Dropdown>
  );
}

/** Who or what a menu is about: a face or a tile, a name, one line of context. */
export function OdakMenuHeader({
  lead,
  name,
  detail,
}: {
  lead: ReactNode;
  name: string;
  detail?: string;
}): JSX.Element {
  return (
    <div className="ct-menu-identity">
      {lead}
      <span className="ct-menu-identity-text">
        <strong>{name}</strong>
        {detail && <span>{detail}</span>}
      </span>
    </div>
  );
}
