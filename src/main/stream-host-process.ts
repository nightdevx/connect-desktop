import { basename } from "node:path";
import { net } from "electron";
import * as Sentry from "@sentry/electron/utility";
import { createStreamHost } from "./ipc/stream-host";
import { SENTRY_DATA_COLLECTION } from "../shared/sentry-data-collection";
import type { StreamHostRequest } from "../shared/stream-host-contracts";

// Entry point of the stream host: an Electron utility process that holds the
// renderer's lobby, user-directory and direct-message sockets, started and
// restarted by ipc/stream-host-client.ts.
//
// The sockets used to live in main, and main is also where windows, IPC, the
// updater and every REST call run. A stall there delayed every frame behind
// it: measured with main held for 500 ms, frames reached the page up to 500 ms
// late, all at once. Here they are parsed off main's thread and go to each page
// over a MessagePort main never touches.
//
// The arguments are the backend's address and main's User-Agent (the sockets
// send it; see StreamHub). The access token comes with each start; nothing
// here reads the session store.

// Errors here reach Sentry through main, under the same rule as main's own
// (index.ts): a DSN, and a packaged build. app is main-only, so packaged is
// worked out the way app.isPackaged does it. Before the parentPort listener
// below: the SDK filters its own messages out of that channel.
const isPackaged = !/^electron(\.exe)?$/i.test(basename(process.execPath));
if (process.env.SENTRY_DSN && isPackaged) {
  // Errors only: OpenTelemetry stays off (opt-in in @sentry/electron 8), and
  // the same restrictive data collection as main and the page.
  Sentry.init({ dataCollection: SENTRY_DATA_COLLECTION });
}

const backendBaseUrl = process.argv[2] ?? "";
const userAgent = process.argv[3] ?? "";

// Whether the backend itself is answering, for StreamHub's 404 rule. Through
// Chromium's network stack, like every other request the app makes.
const backendAnswers = async (): Promise<boolean> => {
  try {
    const response = await net.fetch(new URL("/healthz", backendBaseUrl).toString(), {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok && ((await response.json()) as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
};

const handle = createStreamHost(
  backendBaseUrl,
  (reply) => process.parentPort.postMessage(reply),
  backendAnswers,
  userAgent,
);

process.parentPort.on("message", (event) => {
  handle(event.data as StreamHostRequest, event.ports);
});
