import { Menu } from "electron";
import { isDev } from "../utils/is-dev";

interface AppMenuActions {
  checkForUpdates?: () => Promise<void>;
  installDownloadedUpdate?: () => Promise<void>;
}

export function createAppMenu(actions?: AppMenuActions): void {
  // On macOS this bar is drawn, and it is where Cmd+C/V/X/A/Z, Cmd+M, Cmd+H,
  // Cmd+W and Cmd+Q live: without the Edit menu no text field could be copied
  // from or pasted into. The roles are Electron's stock macOS menus.
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          { role: "appMenu" as const },
          { role: "fileMenu" as const },
          { role: "editMenu" as const },
        ]
      : [
          {
            label: "File",
            submenu: [{ role: "quit" as const }],
          },
        ]),
    // The window is frameless, so this bar is never drawn — but its
    // accelerators stay live. Shipping `reload` meant a user in a call who hit
    // Ctrl+R (a browser reflex) tore down the LiveKit room, all three sockets
    // and any in-flight screen share with no confirmation, and Ctrl+Shift+I
    // opened DevTools in a release build. index.ts already gates its own F12
    // binding behind isDev; this matches it.
    ...(isDev
      ? [
          {
            label: "View",
            submenu: [
              { role: "reload" as const },
              { role: "toggleDevTools" as const },
            ],
          },
        ]
      : []),
    ...(isMac ? [{ role: "windowMenu" as const }] : []),
    {
      label: "Help",
      submenu: [
        // Only macOS draws these labels. There an update is downloaded by
        // hand, and the second item opens its download page.
        {
          label: "Güncellemeleri denetle",
          click: () => {
            void actions?.checkForUpdates?.();
          },
        },
        {
          label: isMac ? "Güncellemeyi indir" : "İndirilen güncellemeyi kur",
          click: () => {
            void actions?.installDownloadedUpdate?.();
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
