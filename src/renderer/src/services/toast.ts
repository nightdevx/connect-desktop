/**
 * The app's notifications, replacing antd's `message`.
 *
 * antd's static `message.*` cannot see the ConfigProvider, so every toast it
 * raised painted the library's default light theme over a dark app — and the
 * hook form (`message.useMessage`) had to be mounted, and its holder rendered,
 * in every component that wanted to say anything. Eight settings panels each
 * carried their own copy.
 *
 * This is a plain store: any module can call `toast.error("…")` without a hook,
 * and the single <ToastHost /> mounted by App renders whatever is in it. The
 * call shape matches antd's on purpose (`success/info/warning/error(content)`
 * and `open({ type, key, content })`), so moving a call site over is a rename.
 */

export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  /** A second, quieter line: what happens next, or what to do about it. */
  description?: string;
  action?: ToastAction;
  /** Milliseconds on screen. Errors default longer: they are worth reading. */
  duration?: number;
  /**
   * A toast with a key replaces the one already showing under it instead of
   * stacking — the app-wide status line, a device switch, a slider being
   * dragged.
   */
  key?: string;
}

export type ToastInput = string | ToastOptions;

export interface ToastItem {
  id: number;
  key?: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
  duration: number;
}

const MAX_VISIBLE = 4;
const DEFAULT_DURATION_MS = 4200;
const ERROR_DURATION_MS = 6500;

let items: readonly ToastItem[] = [];
let sequence = 0;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const push = (tone: ToastTone, input: ToastInput): void => {
  const options = typeof input === "string" ? { title: input } : input;
  const title = options.title.trim();

  // An empty toast is worse than none: it says something went wrong and not
  // what. Callers interpolate error text, which can come back blank.
  if (!title) {
    return;
  }

  const item: ToastItem = {
    id: ++sequence,
    key: options.key,
    tone,
    title,
    description: options.description?.trim() || undefined,
    action: options.action,
    duration:
      options.duration ??
      (tone === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS),
  };

  const rest = item.key ? items.filter((t) => t.key !== item.key) : items;
  items = [item, ...rest].slice(0, MAX_VISIBLE);
  emit();
};

export const toast = {
  success: (input: ToastInput): void => push("success", input),
  info: (input: ToastInput): void => push("info", input),
  warning: (input: ToastInput): void => push("warning", input),
  error: (input: ToastInput): void => push("error", input),

  /** antd-compatible form, for call sites that pick the tone at runtime. */
  open: (config: { type: ToastTone; content: string; key?: string; duration?: number }): void =>
    push(config.type, {
      title: config.content,
      key: config.key,
      duration: config.duration,
    }),

  dismiss: (id: number): void => {
    const next = items.filter((t) => t.id !== id);
    if (next.length !== items.length) {
      items = next;
      emit();
    }
  },

  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot: (): readonly ToastItem[] => items,
};
