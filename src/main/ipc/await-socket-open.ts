import type WebSocket from "ws";
import { DesktopApiError } from "../backend-client";
import { statusFromSocketError } from "../auth-failure";

// Resolves when the socket opens; rejects if it errors or closes first.
//
// The three stream managers used to return `{started:true}` synchronously, at
// the moment the socket was constructed. The renderer read that as success and
// reset its reconnect backoff counter, so the counter never advanced past
// attempt 0 and the exponential backoff was effectively a fixed ~1s retry —
// against a backend that was, by definition, down.
// The three stream routes authenticate at the upgrade, so an expired access
// token fails the handshake with a real HTTP 401 — which `ws` reports as a
// plain error whose message carries the status and nothing else.
//
// Reporting that as 503 like any other connection failure hid it from
// withAccessToken, whose refresh branch keys on 401. The socket layer could
// therefore never refresh: the managers retried at their backoff cap forever,
// each attempt stamping the same expired token into the query string, and the
// session only recovered if some unrelated IPC call happened to refresh it.
//
// Parsing the message is not elegant, but the alternative — subscribing to
// `unexpected-response` — suppresses the `error` event entirely and makes this
// function responsible for tearing the half-open request down.
export const awaitSocketOpen = (
  socket: WebSocket,
  code: string,
  label: string,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const onOpen = (): void => {
      socket.off("error", onError);
      socket.off("close", onClose);
      resolve();
    };

    const onError = (error: Error): void => {
      socket.off("open", onOpen);
      socket.off("close", onClose);
      const statusCode = statusFromSocketError(error?.message);
      reject(
        new DesktopApiError(
          statusCode === 401 ? "UNAUTHORIZED" : code,
          statusCode,
          error?.message || `${label} could not connect`,
        ),
      );
    };

    const onClose = (): void => {
      socket.off("open", onOpen);
      socket.off("error", onError);
      reject(
        new DesktopApiError(code, 503, `${label} closed before connecting`),
      );
    };

    socket.once("open", onOpen);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
