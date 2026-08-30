import {
  bonusOf,
  canAfford,
  createProfile,
  nodeById,
  nodeUnlocked,
  abilitySlots,
} from "./progression";
import {
  dailyMissions,
  earnedMedals,
  missionDelta,
  scaleReward,
  type Mission,
} from "./economy";
import { ATTACHMENTS, WEAPONS } from "./weapons";
import { ABILITY_ORDER, isAbilityId } from "./abilities";
import { PROFILE_VERSION } from "./tuning";
import type { AbilityId, GunlineProfile, Loadout, RunSummary, WeaponId } from "./types";

function clone(profile: GunlineProfile): GunlineProfile {
  return {
    ...profile,
    stars: { ...profile.stars },
    best: { ...profile.best },
    upgrades: { ...profile.upgrades },
    weapons: [...profile.weapons],
    attachments: [...profile.attachments],
    loadout: {
      weapon: profile.loadout.weapon,
      attachments: [...profile.loadout.attachments],
      abilities: [...profile.loadout.abilities],
    },
    medals: [...profile.medals],
    missionProgress: { ...profile.missionProgress },
    missionClaimed: [...profile.missionClaimed],
    totals: { ...profile.totals },
  };
}

function numberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[key] = raw;
    }
  }
  return out;
}

function stringList(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && allowed.includes(item));
}

export function normaliseProfile(raw: unknown): GunlineProfile {
  const base = createProfile();
  if (!raw || typeof raw !== "object") {
    return base;
  }

  const input = raw as Partial<GunlineProfile> & Record<string, unknown>;
  const weaponIds = Object.keys(WEAPONS);
  const attachmentIds = ATTACHMENTS.map((item) => item.id);
  const totals = numberMap(input.totals);

  const profile: GunlineProfile = {
    ...base,
    version: PROFILE_VERSION,
    xp: typeof input.xp === "number" && input.xp >= 0 ? input.xp : 0,
    supplies: typeof input.supplies === "number" && input.supplies >= 0 ? input.supplies : 0,
    ammo: typeof input.ammo === "number" && input.ammo >= 0 ? input.ammo : 0,
    credits: typeof input.credits === "number" && input.credits >= 0 ? input.credits : 0,
    stars: numberMap(input.stars),
    best: numberMap(input.best),
    upgrades: numberMap(input.upgrades),
    weapons: stringList(input.weapons, weaponIds) as WeaponId[],
    attachments: stringList(input.attachments, attachmentIds),
    medals: Array.isArray(input.medals) ? input.medals.filter((id) => typeof id === "string") : [],
    missionDay: typeof input.missionDay === "string" ? input.missionDay : "",
    missionProgress: numberMap(input.missionProgress),
    missionClaimed: Array.isArray(input.missionClaimed)
      ? input.missionClaimed.filter((id) => typeof id === "string")
      : [],
    totals: {
      runs: totals.runs ?? 0,
      kills: totals.kills ?? 0,
      bosses: totals.bosses ?? 0,
      levels: totals.levels ?? 0,
      leaks: totals.leaks ?? 0,
      perfect: totals.perfect ?? 0,
    },
    loadout: base.loadout,
  };

  if (!profile.weapons.includes("pistol")) {
    profile.weapons.push("pistol");
  }

  const loadout = input.loadout as Partial<Loadout> | undefined;
  if (loadout) {
    const weapon = typeof loadout.weapon === "string" && weaponIds.includes(loadout.weapon)
      ? (loadout.weapon as WeaponId)
      : "pistol";
    profile.loadout = {
      weapon: profile.weapons.includes(weapon) || WEAPONS[weapon].cost === 0 ? weapon : "pistol",
      attachments: stringList(loadout.attachments, profile.attachments),
      abilities: stringList(loadout.abilities, ABILITY_ORDER as readonly string[])
        .filter(isAbilityId)
        .slice(0, abilitySlots(profile)),
    };
  }

  if (profile.loadout.abilities.length === 0) {
    profile.loadout.abilities = ["airstrike", "reinforce"].slice(0, abilitySlots(profile)) as AbilityId[];
  }

  return profile;
}

export function currentMissions(profile: GunlineProfile, dayKey: string): Mission[] {
  return dailyMissions(dayKey || profile.missionDay || "gunline");
}

export function refreshMissions(profile: GunlineProfile, dayKey: string): GunlineProfile {
  if (profile.missionDay === dayKey) {
    return profile;
  }
  const next = clone(profile);
  next.missionDay = dayKey;
  next.missionProgress = {};
  next.missionClaimed = [];
  return next;
}

