import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { isTrustedAppUrl } from "../utils/trusted-app-url";

// Whether a message came from the app's own page. The preload only runs in
// that page's main frame, so nothing else should be able to reach ipcRenderer;
// this is the check that holds if that ever stops being true (a preload in a
// subframe, a navigation guard that misses a case). senderFrame is null once
// the frame has navigated away or gone, and that is refused too.
export const isTrustedSender = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
  isTrustedAppUrl(event.senderFrame?.url ?? "");

type InvokeListener = Parameters<typeof ipcMain.handle>[1];

/**
 * ipcMain.handle for the app's own page only. Every invoke channel is
 * registered through here (scripts/check-ipc-channels.cjs holds that); a call
 * from any other frame is rejected before the listener runs.
 */
export const handle = (channel: string, listener: InvokeListener): void => {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      console.warn(`[security] refused ${channel} from ${event.senderFrame?.url || "a frame that is gone"}`);
      throw new Error("IPC call refused: not the app's own page");
    }
    return listener(event, ...args);
  });
};
