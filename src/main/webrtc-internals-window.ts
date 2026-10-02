import { BrowserWindow } from "electron";

// chrome://webrtc-internals, for support: every PeerConnection in the app with
// its candidates, the selected pair, codecs and per-second graphs, and a button
// that saves all of it to a file somebody can send. It opens in the default
// session, the one the main window's calls live in -- that is what lets it see
// them -- with no preload and nothing it can open or navigate to.
let internalsWindow: BrowserWindow | null = null;

export const openWebRtcInternalsWindow = (): void => {
  if (internalsWindow && !internalsWindow.isDestroyed()) {
    if (internalsWindow.isMinimized()) {
      internalsWindow.restore();
    }
    internalsWindow.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.on("closed", () => {
    internalsWindow = null;
  });
  internalsWindow = win;
  void win.loadURL("chrome://webrtc-internals");
};
