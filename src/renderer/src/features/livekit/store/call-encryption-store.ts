import { create } from "zustand";
import type { CallEncryptionState } from "../services/stream/call-e2ee";

// The current call's encryption state, for the call header's lock and safety
// code. null outside a call. A store rather than React state for the same
// reason as the screen watchers: one small corner of the UI reads it.
interface CallEncryptionStoreState {
  encryption: CallEncryptionState | null;
  setEncryption: (encryption: CallEncryptionState | null) => void;
}

export const useCallEncryptionStore = create<CallEncryptionStoreState>((set) => ({
  encryption: null,
  setEncryption: (encryption) => set({ encryption }),
}));
