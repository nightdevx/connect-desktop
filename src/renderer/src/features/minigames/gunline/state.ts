import type { RulesGunline } from "../difficulty";
import { ABILITIES } from "./abilities";
import { ENEMY_SPECS, kindsForWave } from "./enemies";
import { gateHit, isGoodGate } from "./gates";
import {
  isBossWave,
  spawnIntervalOf,
  spawnSpreadOf,
  waveHealth,
  waveSizeOf,
} from "./levels";
import { objectiveFailed, objectiveMet } from "./objectives";
import { baseBonus } from "./progression";
import { nextRandom, pickRandom } from "./rng";
import {
  SQUAD_CLASSES,
  addUnits,
  barrierOf,
  convertUnits,
  createRoster,
  formation,
  healingOf,
  scaleRoster,
  squadHalfWidth,
  squadSize,
} from "./squad";
import {
  AIR_ONLY_PENALTY,
  ARMOR_CAP,
  CORRIDOR_ROW_GAP,
  GATE_HALF_WIDTH,
  GATE_SPEED,
  LEAK_Z,
  MAX_BULLETS,
  MAX_UNITS,
  MODIFIER_SCALE,
  PLAYER_BOUND,
  SHIELD_FRONT_ARC,
  SPAWN_INTERVAL_FLOOR,
  SPAWN_Z,
  STREAK_BONUS_AT,
  STREAK_WINDOW,
  VOLLEY_CAP,
} from "./tuning";
import { applyUpgrade, rollOffer } from "./upgrades";
import { WEAPONS, attachmentById, nextWeapon } from "./weapons";
import type {
  AbilityId,
  EffectKind,
  EnemyKind,
  GateKind,
  GunlineEnemy,
  GunlineGate,
  GunlineLevel,
  GunlineMode,
  GunlineState,
  Loadout,
  MetaBonus,
  ModifierId,
  SquadClass,
  WeaponId,
} from "./types";

export interface RunOptions {
  mode: GunlineMode;
  rules: RulesGunline;
  level: GunlineLevel | null;
  loadout: Loadout;
  bonus: MetaBonus;
  seed: number;
}

const GOOD_GATE_KINDS: readonly GateKind[] = ["add", "mul", "class", "armor", "ammo"];
const BAD_GATE_KINDS: readonly GateKind[] = ["add", "mul", "mine", "toll"];
const CLASS_GATE_POOL: readonly SquadClass[] = ["gunner", "sniper", "grenadier", "medic", "engineer"];

function hasModifier(state: GunlineState, id: ModifierId): boolean {
  return state.modifiers.includes(id);
}

function spreadScale(state: GunlineState): number {
  let scale = 1;
  if (hasModifier(state, "night")) {
    scale *= MODIFIER_SCALE.night.spread;
  }
  if (hasModifier(state, "sandstorm")) {
    scale *= MODIFIER_SCALE.sandstorm.spread;
  }
  if (hasModifier(state, "fog")) {
    scale *= MODIFIER_SCALE.fog.spread;
  }
  return scale;
}

function effect(state: GunlineState, kind: EffectKind, x: number, z: number, value = 0): void {
  if (state.effects.length > 160) {
    state.effects.shift();
  }
  state.effects.push({ kind, x, z, value, at: state.time });
}

function applyLoadout(state: GunlineState, loadout: Loadout): void {
  const weapon = WEAPONS[loadout.weapon] ?? WEAPONS.pistol;
  state.weapon = { ...weapon };

  for (const id of loadout.attachments) {
    const attachment = attachmentById(id);
    if (!attachment) {
      continue;
    }
    state.mods.damage *= attachment.damage;
    state.mods.fireRate *= attachment.fireRate;
    state.mods.pellets += attachment.pellets;
    state.mods.pierce += attachment.pierce;
    state.mods.crit += attachment.crit;
    state.weapon.spread *= attachment.spread;
  }

  state.mods.pierce += state.weapon.pierce;
  state.mods.aoe += state.weapon.aoe;
  state.mods.antiAir = state.mods.antiAir || state.weapon.antiAir;

  state.abilities = loadout.abilities.map((id) => ({
    id,
    readyAt: 0,
    activeUntil: 0,
  }));
}

