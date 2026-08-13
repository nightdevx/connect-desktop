import type WebSocket from "ws";
import { DesktopApiError } from "../backend-client";

// Resolves when the socket opens; rejects if it errors or closes first.
//
// The three stream managers used to return `{started:true}` synchronously, at
// the moment the socket was constructed. The renderer read that as success and
// reset its reconnect backoff counter, so the counter never advanced past
// attempt 0 and the exponential backoff was effectively a fixed ~1s retry —
// against a backend that was, by definition, down.
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
      reject(
        new DesktopApiError(
          code,
          503,
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
