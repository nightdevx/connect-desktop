import type { JSX } from "react";
import type { ReactNode } from "react";

/** The three dialog widths: a confirm or one field, a form, a picker. */
export const MODAL_WIDTH = { s: 400, m: 440, l: 720 } as const;

interface ModalHeadingProps {
  icon: ReactNode;
  title: ReactNode;
  /** One line saying what this dialog is for, under the title. */
  description?: ReactNode;
  /** "danger" for irreversible actions; pair it with rootClassName "ct-modal danger". */
  tone?: "default" | "danger";
}

/**
 * The heading every modal shares: an icon badge, the title, and an optional
 * line of explanation. Passed as an antd Modal's `title`, so the modal keeps
 * its own close button, footer and keyboard handling — this only replaces the
 * three different hand-rolled title rows modals used to carry.
 */
export function ModalHeading({
  icon,
  title,
  description,
  tone = "default",
}: ModalHeadingProps): JSX.Element {
  return (
    <div className="ct-modal-heading">
      <span
        className={`ct-modal-heading-icon${tone === "danger" ? " danger" : ""}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="ct-modal-heading-text">
        <span className="ct-modal-heading-title">{title}</span>
        {description && (
          <span className="ct-modal-heading-description">{description}</span>
        )}
      </div>
    </div>
  );
}
