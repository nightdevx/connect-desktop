import type { CSSProperties, JSX } from "react";

interface VolumeSliderProps {
  /** Percent, 0..max. */
  value: number;
  onChange: (value: number) => void;
  /** 200 where the volume can boost past 100%; a notch then marks 100. */
  max?: number;
  /** The screen reader's name, when no <label htmlFor={id}> names it. */
  label?: string;
  id?: string;
  className?: string;
  title?: string;
  /** -1 inside a menu, whose row takes the arrow keys instead. */
  tabIndex?: number;
}

/**
 * Every volume slider in the app: one step is 1%, arrows move it by 1. The
 * fill and the 100% notch are drawn under a transparent native range, so the
 * thumb sits on top of both.
 */
export function VolumeSlider({
  value,
  onChange,
  max = 200,
  label,
  id,
  className,
  title,
  tabIndex,
}: VolumeSliderProps): JSX.Element {
  return (
    <span
      className={className ? `ct-volume ${className}` : "ct-volume"}
      data-notch={max > 100 ? "" : undefined}
      style={{ "--v": value / max, "--notch": 100 / max } as CSSProperties}
    >
      <input
        type="range"
        id={id}
        min={0}
        max={max}
        step={1}
        value={value}
        title={title}
        tabIndex={tabIndex}
        aria-label={label}
        aria-valuetext={`%${value}`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </span>
  );
}