export function createRun(options: RunOptions): GunlineState {
  const { mode, rules, level, loadout, bonus, seed } = options;
  const modifiers = level?.modifiers ?? [];
  const waveCount = level ? level.waves.length : Infinity;

  const state: GunlineState = {
    mode,
    phase: "ready",
    time: 0,
    level,
    terrain: level?.terrain ?? "range",
    modifiers,
    wave: 1,
    waveCount,
    playerX: 0,
    roster: createRoster(rules.startUnits + bonus.startUnits),
    armor: 0,
    score: 0,
    kills: 0,
    leaks: 0,
    bosses: 0,
    supplies: 0,
    goodGates: 0,
    streak: 0,
    streakUntil: 0,
    weapon: { ...WEAPONS.pistol },
    mods: {
      damage: bonus.damage,
      fireRate: bonus.fireRate,
      pellets: 0,
      pierce: 0,
      crit: bonus.crit,
      aoe: 0,
      slow: false,
      explosive: false,
      antiAir: false,
      loot: bonus.loot,
    },
    abilities: [],
    jammedUntil: 0,
    fireTimer: 0,
    spawnTimer: 0.6,
    spawnsLeft: 0,
    spawnInterval: 1,
    waveSize: 0,
    waveKinds: ["militia"],
    waveHealthScale: 1,
    waveBoss: null,
    gateDropped: false,
    corridorLeft: 0,
    corridorTimer: 0,
    zoneTimer: 0,
    convoyHealth: 100,
    extractLeft: level?.objective.kind === "extract" ? level.objective.value : 0,
    enemies: [],
    bullets: [],
    gates: [],
    strikes: [],
    effects: [],
    offer: [],
    rules,
    bonus,
    seed: seed >>> 0,
    nextId: 1,
  };

  applyLoadout(state, loadout);

  if (modifiers.includes("scarce")) {
    state.mods.fireRate *= MODIFIER_SCALE.scarce.fireRate;
    state.mods.damage *= MODIFIER_SCALE.scarce.damage;
  }

  return state;
}

export function createEndlessRun(rules: RulesGunline, seed: number): GunlineState {
  return createRun({
    mode: "endless",
    rules,
    level: null,
    loadout: { weapon: "pistol", attachments: [], abilities: [] },
    bonus: baseBonus(),
    seed,
  });
}

function threatOf(state: GunlineState): number {
  return state.level ? state.level.id + state.wave * 0.5 : state.wave;
}

function configureWave(state: GunlineState): void {
  const script = state.level?.waves[Math.min(state.wave, state.level.waves.length) - 1] ?? null;
  const surge = hasModifier(state, "surge");

  if (script) {
    state.waveKinds = script.kinds;
    state.waveSize = Math.round(script.count * (surge ? MODIFIER_SCALE.surge.count : 1));
    state.spawnInterval = Math.max(
      SPAWN_INTERVAL_FLOOR,
      script.interval / state.rules.spawnRate / (surge ? MODIFIER_SCALE.surge.spawn : 1),
    );
    state.waveHealthScale = script.healthScale;
    state.waveBoss = script.boss;
  } else {
    state.waveKinds = kindsForWave(state.wave);
    state.waveSize = waveSizeOf(state.wave);
    state.spawnInterval = spawnIntervalOf(state.wave, state.rules);
    state.waveHealthScale = 1;
    state.waveBoss = isBossWave(state.wave) ? "commander" : null;
  }

  state.spawnsLeft = state.waveSize;
  state.spawnTimer = 0.7;
  state.gateDropped = false;
  state.armor += barrierOf(state.roster);
}

function beginWave(state: GunlineState): void {
  configureWave(state);
  state.phase = "wave";
}

function beginCorridor(state: GunlineState): void {
  const rows = state.level?.corridor.rows ?? 0;
  for (let index = 0; index < rows; index += 1) {
    dropGateRow(state, LEAK_Z - CORRIDOR_ROW_GAP * (index + 1));
  }
  state.corridorLeft = 0;
  state.corridorTimer = 0;
  state.phase = "corridor";
}

