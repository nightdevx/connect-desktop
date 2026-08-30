import {
  MAX_UNITS,
  UNIT_DRAW_CAP,
  UNIT_PER_ROW,
  UNIT_ROW_DEPTH,
  UNIT_SPACING,
} from "./tuning";
import type { Roster, SquadClass } from "./types";

export interface SquadClassSpec {
  label: string;
  detail: string;
  damage: number;
  fireRate: number;
  pierce: number;
  aoe: number;
  antiAir: boolean;
  row: number;
  heals: number;
  barrier: number;
  cost: number;
}

export const SQUAD_CLASSES: Record<SquadClass, SquadClassSpec> = {
  rifleman: {
    label: "Piyade",
    detail: "Temel er. Sayı üstünlüğü onun işi.",
    damage: 1,
    fireRate: 1,
    pierce: 0,
    aoe: 0,
    antiAir: false,
    row: 2,
    heals: 0,
    barrier: 0,
    cost: 0,
  },
  sniper: {
    label: "Keskin Nişancı",
    detail: "Yavaş ateş eder, zırhı umursamaz.",
    damage: 3.2,
    fireRate: 0.42,
    pierce: 2,
    aoe: 0,
    antiAir: true,
    row: 4,
    heals: 0,
    barrier: 0,
    cost: 6,
  },
  gunner: {
    label: "Makineli Er",
    detail: "Hasarı düşük, ateşi kesintisiz.",
    damage: 0.62,
    fireRate: 2.1,
    pierce: 0,
    aoe: 0,
    antiAir: true,
    row: 3,
    heals: 0,
    barrier: 0,
    cost: 5,
  },
  grenadier: {
    label: "Bombacı",
    detail: "Mermisi düştüğü yerde patlar.",
    damage: 1.5,
    fireRate: 0.55,
    pierce: 0,
    aoe: 1.7,
    antiAir: false,
    row: 3,
    heals: 0,
    barrier: 0,
    cost: 7,
  },
  medic: {
    label: "Sıhhiyeci",
    detail: "Dalga sonunda kayıpların bir kısmını geri getirir.",
    damage: 0.5,
    fireRate: 0.9,
    pierce: 0,
    aoe: 0,
    antiAir: false,
    row: 4,
    heals: 2,
    barrier: 0,
    cost: 8,
  },
  engineer: {
    label: "İstihkam",
    detail: "Hattın önüne zırh koyar.",
    damage: 0.7,
    fireRate: 0.8,
    pierce: 0,
    aoe: 0,
    antiAir: false,
    row: 1,
    heals: 0,
    barrier: 3,
    cost: 8,
  },
};

export const SQUAD_CLASS_ORDER: readonly SquadClass[] = [
  "engineer",
  "rifleman",
  "gunner",
  "grenadier",
  "sniper",
  "medic",
];

export function emptyRoster(): Roster {
  return { rifleman: 0, sniper: 0, gunner: 0, grenadier: 0, medic: 0, engineer: 0 };
}

export function createRoster(riflemen: number): Roster {
  const roster = emptyRoster();
  roster.rifleman = Math.max(0, Math.min(MAX_UNITS, Math.round(riflemen)));
  return roster;
}

export function squadSize(roster: Roster): number {
  let total = 0;
  for (const key of SQUAD_CLASS_ORDER) {
    total += roster[key];
  }
  return total;
}

export function addUnits(roster: Roster, amount: number, cls: SquadClass = "rifleman"): number {
  const before = squadSize(roster);
  if (amount >= 0) {
    const room = Math.max(0, MAX_UNITS - before);
    roster[cls] += Math.min(room, Math.round(amount));
    return squadSize(roster) - before;
  }

  let remaining = Math.round(-amount);
  for (let index = SQUAD_CLASS_ORDER.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const key = SQUAD_CLASS_ORDER[index];
    const taken = Math.min(roster[key], remaining);
    roster[key] -= taken;
    remaining -= taken;
  }
  return squadSize(roster) - before;
}

export function scaleRoster(roster: Roster, factor: number): number {
  const before = squadSize(roster);
  if (before <= 0) {
    return 0;
  }

  for (const key of SQUAD_CLASS_ORDER) {
    roster[key] = Math.floor(roster[key] * factor);
  }

  let total = squadSize(roster);
  if (total <= 0) {
    roster.rifleman = 1;
    total = 1;
  }
  while (total > MAX_UNITS) {
    const removed = addUnits(roster, -(total - MAX_UNITS));
    total = squadSize(roster);
    if (removed === 0) {
      break;
    }
  }
  return squadSize(roster) - before;
}

export function convertUnits(roster: Roster, cls: SquadClass, amount: number): number {
  const available = roster.rifleman;
  const moved = Math.min(available, Math.max(0, Math.round(amount)));
  roster.rifleman -= moved;
  roster[cls] += moved;
  return moved;
}

export function unitOffsets(count: number): { x: number; z: number }[] {
  const shown = Math.max(0, Math.min(count, UNIT_DRAW_CAP));
  const out: { x: number; z: number }[] = [];
  for (let index = 0; index < shown; index += 1) {
    const row = Math.floor(index / UNIT_PER_ROW);
    const inRow = index % UNIT_PER_ROW;
    const rowCount = Math.min(UNIT_PER_ROW, shown - row * UNIT_PER_ROW);
    const x = (inRow - (rowCount - 1) / 2) * UNIT_SPACING;
    out.push({ x, z: row * UNIT_ROW_DEPTH + Math.abs(x) * 0.12 });
  }
  return out;
}

export interface FormationSlot {
  x: number;
  z: number;
  cls: SquadClass;
}

export function formation(roster: Roster): FormationSlot[] {
  const total = squadSize(roster);
  const offsets = unitOffsets(total);
  if (offsets.length === 0) {
    return [];
  }

  const queue: SquadClass[] = [];
  const ordered = [...SQUAD_CLASS_ORDER].sort(
    (left, right) => SQUAD_CLASSES[left].row - SQUAD_CLASSES[right].row,
  );
  for (const cls of ordered) {
    const share = total <= offsets.length
      ? roster[cls]
      : Math.round((roster[cls] / total) * offsets.length);
    for (let index = 0; index < share; index += 1) {
      queue.push(cls);
    }
  }
  while (queue.length < offsets.length) {
    queue.push("rifleman");
  }

  return offsets.map((offset, index) => ({ ...offset, cls: queue[index] ?? "rifleman" }));
}

export function squadHalfWidth(units: number): number {
  return (Math.min(units, UNIT_PER_ROW) * UNIT_SPACING) / 2 + 0.25;
}

export function barrierOf(roster: Roster): number {
  return roster.engineer * SQUAD_CLASSES.engineer.barrier;
}

export function healingOf(roster: Roster): number {
  return roster.medic * SQUAD_CLASSES.medic.heals;
}
