import type { ReactNode } from "react";
import { PageHeader } from "@/ui/page-header";
import { getDisplayInitials, hueStyle } from "@/ui/person-style";

/**
 * The shapes every admin screen is built from: the page title, the card every
 * block sits in, and the row of metric tiles.
 *
 * Each screen used to hand-roll them and they drifted: a bare table on one
 * page, a table inside a card on the next, a filter bar floating between the
 * header and the table on a third, and two copies of the stat tile markup.
 * Every block on every admin page is now one card -- title, optional filters,
 * content, optional footer -- the same card the settings pages use.
 */

interface AdminPageHeaderProps {
  title: string;
  /** One sentence on what the screen is for. */
  description: ReactNode;
  /** The screen's primary controls -- in practice, "Yenile". */
  actions?: ReactNode;
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: AdminPageHeaderProps) {
  return (
    <PageHeader
      className="ct-admin-page-header"
      title={title}
      description={description}
      actions={actions}
    />
  );
}

interface AdminSectionProps {
  title: ReactNode;
  /** Sits in a tinted square before the title. */
  icon?: ReactNode;
  /** A sentence under the title. */
  description?: ReactNode;
  /** A count or a timestamp, right-aligned in the header. */
  hint?: ReactNode;
  /** Controls belonging to this card, after the hint. */
  action?: ReactNode;
  /** Search and filters, on a band between the header and the content. */
  toolbar?: ReactNode;
  footer?: ReactNode;
  /**
   * Body without padding. For a card whose whole content is a table or a list
   * of rows -- they pad their own cells, and a second layer of padding put them
   * on a different left edge from the card's title.
   */
  flush?: boolean;
  /** Grid placement from the parent, e.g. a dashboard column span. */
  className?: string;
  children: ReactNode;
}

export function AdminSection({
  title,
  icon,
  description,
  hint,
  action,
  toolbar,
  footer,
  flush,
  className,
  children,
}: AdminSectionProps) {
  return (
    <section
      className={`ct-admin-section${flush ? " flush" : ""}${className ? ` ${className}` : ""}`}
    >
      <header className="ct-admin-section-header">
        {icon ? (
          <span className="ct-admin-section-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="ct-admin-section-heading">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {hint ? <span className="ct-admin-section-hint">{hint}</span> : null}
        {action ? (
          <div className="ct-admin-section-action">{action}</div>
        ) : null}
      </header>
      {toolbar ? <div className="ct-admin-section-toolbar">{toolbar}</div> : null}
      <div className="ct-admin-section-body">{children}</div>
      {footer ? (
        <footer className="ct-admin-section-footer">{footer}</footer>
      ) : null}
    </section>
  );
}

export interface AdminStat {
  tone: "violet" | "emerald" | "blue" | "amber" | "red";
  label: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: ReactNode;
}

/** A row of metric tiles: what the number is, the number, and what it counts. */
export function AdminStatGrid({ stats }: { stats: AdminStat[] }) {
  return (
    <div className="ct-stat-grid">
      {stats.map((stat) => (
        <article key={stat.label} className={`ct-stat-card ${stat.tone}`}>
          <div className="ct-stat-card-top">
            <span className="ct-stat-label">{stat.label}</span>
            <span className="ct-stat-icon" aria-hidden="true">
              {stat.icon}
            </span>
          </div>
          <span className="ct-stat-value">{stat.value}</span>
          {stat.hint ? <div className="ct-stat-hint">{stat.hint}</div> : null}
        </article>
      ))}
    </div>
  );
}

/** "Güncellendi 12:04:31", or that the last refresh failed. */
export function AdminRefreshedAt({
  at,
  failed,
}: {
  at: Date | null;
  failed: boolean;
}) {
  if (!failed && !at) {
    return null;
  }
  return (
    <span className={`ct-admin-refreshed${failed ? " failed" : ""}`}>
      <span className="ct-admin-refreshed-dot" aria-hidden="true" />
      {failed
        ? "Yenilenemedi — son bilinen veriler"
        : `Güncellendi ${at?.toLocaleTimeString("tr-TR")}`}
    </span>
  );
}

/* ---- Table cells ----
   Every admin table draws its people, states and dates the same way. They used
   to be a different pill in every column -- a blue tag for a username, a green
   tag for "Aktif", an orange one for a role -- so a row was a strip of
   competing colours and nothing on it stood out. */

/** "02.10.2026 23:58" -- the one date format of the admin tables. Logs ask
    for the seconds as well: two events a few seconds apart are the question. */
export const adminDateTime = (value?: string | null, seconds = false): string =>
  value
    ? new Date(value).toLocaleString("tr-TR", {
        dateStyle: "short",
        timeStyle: seconds ? "medium" : "short",
      })
    : "—";

export type AdminTone = "ok" | "warn" | "danger" | "info" | "muted";

/** A state as a coloured dot and a word, not a pill. */
export function AdminState({
  tone = "muted",
  icon,
  children,
}: {
  tone?: AdminTone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={`ct-admin-state ${tone}${icon ? " with-icon" : ""}`}>
      {icon}
      {children}
    </span>
  );
}

/** A person: their face in their own colour, their name, and their handle. */
export function AdminPerson({
  userId,
  name,
  handle,
  avatarUrl,
}: {
  userId: string;
  name: string;
  handle?: ReactNode;
  avatarUrl?: string | null;
}) {
  return (
    <div className="ct-admin-person">
      <span className="ct-admin-face ct-hued" style={hueStyle(userId)} aria-hidden="true">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : getDisplayInitials(name)}
      </span>
      <div className="ct-admin-person-text">
        <strong>{name}</strong>
        {handle ? <span>{handle}</span> : null}
      </div>
    </div>
  );
}