export function startRun(state: GunlineState): void {
  if (state.phase !== "ready") {
    return;
  }
  if (state.level && state.level.corridor.rows > 0) {
    beginCorridor(state);
    return;
  }
  beginWave(state);
}

function spawnEnemy(
  state: GunlineState,
  kind: EnemyKind,
  x: number,
  z: number,
  healthScale = 1,
): void {
  const spec = ENEMY_SPECS[kind];
  const health = waveHealth(threatOf(state), state.rules) * spec.health * healthScale;
  state.enemies.push({
    id: state.nextId++,
    kind,
    x: Math.max(-PLAYER_BOUND, Math.min(PLAYER_BOUND, x)),
    z,
    health,
    maxHealth: health,
    speed: spec.speed,
    scale: spec.scale,
    wobble: nextRandom(state) * Math.PI * 2,
    fireAt: state.time + spec.fireEvery,
    supportAt: state.time + spec.supportEvery,
    slowUntil: 0,
    shieldUntil: 0,
    hitAt: 0,
    dyingAt: 0,
    bounty: spec.bounty,
  });
}

function makeGate(
  state: GunlineState,
  kind: GateKind,
  good: boolean,
  x: number,
  z: number,
): GunlineGate {
  const gate: GunlineGate = {
    id: state.nextId++,
    x,
    z,
    kind,
    value: 0,
    payload: "",
    charge: 0,
    good,
    locked: false,
  };

  if (kind === "add") {
    const bite = Math.max(2, Math.ceil(squadSize(state.roster) / 2));
    gate.value = good
      ? 2 + Math.floor(nextRandom(state) * 4)
      : -Math.min(bite, 3 + Math.floor(nextRandom(state) * 6));
  } else if (kind === "mul") {
    gate.value = good ? 1.2 + Math.floor(nextRandom(state) * 3) * 0.2 : 0.5;
  } else if (kind === "class") {
    gate.value = 1 + Math.floor(nextRandom(state) * 2);
    gate.payload = pickRandom(state, CLASS_GATE_POOL);
  } else if (kind === "weapon") {
    gate.value = 1;
    gate.payload = nextWeapon(state.weapon.id) ?? state.weapon.id;
  } else if (kind === "ammo") {
    gate.value = 20 + Math.floor(nextRandom(state) * 3) * 10;
  } else if (kind === "armor") {
    gate.value = 2 + Math.floor(nextRandom(state) * 4);
  } else if (kind === "mine") {
    gate.value = -Math.min(
      Math.max(2, Math.ceil(squadSize(state.roster) / 2)),
      2 + Math.floor(nextRandom(state) * 5),
    );
  } else if (kind === "toll") {
    gate.value = 3 + Math.floor(nextRandom(state) * 5);
  }

  gate.good = isGoodGate(gate);
  return gate;
}

function dropGateRow(state: GunlineState, z: number): void {
  const goodLeft = nextRandom(state) < 0.5;
  const upgrade = nextWeapon(state.weapon.id);
  const goodPool = upgrade && nextRandom(state) < 0.2
    ? [...GOOD_GATE_KINDS, "weapon" as GateKind]
    : GOOD_GATE_KINDS;

  const good = makeGate(state, pickRandom(state, goodPool), true, goodLeft ? -1.5 : 1.5, z);
  const bad = makeGate(state, pickRandom(state, BAD_GATE_KINDS), false, goodLeft ? 1.5 : -1.5, z);

  if (bad.kind === "add" && bad.value > 0) {
    bad.value = -bad.value;
    bad.good = false;
  }
  if (bad.kind === "mul") {
    bad.value = 0.5;
    bad.good = false;
  }

  state.gates.push(good, bad);
}

