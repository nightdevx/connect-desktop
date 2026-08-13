import { Menu } from "electron";
import { isDev } from "../utils/is-dev";

interface AppMenuActions {
  checkForUpdates?: () => Promise<void>;
  installDownloadedUpdate?: () => Promise<void>;
}

export function createAppMenu(actions?: AppMenuActions): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
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
    {
      label: "Help",
      submenu: [
        {
          label: "Guncellemeleri denetle",
          click: () => {
            void actions?.checkForUpdates?.();
          },
        },
        {
          label: "Indirilen guncellemeyi kur",
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
