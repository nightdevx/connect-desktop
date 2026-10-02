import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  /** One sentence on what the page is for. */
  description?: ReactNode;
  /** Live counts (.ct-stat-chip) and the page's primary action, on the right. */
  actions?: ReactNode;
  /** The page's own spacing and border, e.g. a banded or ruled header. */
  className?: string;
}

/**
 * The one page title shape: Lobiler, Arkadaşlar, every settings and admin
 * page, the game lists. Each of them used to set its own -- an h1 here, an h4
 * with an icon tile there, three font sizes between them -- so moving between
 * sections changed the top of the page every time.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={`ct-page-header${className ? ` ${className}` : ""}`}>
      <div className="ct-page-header-text">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ct-page-header-actions">{actions}</div> : null}
    </header>
  );
}
