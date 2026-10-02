import { useId } from "react";

interface AuthLogoMarkProps {
  className?: string;
  /** Boot splash: draw the two rings in, then keep a breathing glow. */
  animated?: boolean;
}

/**
 * The Connect mark — two interlocked rings, the right one a speech bubble —
 * redrawn as SVG so the boot screen can animate the strokes instead of fading
 * a bitmap. Layering does the interlock: the blue ring sits on top of the
 * bubble everywhere, and one short arc of the bubble is painted again over it
 * at the upper crossing, so each ring passes over the other once.
 *
 * Gradient stops read the --ct-brand-* tokens, so the mark darkens with the
 * light theme like everything else.
 */
export function AuthLogoMark({
  className,
  animated = false,
}: AuthLogoMarkProps): JSX.Element {
  // Two instances can be mounted at once (brand panel mural + compact badge);
  // shared gradient ids would make one of them paint the other's colours.
  const id = useId();
  const blue = `${id}-blue`;
  const cyan = `${id}-cyan`;

  const classes = ["ct-logomark"];
  if (animated) {
    classes.push("ct-logomark--draw");
  }
  if (className) {
    classes.push(className);
  }

  return (
    <svg
      viewBox="0 0 105 80"
      className={classes.join(" ")}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={blue} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--ct-brand-blue)" />
          <stop offset="100%" stopColor="var(--ct-brand-blue-deep)" />
        </linearGradient>
        <linearGradient id={cyan} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--ct-brand-cyan)" />
          <stop offset="100%" stopColor="var(--ct-brand-cyan-deep)" />
        </linearGradient>
      </defs>

      {/* Speech bubble ring (bottom layer). rotate(90) starts the draw at the
          bottom, so the two rings grow towards each other. */}
      <circle
        className="ct-logomark-bubble"
        cx="70"
        cy="40"
        r="24"
        pathLength="1"
        fill="none"
        stroke={`url(#${cyan})`}
        strokeWidth="13"
        strokeLinecap="round"
        transform="rotate(90 70 40)"
      />

      {/* The bubble's tail: a wedge off the ring's lower-right, closed back
          along the ring's outer edge so no seam shows between them. */}
      <path
        className="ct-logomark-tail"
        d="M 96.2 54.8 Q 100.8 63.5 99.6 73.6 Q 91.2 70.4 84.0 66.2 A 30.5 30.5 0 0 0 96.2 54.8 Z"
        fill={`url(#${cyan})`}
      />

      {/* Blue ring, over the bubble. rotate(-90) starts the draw at the top. */}
      <circle
        className="ct-logomark-ring"
        cx="34"
        cy="40"
        r="24"
        pathLength="1"
        fill="none"
        stroke={`url(#${blue})`}
        strokeWidth="13"
        strokeLinecap="round"
        transform="rotate(-90 34 40)"
      />

      {/* The interlock: this short bubble arc repaints over the blue ring at
          the upper crossing only. */}
      <path
        className="ct-logomark-over"
        d="M 47.4 31.8 A 24 24 0 0 1 59.8 18.3"
        fill="none"
        stroke={`url(#${cyan})`}
        strokeWidth="13"
        strokeLinecap="round"
      />
    </svg>
  );
}