function applyGate(state: GunlineState, gate: GunlineGate): void {
  const before = squadSize(state.roster);

  switch (gate.kind) {
    case "add":
      addUnits(state.roster, gate.value);
      break;
    case "mul":
      scaleRoster(state.roster, gate.value);
      break;
    case "class":
      convertUnits(state.roster, gate.payload as SquadClass, gate.value);
      break;
    case "weapon": {
      const weapon = WEAPONS[gate.payload as WeaponId];
      if (weapon) {
        state.weapon = { ...weapon };
        state.mods.antiAir = state.mods.antiAir || weapon.antiAir;
      }
      break;
    }
    case "ammo":
      for (const ability of state.abilities) {
        ability.readyAt = Math.max(0, ability.readyAt - gate.value * 0.2);
      }
      break;
    case "armor":
      state.armor = Math.min(MAX_UNITS, state.armor + gate.value);
      break;
    case "mine":
      addUnits(state.roster, Math.min(0, gate.value));
      break;
    case "toll": {
      const price = gate.value * 12;
      if (state.supplies >= price) {
        state.supplies -= price;
        addUnits(state.roster, gate.value);
      }
      break;
    }
    default:
      break;
  }

  if (gate.good) {
    state.goodGates += 1;
  }

  if (squadSize(state.roster) <= 0) {
    state.roster.rifleman = 1;
  }

  const delta = squadSize(state.roster) - before;
  effect(state, "gate", gate.x, gate.z, delta);
}

function adrenalineActive(state: GunlineState): boolean {
  return state.abilities.some(
    (ability) => ability.id === "adrenaline" && ability.activeUntil > state.time,
  );
}

function smokeActive(state: GunlineState): boolean {
  return state.abilities.some(
    (ability) => ability.id === "smoke" && ability.activeUntil > state.time,
  );
}

function fire(state: GunlineState): void {
  const slots = formation(state.roster);
  const total = squadSize(state.roster);
  if (total <= 0 || slots.length === 0) {
    return;
  }

  const volley = Math.min(slots.length, VOLLEY_CAP);
  const scale = total / volley;
  const pellets = Math.max(1, state.weapon.pellets + state.mods.pellets);
  const spread = state.weapon.spread * spreadScale(state);

  for (let index = 0; index < volley; index += 1) {
    const slot = slots[index];
    const spec = SQUAD_CLASSES[slot.cls];
    let shots = Math.floor(spec.fireRate);
    if (nextRandom(state) < spec.fireRate - shots) {
      shots += 1;
    }
    if (shots <= 0) {
      continue;
    }

    const originX = state.playerX + slot.x;
    const originZ = slot.z;
    effect(state, "muzzle", originX, originZ);

    const damage = state.weapon.damage * state.mods.damage * spec.damage * scale;
    const air = state.mods.antiAir || spec.antiAir;
    const aoe = state.mods.aoe + spec.aoe;
    const pierce = state.mods.pierce + spec.pierce;

    for (let round = 0; round < shots; round += 1) {
      for (let shot = 0; shot < pellets; shot += 1) {
        if (state.bullets.length >= MAX_BULLETS) {
          return;
        }
        const angle = spread * (pellets > 1 ? shot - (pellets - 1) / 2 : nextRandom(state) - 0.5);
        const crit = nextRandom(state) < state.mods.crit;
        state.bullets.push({
          id: state.nextId++,
          x: originX,
          z: originZ,
          vx: angle * state.weapon.speed,
          vz: -state.weapon.speed,
          damage: crit ? damage * 2 : damage,
          pierce,
          aoe,
          hostile: false,
          crit,
          air,
        });
      }
    }
  }
}

