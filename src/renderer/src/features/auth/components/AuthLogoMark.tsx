import type { JSX } from "react";

interface AuthLogoMarkProps {
  className?: string;
  /** Boot splash: draw the room in, drop the dot into its corner, then breathe. */
  animated?: boolean;
}

/**
 * The Connect mark, "Canlı Oda": a room tile with its top-right corner open
 * and a dot where the corner was, the live badge of the room list.
 *
 * The room is drawn as one stroke along its centre line rather than as an
 * outline, so the boot screen can draw it in and the murals can show it as
 * thin line art. Masters (outlined) live in connect/marka.
 *
 * One colour, --ct-logo: lime on dark, graphite on light, and whatever a
 * container sets it to (the rail's lime tile sets graphite).
 */
export function AuthLogoMark({
  className,
  animated = false,
}: AuthLogoMarkProps): JSX.Element {
  const classes = ["ct-logomark"];
  if (animated) {
    classes.push("ct-logomark--draw");
  }
  if (className) {
    classes.push(className);
  }

  return (
    <svg
      viewBox="36 36 184 184"
      className={classes.join(" ")}
      aria-hidden="true"
      focusable="false"
    >
      {/* Starts at the top arm's end, so the draw-in runs anticlockwise
          round the room and finishes at the open corner. */}
      <path
        className="ct-logomark-room"
        d="M150 54H96A42 42 0 0 0 54 96V160A42 42 0 0 0 96 202H160A42 42 0 0 0 202 160V106"
        pathLength="1"
        fill="none"
        stroke="var(--ct-logo)"
        strokeWidth="36"
      />
      <circle
        className="ct-logomark-dot"
        cx="189.7"
        cy="66.3"
        r="19.5"
        fill="var(--ct-logo)"
      />
    </svg>
  );
}
