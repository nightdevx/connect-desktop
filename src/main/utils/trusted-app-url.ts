import { devServerUrl } from "./is-dev";

// The only pages this app may ever render: the packaged renderer bundle, and
// the Vite dev server in a development run.
export const isTrustedAppUrl = (rawUrl: string): boolean => {
  if (!rawUrl) {
    return false;
  }

  if (devServerUrl && rawUrl.startsWith(devServerUrl)) {
    return true;
  }

  return rawUrl.startsWith("file://");
};
