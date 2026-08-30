import type { RulesGunline } from "../difficulty";

export type GunlineMode = "campaign" | "endless";

export type RunPhase = "ready" | "corridor" | "wave" | "upgrade" | "won" | "over";

export type TerrainId = "range" | "desert" | "urban" | "forest" | "snow" | "industrial";

export type EnemyKind =
  | "militia"
  | "infantry"
  | "heavy"
  | "marksman"
  | "sapper"
  | "drone"
  | "apc"
  | "mortar"
  | "medic"
  | "shield"
  | "jammer"
  | "commander";

export type SquadClass = "rifleman" | "sniper" | "gunner" | "grenadier" | "medic" | "engineer";

export type WeaponId =
  | "pistol"
  | "smg"
  | "shotgun"
  | "rifle"
  | "lmg"
  | "dmr"
  | "launcher"
  | "rail";

export type AttachmentSlot = "barrel" | "mag" | "optic";

export type AbilityId = "airstrike" | "mortar" | "smoke" | "reinforce" | "adrenaline";

export type GateKind = "add" | "mul" | "class" | "weapon" | "ammo" | "armor" | "mine" | "toll";

export type ObjectiveId = "hold" | "noleak" | "timed" | "convoy" | "zone" | "extract";

export type ModifierId = "night" | "sandstorm" | "scarce" | "fog" | "rain" | "surge";

export type EffectKind =
  | "muzzle"
  | "impact"
  | "kill"
  | "gate"
  | "leak"
  | "blast"
  | "hurt"
  | "heal"
  | "ability"
  | "shield"
  | "jam"
  | "star";

export type Roster = Record<SquadClass, number>;

export interface GunlineEnemy {
  id: number;
  kind: EnemyKind;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
  speed: number;
  scale: number;
  wobble: number;
  fireAt: number;
  supportAt: number;
  slowUntil: number;
  shieldUntil: number;
  hitAt: number;
  dyingAt: number;
  bounty: number;
}

export interface GunlineBullet {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  pierce: number;
  aoe: number;
  hostile: boolean;
  crit: boolean;
  air: boolean;
}

export interface GunlineGate {
  id: number;
  x: number;
  z: number;
  kind: GateKind;
  value: number;
  payload: string;
  charge: number;
  good: boolean;
  locked: boolean;
}

export interface GunlineStrike {
  id: number;
  x: number;
  z: number;
  radius: number;
  damage: number;
  landsAt: number;
  hostile: boolean;
}

export interface GunlineEffect {
  kind: EffectKind;
  x: number;
  z: number;
  value: number;
  at: number;
}

export interface GunlineWeapon {
  id: WeaponId;
  label: string;
  detail: string;
  tier: number;
  damage: number;
  interval: number;
  pellets: number;
  spread: number;
  speed: number;
  pierce: number;
  aoe: number;
  antiAir: boolean;
  cost: number;
}

export interface GunlineAttachment {
  id: string;
  slot: AttachmentSlot;
  label: string;
  detail: string;
  cost: number;
  damage: number;
  fireRate: number;
  pellets: number;
  pierce: number;
  crit: number;
  spread: number;
}

export interface GunlineMods {
  damage: number;
  fireRate: number;
  pellets: number;
  pierce: number;
  crit: number;
  aoe: number;
  slow: boolean;
  explosive: boolean;
  antiAir: boolean;
  loot: number;
}

export interface AbilitySpec {
  id: AbilityId;
  label: string;
  detail: string;
  cooldown: number;
  duration: number;
  radius: number;
  power: number;
  aimed: boolean;
}

export interface AbilityRuntime {
  id: AbilityId;
  readyAt: number;
  activeUntil: number;
}

export interface GunlineUpgrade {
  id: string;
  label: string;
  detail: string;
  rarity: "common" | "rare" | "epic";
}

export interface WaveScript {
  kinds: readonly EnemyKind[];
  count: number;
  interval: number;
  healthScale: number;
  boss: EnemyKind | null;
}

export interface CorridorScript {
  rows: number;
  spacing: number;
}

export interface Objective {
  kind: ObjectiveId;
  value: number;
}

export interface LevelReward {
  supplies: number;
  ammo: number;
  credits: number;
  xp: number;
}

export interface GunlineLevel {
  id: number;
  chapter: number;
  name: string;
  terrain: TerrainId;
  objective: Objective;
  corridor: CorridorScript;
  waves: readonly WaveScript[];
  modifiers: readonly ModifierId[];
  stars: { two: number; three: number };
  reward: LevelReward;
}

export interface MetaBonus {
  damage: number;
  fireRate: number;
  crit: number;
  startUnits: number;
  revive: number;
  abilitySlots: number;
  cooldown: number;
  loot: number;
  gateCharge: number;
  ammoIncome: number;
}

export interface Loadout {
  weapon: WeaponId;
  attachments: string[];
  abilities: AbilityId[];
}

export interface GunlineProfile {
  version: number;
  xp: number;
  supplies: number;
  ammo: number;
  credits: number;
  stars: Record<string, number>;
  best: Record<string, number>;
  upgrades: Record<string, number>;
  weapons: WeaponId[];
  attachments: string[];
  loadout: Loadout;
  medals: string[];
  missionDay: string;
  missionProgress: Record<string, number>;
  missionClaimed: string[];
  totals: {
    runs: number;
    kills: number;
    bosses: number;
    levels: number;
    leaks: number;
    perfect: number;
  };
}

export interface RunSummary {
  levelId: number;
  won: boolean;
  score: number;
  kills: number;
  leaks: number;
  bosses: number;
  units: number;
  seconds: number;
  stars: number;
  goodGates: number;
  reward: LevelReward;
}

export interface GunlineState {
  mode: GunlineMode;
  phase: RunPhase;
  time: number;
  level: GunlineLevel | null;
  terrain: TerrainId;
  modifiers: readonly ModifierId[];
  wave: number;
  waveCount: number;
  playerX: number;
  roster: Roster;
  armor: number;
  score: number;
  kills: number;
  leaks: number;
  bosses: number;
  supplies: number;
  goodGates: number;
  streak: number;
  streakUntil: number;
  weapon: GunlineWeapon;
  mods: GunlineMods;
  abilities: AbilityRuntime[];
  jammedUntil: number;
  fireTimer: number;
  spawnTimer: number;
  spawnsLeft: number;
  spawnInterval: number;
  waveSize: number;
  waveKinds: readonly EnemyKind[];
  waveHealthScale: number;
  waveBoss: EnemyKind | null;
  gateDropped: boolean;
  corridorLeft: number;
  corridorTimer: number;
  zoneTimer: number;
  convoyHealth: number;
  extractLeft: number;
  enemies: GunlineEnemy[];
  bullets: GunlineBullet[];
  gates: GunlineGate[];
  strikes: GunlineStrike[];
  effects: GunlineEffect[];
  offer: GunlineUpgrade[];
  rules: RulesGunline;
  bonus: MetaBonus;
  seed: number;
  nextId: number;
}
