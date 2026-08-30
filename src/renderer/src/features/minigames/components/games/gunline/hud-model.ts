import {
  ABILITIES,
  abilityReady,
  objectiveProgress,
  squadSize,
  type AbilityId,
  type GunlineState,
  type GunlineUpgrade,
  type Roster,
  type RunPhase,
} from "../../../gunline";

export interface GunlineHud {
  phase: RunPhase;
  wave: number;
  waveCount: number;
  units: number;
  roster: Roster;
  armor: number;
  score: number;
  kills: number;
  leaks: number;
  supplies: number;
  goodGates: number;
  remaining: number;
  weapon: string;
  streak: number;
  jammed: boolean;
  objective: { label: string; ratio: number };
  abilities: { id: AbilityId; label: string; ready: number }[];
  offer: GunlineUpgrade[];
}

export function snapshot(state: GunlineState): GunlineHud {
  return {
    phase: state.phase,
    wave: state.wave,
    waveCount: Number.isFinite(state.waveCount) ? state.waveCount : 0,
    units: squadSize(state.roster),
    roster: { ...state.roster },
    armor: Math.round(state.armor),
    score: state.score,
    kills: state.kills,
    leaks: state.leaks,
    supplies: Math.round(state.supplies),
    goodGates: state.goodGates,
    remaining: state.spawnsLeft + state.enemies.filter((enemy) => enemy.dyingAt === 0).length,
    weapon: state.weapon.label,
    streak: state.streak,
    jammed: state.time < state.jammedUntil,
    objective: objectiveProgress(state),
    abilities: state.abilities.map((ability) => ({
      id: ability.id,
      label: ABILITIES[ability.id].label,
      ready: abilityReady(state, ability.id),
    })),
    offer: state.offer,
  };
}

export function bannerFor(hud: GunlineHud, gates: boolean): string {
  if (hud.phase === "ready") {
    return "HAZIR OL";
  }
  if (hud.phase === "corridor") {
    return gates ? "ŞERİDİNİ SEÇ" : "MÜFREZENİ BÜYÜT";
  }
  if (hud.phase === "upgrade") {
    return "DALGA TEMİZ";
  }
  if (hud.phase === "won") {
    return "GÖREV TAMAM";
  }
  if (hud.phase === "over") {
    return "HAT DÜŞTÜ";
  }
  if (hud.streak >= 8) {
    return `${hud.streak} SERİ`;
  }
  return "HATTI TUT";
}
