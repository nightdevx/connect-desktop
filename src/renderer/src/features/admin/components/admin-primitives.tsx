import type { ReactNode } from "react";

/**
 * The two shapes every admin screen is built from.
 *
 * They exist because the seven screens each hand-rolled them and drifted:
 * the dashboard put its <h1> and <p> as direct children of a
 * `justify-between` flex row, so the page title sat on the left and its
 * description on the far right; four screens carried a "Yenile" button in
 * the header, one carried it inside the filter toolbar and two had none.
 * Card chrome was three different things at once -- an antd <Card>, a
 * .ct-settings-card, and a bare <div>.
 *
 * A shared component fixes that by construction rather than by everybody
 * remembering, which is what the last pass relied on.
 */

interface AdminPageHeaderProps {
  title: string;
  /** One sentence on what the screen is for. Capped at 68ch by the stylesheet. */
  description: string;
  /** The screen's primary controls -- in practice, "Yenile". */
  actions?: ReactNode;
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="ct-admin-page-header">
      <div className="ct-admin-page-header-text">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? (
        <div className="ct-admin-page-header-actions">{actions}</div>
      ) : null}
    </header>
  );
}

interface AdminSectionProps {
  title: ReactNode;
  /** Sits in a tinted square before the title. */
  icon?: ReactNode;
  /** A count or a timestamp, right-aligned in the header. */
  hint?: ReactNode;
  /** One control belonging to this section, after the hint. */
  action?: ReactNode;
  footer?: ReactNode;
  /**
   * Body without padding. For a section whose whole content is a table --
   * antd already pads its own cells, and a second layer of padding is what
   * made the moderation tables sit on a visibly different left edge from
   * every other table on the screen.
   */
  flush?: boolean;
  /** Grid placement from the parent, e.g. a dashboard column span. */
  className?: string;
  children: ReactNode;
}

export function AdminSection({
  title,
  icon,
  hint,
  action,
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
        <h2>
          {icon ? (
            <span className="ct-admin-section-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="ct-admin-section-title">{title}</span>
        </h2>
        {hint ? <span className="ct-admin-section-hint">{hint}</span> : null}
        {action ? (
          <div className="ct-admin-section-action">{action}</div>
        ) : null}
      </header>
      <div className="ct-admin-section-body">{children}</div>
      {footer ? (
        <footer className="ct-admin-section-footer">{footer}</footer>
      ) : null}
    </section>
  );
}
