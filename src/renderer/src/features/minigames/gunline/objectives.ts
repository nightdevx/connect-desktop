import { squadSize } from "./squad";
import type { GunlineState, Objective, RunSummary } from "./types";

export function objectiveDetail(objective: Objective): string {
  switch (objective.kind) {
    case "hold":
      return "Bütün dalgaları temizle.";
    case "noleak":
      return "Hattı delme sayısı sınırlı.";
    case "timed":
      return "Süre dolmadan bitir.";
    case "convoy":
      return "Sızan her düşman konvoyu yaralar.";
    case "zone":
      return "Orta şeritte kalmadan sayaç işlemez.";
    case "extract":
      return "Tahliye gelene kadar dayan.";
    default:
      return "";
  }
}

export function objectiveProgress(state: GunlineState): { label: string; ratio: number } {
  const objective = state.level?.objective;
  if (!objective) {
    return { label: `${state.wave}. dalga`, ratio: 0 };
  }

  switch (objective.kind) {
    case "timed": {
      const left = Math.max(0, objective.value - state.time);
      return { label: `${Math.ceil(left)} sn`, ratio: 1 - left / objective.value };
    }
    case "zone":
      return {
        label: `${Math.floor(state.zoneTimer)}/${objective.value} sn`,
        ratio: state.zoneTimer / objective.value,
      };
    case "extract":
      return {
        label: `${Math.ceil(state.extractLeft)} sn`,
        ratio: 1 - state.extractLeft / objective.value,
      };
    case "convoy":
      return {
        label: `konvoy %${Math.max(0, Math.round(state.convoyHealth))}`,
        ratio: 1 - state.convoyHealth / 100,
      };
    case "noleak":
      return {
        label: `${state.leaks}/${objective.value} sızma`,
        ratio: state.wave / Math.max(1, state.waveCount),
      };
    default:
      return {
        label: `${state.wave}/${state.waveCount} dalga`,
        ratio: state.wave / Math.max(1, state.waveCount),
      };
  }
}

export function objectiveFailed(state: GunlineState): boolean {
  const objective = state.level?.objective;
  if (!objective) {
    return false;
  }

  switch (objective.kind) {
    case "noleak":
      return state.leaks > objective.value;
    case "timed":
      return state.time > objective.value;
    case "convoy":
      return state.convoyHealth <= 0;
    default:
      return false;
  }
}

export function objectiveMet(state: GunlineState, wavesCleared: boolean): boolean {
  const objective = state.level?.objective;
  if (!objective) {
    return wavesCleared;
  }

  switch (objective.kind) {
    case "zone":
      return state.zoneTimer >= objective.value;
    case "extract":
      return state.extractLeft <= 0;
    case "noleak":
      return wavesCleared && state.leaks <= objective.value;
    default:
      return wavesCleared;
  }
}

export function starsFor(state: GunlineState, won: boolean): number {
  if (!won || !state.level) {
    return 0;
  }
  let stars = 1;
  if (state.score >= state.level.stars.two) {
    stars += 1;
  }
  if (state.score >= state.level.stars.three && state.leaks <= 1) {
    stars += 1;
  }
  return stars;
}

export function summarise(state: GunlineState, won: boolean, stars: number): RunSummary {
  return {
    levelId: state.level?.id ?? 0,
    won,
    score: state.score,
    kills: state.kills,
    leaks: state.leaks,
    bosses: state.bosses,
    units: squadSize(state.roster),
    seconds: Math.round(state.time),
    stars,
    goodGates: state.goodGates,
    reward: state.level?.reward ?? { supplies: 0, ammo: 0, credits: 0, xp: 0 },
  };
}