export function claimMission(profile: GunlineProfile, mission: Mission): GunlineProfile {
  if (profile.missionClaimed.includes(mission.id)) {
    return profile;
  }
  if ((profile.missionProgress[mission.id] ?? 0) < mission.target) {
    return profile;
  }
  const next = clone(profile);
  next.missionClaimed.push(mission.id);
  next.credits += mission.credits;
  return next;
}

export function recordRun(
  profile: GunlineProfile,
  summary: RunSummary,
  dayKey: string,
): { profile: GunlineProfile; reward: RunSummary["reward"]; newMedals: string[] } {
  const next = clone(refreshMissions(profile, dayKey));
  const bonus = bonusOf(profile);
  const reward = summary.won
    ? scaleReward(summary.reward, summary.stars, bonus.loot)
    : { supplies: 0, ammo: 0, credits: 0, xp: Math.round(summary.score / 40) };

  next.supplies += reward.supplies;
  next.ammo += Math.round(reward.ammo * bonus.ammoIncome);
  next.credits += reward.credits;
  next.xp += reward.xp;

  next.totals.runs += 1;
  next.totals.kills += summary.kills;
  next.totals.bosses += summary.bosses;
  next.totals.leaks += summary.leaks;

  if (summary.won) {
    next.totals.levels = Math.max(next.totals.levels, summary.levelId);
    if (summary.leaks === 0) {
      next.totals.perfect += 1;
    }
    const key = `${summary.levelId}`;
    next.stars[key] = Math.max(next.stars[key] ?? 0, summary.stars);
  }

  if (summary.levelId > 0) {
    const key = `${summary.levelId}`;
    next.best[key] = Math.max(next.best[key] ?? 0, summary.score);
  }

  for (const mission of currentMissions(next, dayKey)) {
    const delta = mission.id === "gates" ? summary.goodGates : missionDelta(summary, mission);
    if (delta > 0) {
      next.missionProgress[mission.id] = (next.missionProgress[mission.id] ?? 0) + delta;
    }
  }

  const newMedals: string[] = [];
  for (const medal of earnedMedals(next)) {
    if (!next.medals.includes(medal.id)) {
      next.medals.push(medal.id);
      newMedals.push(medal.id);
    }
  }

  return { profile: next, reward, newMedals };
}

export function purchaseNode(profile: GunlineProfile, nodeId: string): GunlineProfile {
  const node = nodeById(nodeId);
  if (!node || !nodeUnlocked(profile, node)) {
    return profile;
  }

  const level = profile.upgrades[nodeId] ?? 0;
  if (level >= node.max) {
    return profile;
  }

  const price = node.cost(level);
  if (!canAfford(profile, price)) {
    return profile;
  }

  const next = clone(profile);
  next.supplies -= price.supplies;
  next.ammo -= price.ammo;
  next.credits -= price.credits;
  next.upgrades[nodeId] = level + 1;
  return next;
}

export function purchaseWeapon(profile: GunlineProfile, weapon: WeaponId): GunlineProfile {
  const spec = WEAPONS[weapon];
  if (!spec || profile.weapons.includes(weapon)) {
    return profile;
  }
  if (profile.ammo < spec.cost) {
    return profile;
  }

  const next = clone(profile);
  next.ammo -= spec.cost;
  next.weapons.push(weapon);
  return next;
}

export function purchaseAttachment(profile: GunlineProfile, id: string): GunlineProfile {
  const attachment = ATTACHMENTS.find((item) => item.id === id);
  if (!attachment || profile.attachments.includes(id)) {
    return profile;
  }
  if (profile.ammo < attachment.cost) {
    return profile;
  }

  const next = clone(profile);
  next.ammo -= attachment.cost;
  next.attachments.push(id);
  return next;
}

export function setLoadout(profile: GunlineProfile, loadout: Loadout): GunlineProfile {
  const next = clone(profile);
  const weapon = profile.weapons.includes(loadout.weapon) || WEAPONS[loadout.weapon]?.cost === 0
    ? loadout.weapon
    : profile.loadout.weapon;

  next.loadout = {
    weapon,
    attachments: loadout.attachments.filter((id) => profile.attachments.includes(id)).slice(0, 3),
    abilities: loadout.abilities.filter(isAbilityId).slice(0, abilitySlots(profile)),
  };
  return next;
}

export function resetProfile(): GunlineProfile {
  return createProfile();
}
