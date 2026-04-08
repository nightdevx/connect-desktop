import { Menu } from "electron";

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
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }],
    },
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
