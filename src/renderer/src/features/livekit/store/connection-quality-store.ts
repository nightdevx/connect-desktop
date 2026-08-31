import { create } from "zustand";

export type ParticipantConnectionQuality =
  | "excellent"
  | "good"
  | "poor"
  | "lost"
  | "unknown";

export type ConnectionQualityMap = Record<string, ParticipantConnectionQuality>;

const EMPTY: ConnectionQualityMap = {};

interface ConnectionQualityState {
  qualityByIdentity: ConnectionQualityMap;
  setQuality: (identity: string, quality: ParticipantConnectionQuality) => void;
  removeParticipant: (identity: string) => void;
  reset: () => void;
}

export const useConnectionQualityStore = create<ConnectionQualityState>(
  (set) => ({
    qualityByIdentity: EMPTY,
    setQuality: (identity, quality) =>
      set((state) =>
        state.qualityByIdentity[identity] === quality
          ? state
          : {
              qualityByIdentity: {
                ...state.qualityByIdentity,
                [identity]: quality,
              },
            },
      ),
    removeParticipant: (identity) =>
      set((state) => {
        if (!(identity in state.qualityByIdentity)) {
          return state;
        }
        const next = { ...state.qualityByIdentity };
        delete next[identity];
        return { qualityByIdentity: next };
      }),
    reset: () =>
      set((state) =>
        Object.keys(state.qualityByIdentity).length === 0
          ? state
          : { qualityByIdentity: EMPTY },
      ),
  }),
);

export const useConnectionQuality = (
  identity: string | null | undefined,
): ParticipantConnectionQuality =>
  useConnectionQualityStore((state) =>
    identity ? (state.qualityByIdentity[identity] ?? "unknown") : "unknown",
  );
