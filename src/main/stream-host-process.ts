import { net } from "electron";
import { createStreamHost } from "./ipc/stream-host";
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
// The backend's address is the one argument. The access token comes with each
// start; nothing here reads the session store.

const backendBaseUrl = process.argv[2] ?? "";

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
);

process.parentPort.on("message", (event) => {
  handle(event.data as StreamHostRequest, event.ports);
});
