import { useSyncExternalStore } from "react";

/**
 * Whether this window is both visible and focused.
 *
 * One subscription for the whole renderer, not one per caller. The first
 * consumer was a single video tile, so a hook with its own three listeners was
 * fine; the second is every avatar on screen, and a roster of fifty would
 * otherwise attach a hundred and fifty listeners to answer one question that
 * has one answer.
 */
const listeners = new Set<() => void>();

let active =
  typeof document === "undefined" ||
  (document.visibilityState === "visible" && document.hasFocus());

const publish = (): void => {
  const next =
    document.visibilityState === "visible" && document.hasFocus();
  if (next === active) {
    // Focus and visibilitychange both fire for a single alt-tab. Bailing here
    // is what keeps that from waking every subscriber twice.
    return;
  }

  active = next;
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);

  if (listeners.size === 1) {
    window.addEventListener("focus", publish);
    window.addEventListener("blur", publish);
    document.addEventListener("visibilitychange", publish);
    // The window may have lost focus between module load and the first
    // subscriber; read it now rather than trusting the initial guess.
    publish();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("focus", publish);
      window.removeEventListener("blur", publish);
      document.removeEventListener("visibilitychange", publish);
    }
  };
};

// Visible, whether or not it has the focus: false only once the window is
// minimised or fully covered. A second store beside the first, with its own
// two listeners, because a caller that wants this answer should not also wake
// for every alt-tab.
const visibleListeners = new Set<() => void>();
let visible = typeof document === "undefined" || document.visibilityState === "visible";

const publishVisible = (): void => {
  const next = document.visibilityState === "visible";
  if (next === visible) {
    return;
  }
  visible = next;
  for (const listener of visibleListeners) {
    listener();
  }
};

const subscribeVisible = (listener: () => void): (() => void) => {
  visibleListeners.add(listener);
  if (visibleListeners.size === 1) {
    document.addEventListener("visibilitychange", publishVisible);
    publishVisible();
  }
  return () => {
    visibleListeners.delete(listener);
    if (visibleListeners.size === 0) {
      document.removeEventListener("visibilitychange", publishVisible);
    }
  };
};

export const useWindowVisible = (): boolean =>
  useSyncExternalStore(subscribeVisible, () => visible, () => true);

export const useWindowActive = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => active,
    // Server snapshot: there is no server, but useSyncExternalStore wants one
    // and "active" is the only answer that renders anything.
    () => true,
  );
