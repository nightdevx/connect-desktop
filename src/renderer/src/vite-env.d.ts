/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev only: "kullanici:parola,..." for the login page's quick buttons. */
  readonly VITE_DEV_QUICK_LOGIN?: string;
}
