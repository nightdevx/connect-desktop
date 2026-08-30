import { nextRandom } from "./rng";
import { SQUAD_CLASSES, addUnits, convertUnits } from "./squad";
import { MAX_UNITS } from "./tuning";
import { WEAPONS, nextWeapon } from "./weapons";
import type { GunlineState, GunlineUpgrade, SquadClass, WeaponId } from "./types";

const BASE_POOL: readonly GunlineUpgrade[] = [
  { id: "damage", label: "Hasar +%25", detail: "Her mermi daha çok yakar.", rarity: "common" },
  { id: "rate", label: "Atış hızı +%20", detail: "Namlu soğumaz.", rarity: "common" },
  { id: "units", label: "+3 er", detail: "Müfrezeye üç er katılır.", rarity: "common" },
  { id: "armor", label: "+4 zırh", detail: "Hattın önüne dört vuruşluk zırh.", rarity: "common" },
  { id: "pellet", label: "+1 mermi", detail: "Her atışta bir mermi daha.", rarity: "rare" },
  { id: "pierce", label: "+1 delme", detail: "Mermi bir düşmanı daha deler.", rarity: "rare" },
  { id: "crit", label: "Kritik +%10", detail: "Kritik vuruş iki kat hasar verir.", rarity: "rare" },
  { id: "loot", label: "Ganimet +%25", detail: "Düşen düşman daha çok erzak bırakır.", rarity: "rare" },
  { id: "antiair", label: "Uçaksavar", detail: "Bütün müfreze drone vurabilir.", rarity: "rare" },
  { id: "aoe", label: "Parça tesirli", detail: "Mermiler küçük bir alanı sarsar.", rarity: "epic" },
  { id: "slow", label: "Yavaşlatan mermi", detail: "Vurulan düşman bir saniye ağırlaşır.", rarity: "epic" },
  { id: "explosive", label: "Patlayıcı mermi", detail: "Ölen düşman çevresine hasar saçar.", rarity: "epic" },
];

const CLASS_CARDS: readonly { id: string; cls: SquadClass; rarity: GunlineUpgrade["rarity"] }[] = [
  { id: "class:gunner", cls: "gunner", rarity: "rare" },
  { id: "class:sniper", cls: "sniper", rarity: "rare" },
  { id: "class:grenadier", cls: "grenadier", rarity: "epic" },
  { id: "class:medic", cls: "medic", rarity: "epic" },
  { id: "class:engineer", cls: "engineer", rarity: "epic" },
];

function weaponCard(state: GunlineState): GunlineUpgrade | null {
  const next = nextWeapon(state.weapon.id);
  if (!next) {
    return null;
  }
  return {
    id: `weapon:${next}`,
    label: WEAPONS[next].label,
    detail: WEAPONS[next].detail,
    rarity: "epic",
  };
}

export function rollOffer(state: GunlineState): GunlineUpgrade[] {
  const pool = BASE_POOL.filter(
    (upgrade) =>
      !(upgrade.id === "slow" && state.mods.slow) &&
      !(upgrade.id === "explosive" && state.mods.explosive) &&
      !(upgrade.id === "antiair" && state.mods.antiAir),
  ).slice();

  for (const card of CLASS_CARDS) {
    if (state.roster.rifleman >= 3) {
      const spec = SQUAD_CLASSES[card.cls];
      pool.push({
        id: card.id,
        label: `2 ${spec.label}`,
        detail: spec.detail,
        rarity: card.rarity,
      });
    }
  }

  const weapon = weaponCard(state);
  if (weapon && nextRandom(state) < 0.55) {
    pool.push(weapon);
  }

  const offer: GunlineUpgrade[] = [];
  while (offer.length < 3 && pool.length > 0) {
    const index = Math.floor(nextRandom(state) * pool.length) % pool.length;
    offer.push(pool[index]);
    pool.splice(index, 1);
  }
  return offer;
}

export function applyUpgrade(state: GunlineState, id: string): void {
  if (id.startsWith("weapon:")) {
    const next = id.slice("weapon:".length) as WeaponId;
    if (WEAPONS[next]) {
      state.weapon = { ...WEAPONS[next] };
    }
    return;
  }

  if (id.startsWith("class:")) {
    const cls = id.slice("class:".length) as SquadClass;
    if (SQUAD_CLASSES[cls]) {
      convertUnits(state.roster, cls, 2);
    }
    return;
  }

  switch (id) {
    case "damage":
      state.mods.damage *= 1.25;
      break;
    case "rate":
      state.mods.fireRate *= 1.2;
      break;
    case "pellet":
      state.mods.pellets += 1;
      state.weapon.spread = Math.max(state.weapon.spread, 0.08);
      break;
    case "pierce":
      state.mods.pierce += 1;
      break;
    case "units":
      addUnits(state.roster, 3);
      break;
    case "armor":
      state.armor = Math.min(MAX_UNITS, state.armor + 4);
      break;
    case "crit":
      state.mods.crit = Math.min(0.8, state.mods.crit + 0.1);
      break;
    case "loot":
      state.mods.loot += 0.25;
      break;
    case "antiair":
      state.mods.antiAir = true;
      break;
    case "aoe":
      state.mods.aoe += 0.9;
      break;
    case "slow":
      state.mods.slow = true;
      break;
    case "explosive":
      state.mods.explosive = true;
      break;
    default:
      break;
  }
}