function killEnemy(state: GunlineState, enemy: GunlineEnemy): void {
  const spec = ENEMY_SPECS[enemy.kind];
  enemy.dyingAt = state.time;
  state.kills += 1;

  state.streak = state.time <= state.streakUntil ? state.streak + 1 : 1;
  state.streakUntil = state.time + STREAK_WINDOW;

  const streakBonus = state.streak >= STREAK_BONUS_AT ? 1.5 : 1;
  state.score += Math.round((spec.score + state.wave * 2) * streakBonus);
  state.supplies += enemy.bounty * state.mods.loot;

  if (spec.boss) {
    state.bosses += 1;
  }

  effect(state, spec.boss ? "blast" : "kill", enemy.x, enemy.z, enemy.scale);

  if (spec.splits && spec.splitCount > 0) {
    for (let index = 0; index < spec.splitCount; index += 1) {
      const offset = (index - (spec.splitCount - 1) / 2) * 0.5;
      spawnEnemy(state, spec.splits, enemy.x + offset, enemy.z, 0.4);
    }
  }

  if (state.mods.explosive) {
    splashDamage(state, enemy.x, enemy.z, 1.6, enemy.maxHealth * 0.4, enemy.id);
  }
}

function splashDamage(
  state: GunlineState,
  x: number,
  z: number,
  radius: number,
  amount: number,
  skipId = 0,
): void {
  const squared = radius * radius;
  for (const other of state.enemies) {
    if (other.dyingAt > 0 || other.id === skipId) {
      continue;
    }
    const dx = other.x - x;
    const dz = other.z - z;
    if (dx * dx + dz * dz <= squared) {
      damageEnemy(state, other, amount, true);
    }
  }
}

function damageEnemy(
  state: GunlineState,
  enemy: GunlineEnemy,
  amount: number,
  ignoreShield = false,
): void {
  if (enemy.dyingAt > 0) {
    return;
  }

  const spec = ENEMY_SPECS[enemy.kind];
  let dealt = amount * (1 - Math.min(ARMOR_CAP, spec.armor));
  if (spec.frontShield && !ignoreShield) {
    dealt *= 1 - SHIELD_FRONT_ARC;
  }

  const before = enemy.health / enemy.maxHealth;
  enemy.health -= dealt;
  enemy.hitAt = state.time;

  if (state.mods.slow) {
    enemy.slowUntil = state.time + 1;
  }

  if (spec.boss) {
    const after = enemy.health / enemy.maxHealth;
    for (const threshold of [0.66, 0.33]) {
      if (before > threshold && after <= threshold) {
        enemy.speed *= 1.15;
        for (let index = 0; index < 2; index += 1) {
          spawnEnemy(state, "infantry", enemy.x + (index === 0 ? -1 : 1), enemy.z + 1, 0.6);
        }
        effect(state, "blast", enemy.x, enemy.z, 1.2);
      }
    }
  }

  if (enemy.health <= 0) {
    killEnemy(state, enemy);
  }
}

function loseUnits(state: GunlineState, count: number, x: number, z: number): void {
  if (count <= 0) {
    return;
  }

  let remaining = count;
  if (state.armor > 0) {
    const absorbed = Math.min(state.armor, remaining);
    state.armor -= absorbed;
    remaining -= absorbed;
    effect(state, "shield", x, z, absorbed);
  }

  if (remaining > 0) {
    addUnits(state.roster, -remaining);
    effect(state, "hurt", x, z, remaining);
  }

  if (squadSize(state.roster) <= 0) {
    state.phase = "over";
  }
}

function enemyFires(state: GunlineState, enemy: GunlineEnemy): void {
  const spec = ENEMY_SPECS[enemy.kind];
  const spray = spec.boss ? [-0.28, 0, 0.28] : [0];
  for (const angle of spray) {
    state.bullets.push({
      id: state.nextId++,
      x: enemy.x,
      z: enemy.z,
      vx: angle * 9,
      vz: 9,
      damage: 1,
      pierce: 0,
      aoe: 0,
      hostile: true,
      crit: false,
      air: false,
    });
  }
  effect(state, "muzzle", enemy.x, enemy.z);
}

