import { BrowserWindow, Notification, app } from "electron";
import { join } from "node:path";
import type {
  DesktopNotificationRequest,
  DesktopNotificationKind,
} from "../shared/desktop-api-types";
import { getDesktopAppPreferences } from "./app-preferences";

export const NOTIFICATION_ACTIVATED_CHANNEL =
  "desktop:notification-activated";

// A message that arrives while the app is in the tray produced nothing at all
// before this: no OS notification, no sound, only a taskbar flash that Windows
// drops after a few seconds. The only way to learn you had been messaged was to
// open the window.
//
// Rules kept deliberately simple:
//   - never notify while the window is focused (you can already see it),
//   - never stack: a second message from the same peer replaces the first,
//   - clicking one focuses the window and tells the renderer which
//     conversation to open.

const activeByTag = new Map<string, Notification>();

const notificationIconPath = (): string | undefined => {
  // Same asset the window/tray icon uses. Windows ignores this for toasts (it
  // uses the shortcut's icon), macOS ignores it entirely; Linux needs it.
  const candidates = [
    join(__dirname, "../../public/images/logo.png"),
    join(app.getAppPath(), "public/images/logo.png"),
    join(process.resourcesPath ?? "", "public/images/logo.png"),
  ];

  return candidates.find(Boolean);
};

// One live toast per conversation. For a lobby that is the room, not the
// sender: a busy room would otherwise stack a toast per person talking, which
// is exactly the noise that kept lobby chat silent in the first place.
const tagFor = (request: DesktopNotificationRequest): string => {
  if (request.kind === "lobby-message") {
    return `lobby-message:${request.lobbyId ?? ""}`;
  }
  return `${request.kind}:${request.peerUserId ?? ""}`;
};

const shouldNotify = (kind: DesktopNotificationKind): boolean => {
  if (!Notification.isSupported()) {
    return false;
  }

  if (!getDesktopAppPreferences().desktopNotifications) {
    return false;
  }

  // An incoming call is worth a toast even with the window focused, because the
  // call UI can be behind another section. A chat message is not.
  if (kind === "incoming-call") {
    return true;
  }

  const focused = BrowserWindow.getAllWindows().some((window) => {
    return !window.isDestroyed() && window.isFocused() && window.isVisible();
  });

  return !focused;
};

export const showDesktopNotification = (
  request: DesktopNotificationRequest,
): { shown: boolean } => {
  if (!shouldNotify(request.kind)) {
    return { shown: false };
  }

  const tag = tagFor(request);
  activeByTag.get(tag)?.close();

  const notification = new Notification({
    title: request.title,
    body: request.body,
    icon: notificationIconPath(),
    silent: false,
    urgency: request.kind === "incoming-call" ? "critical" : "normal",
  });

  notification.on("click", () => {
    const window =
      BrowserWindow.getAllWindows().find((item) => !item.isDestroyed()) ?? null;
    if (!window) {
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();

    if (!window.webContents.isDestroyed()) {
      window.webContents.send(NOTIFICATION_ACTIVATED_CHANNEL, {
        kind: request.kind,
        peerUserId: request.peerUserId ?? null,
        lobbyId: request.lobbyId ?? null,
      });
    }
  });

  notification.on("close", () => {
    if (activeByTag.get(tag) === notification) {
      activeByTag.delete(tag);
    }
  });

  activeByTag.set(tag, notification);
  notification.show();

  return { shown: true };
};

// Called on sign-out and at quit: a toast outliving the session it belongs to
// would open a conversation the user is no longer signed in to.
export const clearDesktopNotifications = (): void => {
  for (const notification of activeByTag.values()) {
    notification.close();
  }
  activeByTag.clear();
};
