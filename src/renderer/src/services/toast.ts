

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

export type ToastTone = "success" | "info" | "warning" | "error" | "progress";

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
   * A toast with a key replaces the one already showing under it, in place,
   * instead of stacking — the app-wide status line, a device switch, a slider
   * being dragged, a progress toast whose value moves.
   */
  key?: string;
  /** The technical text behind a human sentence; "Ayrıntıyı kopyala" copies it. */
  detail?: string;
  /** progress only: 0–100, or null while it cannot be told. */
  value?: number | null;
}

export type ToastInput = string | ToastOptions;

export interface ToastItem {
  id: number;
  /** Bumped on every replacement, so the countdown starts over. */
  rev: number;
  key?: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
  detail?: string;
  value?: number | null;
  /** Infinity for progress: it stays until its key is replaced. */
  duration: number;
}

const MAX_VISIBLE = 4;
const DEFAULT_DURATION_MS = 4200;
const ERROR_DURATION_MS = 6500;

// What a raw error from a library or the network looks like: English words a
// Turkish sentence never carries, an exception name, an address with a port.
const TECHNICAL_WORDS =
  /\b(failed|fetch|error|could not|cannot|unable|connection|signal|timeout|timed out|refused|network|socket|status code|undefined|exception|abort(ed)?)\b|\d{1,3}(\.\d{1,3}){3}|https?:\/\//i;
// Case-sensitive: "NotAllowedError", "ECONNREFUSED" -- never "Ekran".
const TECHNICAL_CODES = /\b[A-Z][A-Za-z]*Error\b|\bE[A-Z]{3,}\b/;
const isTechnical = (text: string): boolean =>
  TECHNICAL_WORDS.test(text) || TECHNICAL_CODES.test(text);
const TIMEOUT = /timeout|timed out|ETIMEDOUT/i;
const PERMISSION = /NotAllowed|permission|denied/i;
const NETWORK = /fetch|network|connect|signal|socket|refused|ECONN|ENOTFOUND|EAI_AGAIN|offline|unreachable|\d{1,3}(\.\d{1,3}){3}/i;

/**
 * Turns "Lobi bağlantısı geri yüklenemedi: could not establish signal
 * connection: Failed to fetch (127.0.0.1:7880)" into a sentence and a reason,
 * keeping the original as the detail to copy. Null when the text is already
 * human. Fifty call sites interpolate error.message into their toast; this is
 * the one place every one of them passes.
 */
export const humanizeError = (
  text: string,
): { title: string; description: string; detail: string } | null => {
  const split = /^(.*?[^\s:]):\s+([\s\S]+)$/.exec(text);
  const head = split && !isTechnical(split[1]) ? split[1] : null;
  const technical = head && split ? split[2] : text;
  if (!isTechnical(technical)) {
    return null;
  }

  const description = TIMEOUT.test(technical)
    ? "Sunucu zamanında yanıt vermedi. Biraz sonra tekrar dene."
    : PERMISSION.test(technical)
      ? "İzin verilmedi."
      : NETWORK.test(technical)
        ? "Sunucuya ulaşılamıyor. Bağlantını kontrol et."
        : "Beklenmeyen bir hata oldu.";

  return {
    title: head ? head.replace(/[.!]+$/, "") : "Bir şeyler ters gitti",
    description,
    detail: text,
  };
};

let items: readonly ToastItem[] = [];
let sequence = 0;
let revision = 0;
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

  const human = tone === "error" || tone === "warning" ? humanizeError(title) : null;
  const previous = options.key ? items.find((t) => t.key === options.key) : undefined;

  const item: ToastItem = {
    // A replacement keeps its place and its id: a progress toast whose value
    // moves must not slide in again on every update.
    id: previous?.id ?? ++sequence,
    rev: ++revision,
    key: options.key,
    tone,
    title: human?.title ?? title,
    description: options.description?.trim() || human?.description || undefined,
    action: options.action,
    detail: options.detail ?? human?.detail,
    value: tone === "progress" ? (options.value ?? null) : undefined,
    duration:
      options.duration ??
      (tone === "progress"
        ? Number.POSITIVE_INFINITY
        : tone === "error"
          ? ERROR_DURATION_MS
          : DEFAULT_DURATION_MS),
  };

  items = previous
    ? items.map((t) => (t === previous ? item : t))
    : [item, ...items].slice(0, MAX_VISIBLE);
  emit();
};

export const toast = {
  success: (input: ToastInput): void => push("success", input),
  info: (input: ToastInput): void => push("info", input),
  warning: (input: ToastInput): void => push("warning", input),
  error: (input: ToastInput): void => push("error", input),
  /** Stays until the same key is replaced (by success or error when done). */
  progress: (input: ToastOptions & { key: string }): void => push("progress", input),

  /** antd-compatible form, for call sites that pick the tone at runtime. */
  open: (config: { type: ToastTone; content: string; key?: string; duration?: number }): void =>
    push(config.type, {
      title: config.content,
      key: config.key,
      duration: config.duration,
    }),

  /** With `rev`, only that version: a card that finished leaving must not take
      down the replacement that arrived under its key meanwhile. */
  dismiss: (id: number, rev?: number): void => {
    const next = items.filter((t) => t.id !== id || (rev !== undefined && t.rev !== rev));
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