function enemySupports(state: GunlineState, enemy: GunlineEnemy): void {
  const spec = ENEMY_SPECS[enemy.kind];

  if (enemy.kind === "medic") {
    for (const other of state.enemies) {
      if (other.dyingAt > 0 || other.id === enemy.id) {
        continue;
      }
      const dx = other.x - enemy.x;
      const dz = other.z - enemy.z;
      if (dx * dx + dz * dz < 6.25) {
        other.health = Math.min(other.maxHealth, other.health + other.maxHealth * 0.12);
      }
    }
    effect(state, "heal", enemy.x, enemy.z, 1);
    return;
  }

  if (enemy.kind === "jammer") {
    state.jammedUntil = state.time + 4;
    effect(state, "jam", enemy.x, enemy.z, 1);
    return;
  }

  if (enemy.kind === "mortar" || spec.boss) {
    state.strikes.push({
      id: state.nextId++,
      x: state.playerX,
      z: 0.6,
      radius: spec.boss ? 2.4 : 2,
      damage: spec.boss ? 2 : 1,
      landsAt: state.time + 3,
      hostile: true,
    });
  }
}

function stepEnemies(state: GunlineState, dt: number): void {
  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];

    if (enemy.dyingAt > 0) {
      if (state.time - enemy.dyingAt > 0.9) {
        state.enemies.splice(index, 1);
      }
      continue;
    }

    const spec = ENEMY_SPECS[enemy.kind];
    const slowed = enemy.slowUntil > state.time ? 0.6 : 1;

    if (enemy.z < spec.stopZ) {
      enemy.z += enemy.speed * slowed * dt;
      if (spec.zigzag > 0) {
        enemy.wobble += dt * 2.2;
        enemy.x += Math.cos(enemy.wobble) * spec.zigzag * dt;
        enemy.x = Math.max(-PLAYER_BOUND, Math.min(PLAYER_BOUND, enemy.x));
      }
    }

    if (spec.fireEvery > 0 && state.time >= enemy.fireAt) {
      enemy.fireAt = state.time + spec.fireEvery;
      enemyFires(state, enemy);
    }

    if (spec.supportEvery > 0 && state.time >= enemy.supportAt) {
      enemy.supportAt = state.time + spec.supportEvery;
      enemySupports(state, enemy);
    }

    if (enemy.z > LEAK_Z) {
      state.enemies.splice(index, 1);
      state.leaks += 1;
      effect(state, "leak", enemy.x, enemy.z);
      if (state.level?.objective.kind === "convoy") {
        state.convoyHealth -= spec.leakCost * 6;
      }
      loseUnits(state, spec.leakCost, enemy.x, enemy.z);
    }
  }
}

function stepBullets(state: GunlineState, dt: number): void {
  const half = squadHalfWidth(squadSize(state.roster));
  const jammed = state.time < state.jammedUntil;
  const rain = hasModifier(state, "rain");
  const gateCharge = state.bonus.gateCharge;
  const smoke = smokeActive(state);

  for (let index = state.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = state.bullets[index];
    bullet.x += bullet.vx * dt;
    bullet.z += bullet.vz * dt;

    if (bullet.z < SPAWN_Z - 4 || bullet.z > 6 || Math.abs(bullet.x) > 6) {
      state.bullets.splice(index, 1);
      continue;
    }

    if (bullet.hostile) {
      if (smoke) {
        continue;
      }
      if (bullet.z > -0.4 && bullet.z < 2.4 && Math.abs(bullet.x - state.playerX) < half) {
        state.bullets.splice(index, 1);
        loseUnits(state, 1, bullet.x, bullet.z);
      }
      continue;
    }

    let consumed = false;

    for (const gate of state.gates) {
      if (Math.abs(bullet.x - gate.x) < 0.85 && Math.abs(bullet.z - gate.z) < 0.5) {
        if (!jammed) {
          const charges = rain && nextRandom(state) < 0.3 ? 0 : Math.max(1, Math.round(gateCharge));
          for (let hit = 0; hit < charges; hit += 1) {
            gateHit(gate);
          }
        }
        effect(state, "impact", bullet.x, bullet.z);
        consumed = true;
        break;
      }
    }

    if (!consumed) {
      for (const enemy of state.enemies) {
        if (enemy.dyingAt > 0) {
          continue;
        }
        const spec = ENEMY_SPECS[enemy.kind];
        const radius = spec.radius;
        if (
          Math.abs(bullet.x - enemy.x) < radius &&
          Math.abs(bullet.z - enemy.z) < radius + 0.3
        ) {
          const power = spec.flying && !bullet.air ? bullet.damage * AIR_ONLY_PENALTY : bullet.damage;
          damageEnemy(state, enemy, power, bullet.pierce > 0 || bullet.aoe > 0);
          effect(state, "impact", bullet.x, bullet.z, bullet.crit ? 1 : 0);

          if (bullet.aoe > 0) {
            splashDamage(state, enemy.x, enemy.z, bullet.aoe, bullet.damage * 0.55, enemy.id);
            effect(state, "blast", enemy.x, enemy.z, bullet.aoe * 0.5);
            consumed = true;
            break;
          }

          if (bullet.pierce > 0) {
            bullet.pierce -= 1;
          } else {
            consumed = true;
          }
          break;
        }
      }
    }

    if (consumed) {
      state.bullets.splice(index, 1);
    }
  }
}

