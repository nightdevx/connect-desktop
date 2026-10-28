// What main, the stream host (an Electron utility process that holds the
// renderer's stream sockets) and each page say to one another.
//
//   main -> host   StreamHostRequest, over the utility process's parentPort
//   host -> main   StreamHostReply, the same way
//   host -> page   StreamPortMessage, over a MessagePort main hands each page
//
// The access token travels main -> host inside "start" and nowhere else: the
// host never reads the session store, and the page's port only ever carries
// stream events out.

export type StreamKind = "lobby" | "users" | "dm";

export type StreamHostRequest =
  // A page's end of its port rides along as the message's one transfer. Sent
  // for every page load, so a reload replaces the port of the page it unloaded.
  | { type: "attach"; senderId: number }
  | { type: "start"; id: number; kind: StreamKind; senderId: number; accessToken: string }
  | { type: "stop"; kind: StreamKind; senderId: number }
  | { type: "stop-all" }
  | { type: "probe" }
  // The page's webContents is gone: its sockets close and its port is dropped.
  | { type: "sender-gone"; senderId: number };

/** A failed start, carried as fields: an Error does not survive the port. */
export interface StreamHostError {
  code: string;
  statusCode: number;
  message: string;
}

export type StreamHostReply = { type: "started"; id: number; error?: StreamHostError };

/** One stream event for a page, addressed by the IPC channel it used to use. */
export interface StreamPortMessage {
  channel: string;
  payload: unknown;
}
