import type { ReactNode } from "react";
import { PageHeader } from "@/ui/page-header";

/**
 * The three shapes every settings page is built from: the page, its groups,
 * and the rows inside a group.
 *
 * Each page used to write the markup out by hand -- an uppercase label, then a
 * card, then a hand-rolled row -- and the pages drifted: a save button under one
 * group and in the page header on the next, a bare field list here and a card
 * there. A group is now one card with its title inside it, its rows divided by
 * hairlines, and any buttons that act on the whole group in a footer bar.
 */

interface SettingsPageProps {
  title: string;
  /** One sentence on what the page is for. */
  description: ReactNode;
  children: ReactNode;
}

export function SettingsPage({ title, description, children }: SettingsPageProps) {
  return (
    <div className="ct-settings-section">
      <PageHeader
        className="ct-settings-section-header"
        title={title}
        description={description}
      />
      <div className="ct-settings-content">{children}</div>
    </div>
  );
}

interface SettingsGroupProps {
  title: ReactNode;
  description?: ReactNode;
  /** One control for the whole group, on the title's line. */
  action?: ReactNode;
  /** Buttons that act on the whole group, in a bar under it. */
  footer?: ReactNode;
  /** A line of text on the left of that bar. */
  footerHint?: ReactNode;
  tone?: "danger";
  children?: ReactNode;
}

export function SettingsGroup({
  title,
  description,
  action,
  footer,
  footerHint,
  tone,
  children,
}: SettingsGroupProps) {
  return (
    <section className={`ct-settings-group${tone ? ` ${tone}` : ""}`}>
      <header className="ct-settings-group-head">
        <div className="ct-settings-group-title">
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="ct-settings-group-action">{action}</div> : null}
      </header>
      {children}
      {footer || footerHint ? (
        <footer className="ct-settings-group-foot">
          {footerHint ? <span className="ct-settings-foot-hint">{footerHint}</span> : null}
          {footer ? <div className="ct-settings-foot-actions">{footer}</div> : null}
        </footer>
      ) : null}
    </section>
  );
}

interface SettingsRowProps {
  /** A small icon in a tinted square before the title. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** The control's id: the title becomes its label. */
  htmlFor?: string;
  /** Exists only while the row above it is on, so it hangs under that row. */
  detail?: boolean;
  /** The control under the text instead of beside it. */
  stacked?: boolean;
  /** The row's one control. */
  children?: ReactNode;
}

export function SettingsRow({
  icon,
  title,
  description,
  htmlFor,
  detail = false,
  stacked = false,
  children,
}: SettingsRowProps) {
  return (
    <div
      className={`ct-settings-row${detail ? " detail" : ""}${stacked ? " stacked" : ""}`}
    >
      {icon ? (
        <span className="ct-settings-row-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="ct-settings-row-text">
        {htmlFor ? <label htmlFor={htmlFor}>{title}</label> : <strong>{title}</strong>}
        {description ? <span>{description}</span> : null}
      </div>
      {children}
    </div>
  );
}