function stepGates(state: GunlineState, dt: number): void {
  const jammed = state.time < state.jammedUntil;

  for (let index = state.gates.length - 1; index >= 0; index -= 1) {
    const gate = state.gates[index];
    gate.locked = jammed;
    gate.z += GATE_SPEED * dt;

    if (gate.z < LEAK_Z) {
      continue;
    }
    if (Math.abs(gate.x - state.playerX) < GATE_HALF_WIDTH) {
      applyGate(state, gate);
    }
    state.gates.splice(index, 1);
  }
}

function stepStrikes(state: GunlineState): void {
  for (let index = state.strikes.length - 1; index >= 0; index -= 1) {
    const strike = state.strikes[index];
    if (state.time < strike.landsAt) {
      continue;
    }

    if (strike.hostile) {
      if (Math.abs(state.playerX - strike.x) < strike.radius) {
        loseUnits(state, strike.damage, strike.x, strike.z);
      }
    } else {
      splashDamage(state, strike.x, strike.z, strike.radius, strike.damage);
    }

    effect(state, "blast", strike.x, strike.z, strike.radius * 0.5);
    state.strikes.splice(index, 1);
  }
}

function stepSpawns(state: GunlineState, dt: number): void {
  if (state.spawnsLeft <= 0) {
    return;
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) {
    return;
  }
  state.spawnTimer = state.spawnInterval;
  state.spawnsLeft -= 1;

  if (state.waveBoss && state.spawnsLeft === state.waveSize - 1) {
    spawnEnemy(state, state.waveBoss, 0, SPAWN_Z, state.waveHealthScale);
  } else {
    const kind = pickRandom(state, state.waveKinds);
    spawnEnemy(
      state,
      kind,
      (nextRandom(state) - 0.5) * spawnSpreadOf(threatOf(state)),
      SPAWN_Z - nextRandom(state) * 3,
      state.waveHealthScale,
    );
  }

  if (!state.gateDropped && state.spawnsLeft <= Math.floor(state.waveSize / 2)) {
    dropGateRow(state, SPAWN_Z);
    state.gateDropped = true;
  }
}

function stepCorridor(state: GunlineState): void {
  if (state.gates.length > 0) {
    return;
  }

  const floor = state.rules.startUnits + state.bonus.startUnits;
  const missing = floor - squadSize(state.roster);
  if (missing > 0) {
    addUnits(state.roster, missing);
    effect(state, "heal", state.playerX, 0.5, missing);
  }

  beginWave(state);
}

function endWave(state: GunlineState): void {
  state.score += 100 * state.wave;

  const revived = healingOf(state.roster) + state.bonus.revive;
  if (revived > 0 && squadSize(state.roster) > 0) {
    const gained = addUnits(state.roster, revived);
    if (gained > 0) {
      effect(state, "heal", state.playerX, 0.5, gained);
    }
  }

  const finished = state.level ? state.wave >= state.level.waves.length : false;

  if (state.level && finished) {
    const kind = state.level.objective.kind;
    if (kind === "zone" || kind === "extract") {
      state.wave += 1;
      beginWave(state);
      return;
    }
    if (objectiveMet(state, true)) {
      state.phase = "won";
      effect(state, "star", 0, 0, 1);
      return;
    }
    state.phase = "over";
    return;
  }

  state.offer = rollOffer(state);
  state.phase = "upgrade";
}

