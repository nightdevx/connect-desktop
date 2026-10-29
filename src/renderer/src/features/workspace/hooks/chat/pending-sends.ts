import { createStore } from "zustand/vanilla";
import type { ChatMessage } from "@shared/auth-contracts";

// Messages on screen before the server has them.
//
// A send used to show nothing until the server answered, and a retry after a
// timeout could post the same message twice. Now a message is shown at once as
// "sending", carries a clientNonce the server echoes (it answers a repeat of
// the nonce with the first message, not a second copy), and is matched to the
// server's copy by that nonce, whichever arrives first: the reply or the
// socket's event. A send that fails stays on screen as "failed" with a retry,
// which sends the same nonce again.
//
// Kept outside React (a vanilla store) so the lobby and DM hooks share one
// queue each per conversation, the rows can call retry and discard without
// threading callbacks through four components, and the self-check can drive
// it without a renderer.

export type SendState = "sending" | "failed";

export interface PendingSend {
  nonce: string;
  // The conversation: "lobby:<id>" or "dm:<peerUserId>".
  scope: string;
  message: ChatMessage;
  state: SendState;
}

// Resolves true once the server has the message (and the caller has put the
// server's copy in its cache), false when the send failed.
export type Send = () => Promise<boolean>;

export const PENDING_ID_PREFIX = "pending:";

export const pendingSends = createStore<{ sends: PendingSend[] }>(() => ({ sends: [] }));

const senders = new Map<string, Send>();
// One conversation's sends go out one after another, in the order they were
// written: two in flight at once could reach the server the other way round.
const queues = new Map<string, Promise<void>>();

const update = (nonce: string, state: SendState): void =>
  pendingSends.setState(({ sends }) => ({
    sends: sends.map((send) => (send.nonce === nonce ? { ...send, state } : send)),
  }));

export const discardSend = (nonce: string): void => {
  senders.delete(nonce);
  pendingSends.setState(({ sends }) => ({ sends: sends.filter((send) => send.nonce !== nonce) }));
};

const run = (scope: string, nonce: string): Promise<void> => {
  const send = senders.get(nonce);
  if (!send) {
    return Promise.resolve();
  }
  update(nonce, "sending");
  const next = (queues.get(scope) ?? Promise.resolve())
    .then(() => send().catch(() => false))
    .then((sent) => {
      if (!senders.has(nonce)) {
        return; // Discarded meanwhile.
      }
      if (sent) {
        discardSend(nonce);
      } else {
        update(nonce, "failed");
      }
    });
  queues.set(scope, next);
  return next;
};

export const newClientNonce = (): string => crypto.randomUUID();

/** Shows `message` (built by pendingMessage) at once and sends it. */
export const startSend = (scope: string, message: ChatMessage, send: Send): Promise<void> => {
  const nonce = message.clientNonce ?? "";
  senders.set(nonce, send);
  pendingSends.setState(({ sends }) => ({
    sends: [...sends, { nonce, scope, message, state: "sending" }],
  }));
  return run(scope, nonce);
};

/** Sends a failed message again, with the nonce it first went out with. */
export const retrySend = (nonce: string): Promise<void> => {
  const pending = pendingSends.getState().sends.find((send) => send.nonce === nonce);
  return pending?.state === "failed" ? run(pending.scope, nonce) : Promise.resolve();
};

/** What a message looks like before the server has numbered and stamped it. */
export const pendingMessage = (fields: {
  nonce: string;
  channel: string;
  userId: string;
  username: string;
  body: string;
  replyTo?: ChatMessage | null;
}): ChatMessage => ({
  id: `${PENDING_ID_PREFIX}${fields.nonce}`,
  channel: fields.channel,
  userId: fields.userId,
  username: fields.username,
  body: fields.body,
  createdAt: new Date().toISOString(),
  replyTo: fields.replyTo
    ? {
        id: fields.replyTo.id,
        userId: fields.replyTo.userId,
        username: fields.replyTo.username,
        body: fields.replyTo.body,
      }
    : null,
  clientNonce: fields.nonce,
});

/**
 * The server's messages, then this conversation's sends the server has not
 * echoed yet (no message carries their nonce), marked with their state.
 * Returns the same array when there is nothing to add.
 */
export const withPendingMessages = (
  messages: ChatMessage[],
  sends: readonly PendingSend[],
  scope: string,
): ChatMessage[] => {
  const mine = sends.filter((send) => send.scope === scope);
  if (mine.length === 0) {
    return messages;
  }
  const echoed = new Set(messages.map((message) => message.clientNonce).filter(Boolean));
  const shown = mine
    .filter((send) => !echoed.has(send.nonce))
    .map((send) => ({ ...send.message, localState: send.state }));
  return shown.length === 0 ? messages : [...messages, ...shown];
};
