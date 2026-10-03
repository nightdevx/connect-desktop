import {
  ExternalE2EEKeyProvider,
  RoomEvent,
  type Participant,
  type RemoteParticipant,
  type Room,
} from "livekit-client";
import E2EEWorker from "livekit-client/e2ee-worker?worker";

/**
 * End-to-end encryption for 1:1 calls.
 *
 * Every frame of a call room's audio, video and screen share is encrypted in
 * the sender's browser and decrypted only in the other party's: the media
 * server forwards bytes it cannot read. The key never travels. Each side makes
 * a fresh X25519 key pair for the call and publishes only the public half, as a
 * LiveKit participant attribute; both sides derive the same 256-bit key from
 * their own private key and the other's public one (ECDH, then HKDF-SHA-256
 * with the call id as salt).
 *
 * A server that swapped the public keys in transit could sit in the middle; the
 * safety code (a hash of both public keys, the same on both screens) is what
 * lets two people rule that out by reading it to each other.
 *
 * Encryption is switched on right after connecting, before anything is
 * published: publishing first and enabling later makes LiveKit republish every
 * track. Until the key exists the sender's frames are dropped, never sent in
 * the clear. Both sides must run a build with this; that is why the release
 * that ships it raises the minimum version.
 */

export const CALL_E2EE_ATTRIBUTE = "ct.e2ee";
const KEY_INFO = new TextEncoder().encode("connect call e2ee v1");

export interface CallEncryptionState {
  /** True once both sides hold the key and media is encrypted. */
  encrypted: boolean;
  /** Nine digits both parties see identically, in groups of three. */
  safetyCode: string | null;
}

const toBase64 = (buffer: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const createCallKeyPair = async (): Promise<CryptoKeyPair> =>
  (await crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"])) as CryptoKeyPair;

export const exportCallPublicKey = async (pair: CryptoKeyPair): Promise<string> =>
  toBase64(await crypto.subtle.exportKey("raw", pair.publicKey));

/** The call's 256-bit media key, identical on both sides. */
export const deriveCallKey = async (
  privateKey: CryptoKey,
  peerPublicKey: string,
  callId: string,
): Promise<ArrayBuffer> => {
  const peer = await crypto.subtle.importKey(
    "raw",
    fromBase64(peerPublicKey),
    { name: "X25519" },
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits({ name: "X25519", public: peer }, privateKey, 256);
  const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode(callId), info: KEY_INFO },
    material,
    256,
  );
};

/** Order-independent, so both parties compute the same digits. */
export const callSafetyCode = async (publicA: string, publicB: string): Promise<string> => {
  const [first, second] = [publicA, publicB].sort();
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${first}|${second}`)),
  );
  const value = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
  return String(value % 1_000_000_000)
    .padStart(9, "0")
    .replace(/(\d{3})(?=\d)/g, "$1 ");
};

/** What a call room is created with: the key slot and the worker that uses it. */
export const createCallEncryptionOptions = (): {
  keyProvider: ExternalE2EEKeyProvider;
  worker: Worker;
} => ({
  keyProvider: new ExternalE2EEKeyProvider(),
  worker: new E2EEWorker(),
});

/**
 * Turns encryption on for a freshly connected call room and runs the key
 * exchange: publishes this side's public key and derives the media key when the
 * other side's appears -- again whenever it changes (they rejoined). Returns
 * the cleanup.
 */
export const startCallEncryption = async (
  room: Room,
  keyProvider: ExternalE2EEKeyProvider,
  callId: string,
  onState: (state: CallEncryptionState) => void,
): Promise<() => void> => {
  await room.setE2EEEnabled(true);
  onState({ encrypted: false, safetyCode: null });

  const pair = await createCallKeyPair();
  const ownPublicKey = await exportCallPublicKey(pair);
  let peerPublicKey: string | null = null;
  let disposed = false;

  const adopt = async (participant: Participant): Promise<void> => {
    const value = participant.attributes?.[CALL_E2EE_ATTRIBUTE];
    if (disposed || !value || value === peerPublicKey || participant === room.localParticipant) {
      return;
    }
    peerPublicKey = value;
    const key = await deriveCallKey(pair.privateKey, value, callId);
    if (disposed || peerPublicKey !== value) {
      return;
    }
    await keyProvider.setKey(key);
    onState({ encrypted: true, safetyCode: await callSafetyCode(ownPublicKey, value) });
  };

  const onAttributes = (_changed: Record<string, string>, participant: Participant): void => {
    void adopt(participant);
  };
  const onConnected = (participant: RemoteParticipant): void => {
    void adopt(participant);
  };
  room.on(RoomEvent.ParticipantAttributesChanged, onAttributes);
  room.on(RoomEvent.ParticipantConnected, onConnected);

  await room.localParticipant.setAttributes({ [CALL_E2EE_ATTRIBUTE]: ownPublicKey });
  room.remoteParticipants.forEach((participant) => {
    void adopt(participant);
  });

  return () => {
    disposed = true;
    room.off(RoomEvent.ParticipantAttributesChanged, onAttributes);
    room.off(RoomEvent.ParticipantConnected, onConnected);
  };
};
