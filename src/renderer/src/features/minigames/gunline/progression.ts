import { PROFILE_VERSION } from "./tuning";
import { WEAPONS } from "./weapons";
import type { GunlineProfile, MetaBonus, WeaponId } from "./types";

export type MetaBranch = "firepower" | "manpower" | "gear" | "logistics";

export interface MetaNodeCost {
  supplies: number;
  ammo: number;
  credits: number;
}

export interface MetaNode {
  id: string;
  branch: MetaBranch;
  label: string;
  detail: string;
  max: number;
  requires: string | null;
  cost: (level: number) => MetaNodeCost;
  apply: (bonus: MetaBonus, level: number) => void;
}

export const META_BRANCHES: Record<MetaBranch, { label: string; detail: string }> = {
  firepower: { label: "Ateş Gücü", detail: "Hasar, kritik, delme." },
  manpower: { label: "İnsan Gücü", detail: "Başlangıç mevcudu ve kayıp telafisi." },
  gear: { label: "Teçhizat", detail: "Yetenek yuvası ve soğuma." },
  logistics: { label: "Lojistik", detail: "Ganimet, kapı şarjı, mühimmat." },
};

const cost = (supplies: number, ammo: number, credits: number) => (level: number): MetaNodeCost => ({
  supplies: Math.round(supplies * Math.pow(1.55, level)),
  ammo: Math.round(ammo * Math.pow(1.55, level)),
  credits: credits === 0 ? 0 : Math.round(credits * Math.pow(1.35, level)),
});

export const META_NODES: readonly MetaNode[] = [
  {
    id: "fp-damage",
    branch: "firepower",
    label: "Namlu Aşınması",
    detail: "Kademe başına hasar +%8.",
    max: 5,
    requires: null,
    cost: cost(140, 60, 0),
    apply: (bonus, level) => {
      bonus.damage *= 1 + level * 0.08;
    },
  },
  {
    id: "fp-rate",
    branch: "firepower",
    label: "Tetik Eğitimi",
    detail: "Kademe başına atış hızı +%6.",
    max: 5,
    requires: "fp-damage",
    cost: cost(180, 90, 0),
    apply: (bonus, level) => {
      bonus.fireRate *= 1 + level * 0.06;
    },
  },
  {
    id: "fp-crit",
    branch: "firepower",
    label: "Nişan Talimi",
    detail: "Kademe başına kritik +%4.",
    max: 5,
    requires: "fp-rate",
    cost: cost(220, 140, 2),
    apply: (bonus, level) => {
      bonus.crit += level * 0.04;
    },
  },
  {
    id: "mp-start",
    branch: "manpower",
    label: "Kadro Mevcudu",
    detail: "Kademe başına +1 başlangıç eri.",
    max: 5,
    requires: null,
    cost: cost(160, 40, 0),
    apply: (bonus, level) => {
      bonus.startUnits += level;
    },
  },
  {
    id: "mp-revive",
    branch: "manpower",
    label: "Sahra Hastanesi",
    detail: "Dalga sonunda kademe başına +1 er döner.",
    max: 4,
    requires: "mp-start",
    cost: cost(260, 80, 1),
    apply: (bonus, level) => {
      bonus.revive += level;
    },
  },
  {
    id: "gear-slot",
    branch: "gear",
    label: "Teçhizat Yuvası",
    detail: "Kademe başına +1 yetenek yuvası.",
    max: 2,
    requires: null,
    cost: cost(400, 260, 6),
    apply: (bonus, level) => {
      bonus.abilitySlots += level;
    },
  },
  {
    id: "gear-cooldown",
    branch: "gear",
    label: "Telsiz Ağı",
    detail: "Kademe başına yetenek soğuması -%7.",
    max: 5,
    requires: "gear-slot",
    cost: cost(300, 180, 2),
    apply: (bonus, level) => {
      bonus.cooldown *= 1 - level * 0.07;
    },
  },
  {
    id: "log-loot",
    branch: "logistics",
    label: "İkmal Kolu",
    detail: "Kademe başına ganimet +%10.",
    max: 5,
    requires: null,
    cost: cost(150, 70, 0),
    apply: (bonus, level) => {
      bonus.loot *= 1 + level * 0.1;
    },
  },
  {
    id: "log-gate",
    branch: "logistics",
    label: "Kapı Sökümü",
    detail: "Kademe başına kapı şarjı +%12.",
    max: 5,
    requires: "log-loot",
    cost: cost(210, 110, 1),
    apply: (bonus, level) => {
      bonus.gateCharge *= 1 + level * 0.12;
    },
  },
  {
    id: "log-ammo",
    branch: "logistics",
    label: "Cephanelik",
    detail: "Kademe başına mühimmat geliri +%12.",
    max: 5,
    requires: "log-gate",
    cost: cost(240, 130, 2),
    apply: (bonus, level) => {
      bonus.ammoIncome *= 1 + level * 0.12;
    },
  },
];

export function nodeById(id: string): MetaNode | null {
  return META_NODES.find((node) => node.id === id) ?? null;
}

export function nodesOfBranch(branch: MetaBranch): MetaNode[] {
  return META_NODES.filter((node) => node.branch === branch);
}

export function baseBonus(): MetaBonus {
  return {
    damage: 1,
    fireRate: 1,
    crit: 0,
    startUnits: 0,
    revive: 0,
    abilitySlots: 0,
    cooldown: 1,
    loot: 1,
    gateCharge: 1,
    ammoIncome: 1,
  };
}

export function bonusOf(profile: GunlineProfile): MetaBonus {
  const bonus = baseBonus();
  for (const node of META_NODES) {
    const level = profile.upgrades[node.id] ?? 0;
    if (level > 0) {
      node.apply(bonus, level);
    }
  }
  return bonus;
}

export function nodeUnlocked(profile: GunlineProfile, node: MetaNode): boolean {
  if (!node.requires) {
    return true;
  }
  return (profile.upgrades[node.requires] ?? 0) > 0;
}

export function canAfford(profile: GunlineProfile, price: MetaNodeCost): boolean {
  return (
    profile.supplies >= price.supplies &&
    profile.ammo >= price.ammo &&
    profile.credits >= price.credits
  );
}

export function abilitySlots(profile: GunlineProfile): number {
  return 2 + bonusOf(profile).abilitySlots;
}

export function weaponUnlocked(profile: GunlineProfile, weapon: WeaponId): boolean {
  return WEAPONS[weapon].cost === 0 || profile.weapons.includes(weapon);
}

export function createProfile(): GunlineProfile {
  return {
    version: PROFILE_VERSION,
    xp: 0,
    supplies: 0,
    ammo: 0,
    credits: 0,
    stars: {},
    best: {},
    upgrades: {},
    weapons: ["pistol"],
    attachments: [],
    loadout: { weapon: "pistol", attachments: [], abilities: ["airstrike", "reinforce"] },
    medals: [],
    missionDay: "",
    missionProgress: {},
    missionClaimed: [],
    totals: { runs: 0, kills: 0, bosses: 0, levels: 0, leaks: 0, perfect: 0 },
  };
}

export function highestLevel(profile: GunlineProfile): number {
  let highest = 0;
  for (const key of Object.keys(profile.stars)) {
    const id = Number.parseInt(key, 10);
    if (Number.isFinite(id) && profile.stars[key] > 0 && id > highest) {
      highest = id;
    }
  }
  return highest;
}

export function levelUnlocked(profile: GunlineProfile, levelId: number): boolean {
  return levelId === 1 || (profile.stars[`${levelId - 1}`] ?? 0) > 0;
}
