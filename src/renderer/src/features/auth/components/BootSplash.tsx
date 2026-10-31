import { useEffect, useState, type JSX } from "react";

import { LOGO_DOT, LOGO_ROOM_PATH, WORDMARK_OFFSET, WORDMARK_PATH } from "./brand-paths";

/** The intro's length (boot-splash.css): the lockup lands at 1150 + 700 ms. */
const INTRO_MS = 1850;
/** Under reduced motion the finished lockup only fades in. */
const INTRO_REDUCED_MS = 360;
/** The fade out (ctSplashOut). */
const EXIT_MS = 260;

interface BootSplashProps {
  /** The session check has answered, or the app knows it is offline. */
  ready: boolean;
  /**
   * Waits at its first frame without starting: put up while the window is
   * hidden, so it is already there when the window shows.
   */
  held?: boolean;
  /**
   * Played over a screen that is already there (the window coming back from
   * the tray), not at launch. Nothing to announce, and under reduced motion no
   * fade in over the screen.
   */
  overScreen?: boolean;
  /**
   * "reveal": the intro is over and the app is ready, mount the screen
   * underneath. "done": the fade is over, unmount the splash. App passes its
   * state setter, whose identity never changes, so the timers never restart.
   */
  onPhase: (phase: "reveal" | "done") => void;
}

/**
 * The launch intro, "Kapıdan giriş" (planlar/masaustu/ACILIS-ANIMASYONU-PLANI.md):
 * the room draws in, the dot comes in through the open corner, then the mark
 * slides left and CONNECT comes out from behind it.
 *
 * It always plays to the end, even when the session answers at once, and the
 * screen underneath is only mounted once it has: building the workspace while
 * the room is drawing would stall the draw, which runs on the main thread. If
 * the session is still out when the intro ends, the dot pulses like a live
 * badge until it answers. The fade out is opacity and transform only, so it
 * stays smooth while the freshly mounted screen keeps the main thread busy.
 *
 * Phases run on timers rather than animationend: the window can start hidden
 * in the tray, where no frames are drawn, and the timers still fire there
 * (backgroundThrottling is off).
 */
export function BootSplash({ ready, held = false, overScreen = false, onPhase }: BootSplashProps): JSX.Element {
  const [introOver, setIntroOver] = useState(false);
  const [exiting, setExiting] = useState(false);
  const phase = exiting ? "exit" : introOver && !ready ? "hold" : "intro";
  // Latched: a pulse that has started keeps going through the fade, and a
  // splash that never waited never pulses.
  const [waited, setWaited] = useState(false);
  if (phase === "hold" && !waited) {
    setWaited(true);
  }

  useEffect(() => {
    if (held) {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setIntroOver(true), reduced ? INTRO_REDUCED_MS : INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [held]);

  useEffect(() => {
    if (!introOver || !ready) {
      return;
    }
    onPhase("reveal");
    // Two frames, so the screen underneath commits and paints behind the
    // opaque splash before the fade starts uncovering it. A window hidden in
    // the tray draws no frames, so a timer stands in: there the whole sequence
    // finishes unseen and opening the window goes straight to the app.
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setExiting(true));
    });
    const fallback = window.setTimeout(() => setExiting(true), 100);
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
      window.clearTimeout(fallback);
    };
  }, [introOver, ready, onPhase]);

  useEffect(() => {
    if (!exiting) {
      return;
    }
    const timer = window.setTimeout(() => onPhase("done"), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting, onPhase]);

  return (
    <div
      className={waited ? "ct-boot-splash is-waiting" : "ct-boot-splash"}
      data-phase={phase}
      data-held={held || undefined}
      data-over={overScreen || undefined}
      role={overScreen ? undefined : "status"}
      aria-hidden={overScreen || undefined}
    >
      {/* A live region announces its content, not its name: the text changes
          when the session runs late. */}
      {!overScreen && (
        <span className="sr-only">{waited ? "Oturum kontrol ediliyor" : "Connect açılıyor"}</span>
      )}
      <svg className="ct-boot-splash-mark" viewBox="0 0 938 256" aria-hidden="true" focusable="false">
        <g className="ct-boot-splash-lock">
          <path className="ct-boot-splash-room" d={LOGO_ROOM_PATH} pathLength="1" />
          <g className="ct-boot-splash-dot">
            <circle className="ct-boot-splash-ring" cx={LOGO_DOT.cx} cy={LOGO_DOT.cy} r={LOGO_DOT.r} />
            <circle
              className="ct-boot-splash-ring ct-boot-splash-ring--pulse"
              cx={LOGO_DOT.cx}
              cy={LOGO_DOT.cy}
              r={LOGO_DOT.r}
            />
            <circle className="ct-boot-splash-dot-fill" cx={LOGO_DOT.cx} cy={LOGO_DOT.cy} r={LOGO_DOT.r} />
          </g>
          {/* Everything left of x=240 is cut away, so CONNECT comes out from
              behind the mark instead of sliding across it. */}
          <clipPath id="ct-boot-splash-word-clip">
            <rect x="240" y="0" width="720" height="256" />
          </clipPath>
          <g clipPath="url(#ct-boot-splash-word-clip)">
            <g className="ct-boot-splash-word">
              <path transform={WORDMARK_OFFSET} d={WORDMARK_PATH} />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