export function chooseUpgrade(state: GunlineState, id: string): void {
  if (state.phase !== "upgrade") {
    return;
  }

  applyUpgrade(state, id);
  state.offer = [];
  state.wave += 1;
  beginWave(state);
}

export function triggerAbility(state: GunlineState, id: AbilityId, aimX: number): boolean {
  if (state.phase !== "wave" && state.phase !== "corridor") {
    return false;
  }

  const runtime = state.abilities.find((ability) => ability.id === id);
  if (!runtime || state.time < runtime.readyAt) {
    return false;
  }

  const spec = ABILITIES[id];
  runtime.readyAt = state.time + spec.cooldown * state.bonus.cooldown;
  runtime.activeUntil = state.time + spec.duration;
  effect(state, "ability", aimX, 0, 1);

  const damage = waveHealth(threatOf(state), state.rules) * spec.power * 0.12;

  if (id === "airstrike") {
    for (let index = 0; index < 4; index += 1) {
      state.strikes.push({
        id: state.nextId++,
        x: aimX,
        z: -4 - index * 4,
        radius: spec.radius,
        damage,
        landsAt: state.time + 0.35 + index * 0.16,
        hostile: false,
      });
    }
  } else if (id === "mortar") {
    state.strikes.push({
      id: state.nextId++,
      x: aimX,
      z: -9,
      radius: spec.radius,
      damage,
      landsAt: state.time + 2.4,
      hostile: false,
    });
  } else if (id === "reinforce") {
    const gained = addUnits(state.roster, spec.power + state.bonus.revive);
    effect(state, "heal", state.playerX, 0.5, gained);
  }

  return true;
}

export function abilityReady(state: GunlineState, id: AbilityId): number {
  const runtime = state.abilities.find((ability) => ability.id === id);
  if (!runtime) {
    return 1;
  }
  const spec = ABILITIES[id];
  const total = spec.cooldown * state.bonus.cooldown;
  const left = runtime.readyAt - state.time;
  if (left <= 0) {
    return 1;
  }
  return Math.max(0, 1 - left / total);
}

export function stepRun(state: GunlineState, dt: number, targetX: number): void {
  if (state.phase !== "wave" && state.phase !== "corridor") {
    return;
  }

  state.time += dt;
  state.playerX += (targetX - state.playerX) * Math.min(1, dt * 14);
  state.playerX = Math.max(-PLAYER_BOUND, Math.min(PLAYER_BOUND, state.playerX));

  const rate = state.mods.fireRate * (adrenalineActive(state) ? 2 : 1);
  state.fireTimer -= dt;
  if (state.fireTimer <= 0) {
    state.fireTimer = state.weapon.interval / Math.max(0.05, rate);
    fire(state);
  }

  if (state.phase === "corridor") {
    stepCorridor(state);
    stepGates(state, dt);
    stepBullets(state, dt);
    return;
  }

  const objective = state.level?.objective;
  if (objective?.kind === "zone" && Math.abs(state.playerX) < 1.2) {
    state.zoneTimer += dt;
  }
  if (objective?.kind === "extract") {
    state.extractLeft = Math.max(0, state.extractLeft - dt);
  }

  stepSpawns(state, dt);
  stepEnemies(state, dt);
  stepGates(state, dt);
  stepStrikes(state);
  stepBullets(state, dt);

  if (state.phase !== "wave") {
    return;
  }

  if (objectiveFailed(state)) {
    state.phase = "over";
    return;
  }

  if (objective && (objective.kind === "zone" || objective.kind === "extract")) {
    if (objectiveMet(state, false)) {
      state.phase = "won";
      effect(state, "star", 0, 0, 1);
      return;
    }
  }

  const alive = state.enemies.some((enemy) => enemy.dyingAt === 0);
  if (state.spawnsLeft <= 0 && !alive && state.gates.length === 0 && state.strikes.length === 0) {
    endWave(state);
  }
}
