import type { JSX, ReactNode } from "react";

interface TipLabelProps {
  /** What the control does. */
  title: ReactNode;
  /** A second, quieter line: why it is off, or what a right-click does. */
  hint?: ReactNode;
  /** Keys as chips, e.g. ["Esc"] or ["Ctrl", "⇧", "M"]. */
  keys?: string[];
}

/**
 * The inside of an antd Tooltip: one line saying what the control does, its
 * keys as mono chips beside it, and a reason or hint under it. Replaces the
 * "Kulaklığı kapat (sağ tık: cihaz seç)" parentheses.
 */
export function TipLabel({ title, hint, keys }: TipLabelProps): JSX.Element {
  return (
    <span className="ct-tip">
      <span className="ct-tip-title">
        {title}
        {keys && keys.length > 0 && (
          <span className="ct-tip-keys">
            {keys.map((key) => (
              <kbd key={key} className="ct-kbd">
                {key}
              </kbd>
            ))}
          </span>
        )}
      </span>
      {hint && <span className="ct-tip-hint">{hint}</span>}
    </span>
  );
}
