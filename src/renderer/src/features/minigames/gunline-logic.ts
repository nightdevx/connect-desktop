import type { RulesGunline } from "./difficulty";

export type GunlinePhase = "ready" | "wave" | "upgrade" | "over";

export type EnemyKind = "runner" | "grunt" | "tank" | "shooter" | "splitter" | "boss";

export type WeaponId = "pistol" | "smg" | "shotgun" | "rifle";

export type EffectKind = "muzzle" | "impact" | "kill" | "gate" | "leak" | "blast" | "hurt";

export const PLAYER_BOUND = 2.7;
export const SPAWN_Z = -24;
export const LEAK_Z = 2.3;
export const MAX_UNITS = 99;
export const MAX_BULLETS = 700;
export const VOLLEY_CAP = 10;
export const UNIT_SPACING = 0.62;
export const UNIT_PER_ROW = 5;
export const UNIT_ROW_DEPTH = 0.78;
export const GATE_SPEED = 3.2;
export const BOSS_WAVE = 5;

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
  slowUntil: number;
  hitAt: number;
  dyingAt: number;
}

export interface GunlineBullet {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  pierce: number;
  hostile: boolean;
  crit: boolean;
}

export interface GunlineGate {
  id: number;
  x: number;
  z: number;
  kind: "mul" | "add";
  value: number;
  charge: number;
  good: boolean;
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
  damage: number;
  interval: number;
  pellets: number;
  spread: number;
  speed: number;
}

export interface GunlineMods {
  damage: number;
  fireRate: number;
  pellets: number;
  pierce: number;
  crit: number;
  slow: boolean;
  explosive: boolean;
}

export interface GunlineUpgrade {
  id: string;
  label: string;
  detail: string;
  rarity: "common" | "rare" | "epic";
}

export interface GunlineState {
  phase: GunlinePhase;
  time: number;
  wave: number;
  playerX: number;
  units: number;
  score: number;
  kills: number;
  weapon: GunlineWeapon;
  mods: GunlineMods;
  fireTimer: number;
  spawnTimer: number;
  spawnsLeft: number;
  spawnInterval: number;
  waveSize: number;
  gateDropped: boolean;
  enemies: GunlineEnemy[];
  bullets: GunlineBullet[];
  gates: GunlineGate[];
  effects: GunlineEffect[];
  offer: GunlineUpgrade[];
  rules: RulesGunline;
  seed: number;
  nextId: number;
}

export const WEAPONS: Record<WeaponId, GunlineWeapon> = {
  pistol: {
    id: "pistol",
    label: "Tabanca",
    damage: 10,
    interval: 0.3,
    pellets: 1,
    spread: 0,
    speed: 18,
  },
  smg: {
    id: "smg",
    label: "Hafif Makineli",
    damage: 8,
    interval: 0.14,
    pellets: 1,
    spread: 0.05,
    speed: 20,
  },
  shotgun: {
    id: "shotgun",
    label: "Pompalı",
    damage: 9,
    interval: 0.5,
    pellets: 5,
    spread: 0.22,
    speed: 17,
  },
  rifle: {
    id: "rifle",
    label: "Tüfek",
    damage: 26,
    interval: 0.34,
    pellets: 1,
    spread: 0.02,
    speed: 24,
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = ["pistol", "smg", "shotgun", "rifle"];

interface KindSpec {
  health: number;
  speed: number;
  scale: number;
  radius: number;
  zigzag: number;
  stopZ: number;
  fireEvery: number;
}

export const ENEMY_SPECS: Record<EnemyKind, KindSpec> = {
  runner: { health: 0.6, speed: 3.6, scale: 0.9, radius: 0.42, zigzag: 0, stopZ: 99, fireEvery: 0 },
  grunt: { health: 1, speed: 2.3, scale: 1, radius: 0.46, zigzag: 0.9, stopZ: 99, fireEvery: 0 },
  tank: { health: 4, speed: 1.35, scale: 1.4, radius: 0.66, zigzag: 0, stopZ: 99, fireEvery: 0 },
  shooter: { health: 0.8, speed: 1.9, scale: 1, radius: 0.46, zigzag: 0, stopZ: -12, fireEvery: 1.7 },
  splitter: { health: 1.6, speed: 2, scale: 1.15, radius: 0.54, zigzag: 0.5, stopZ: 99, fireEvery: 0 },
  boss: { health: 42, speed: 1, scale: 2.2, radius: 1.15, zigzag: 0, stopZ: -9, fireEvery: 1.4 },
};

export function waveHealth(wave: number, rules: RulesGunline): number {
  return 42 * Math.pow(1.46, wave - 1) * rules.enemyHealth;
}

export function waveSizeOf(wave: number): number {
  return Math.round(4 + wave * 2);
}

export function spawnIntervalOf(wave: number, rules: RulesGunline): number {
  return Math.max(0.2, 1.1 - wave * 0.038) / rules.spawnRate;
}

export function spawnSpreadOf(wave: number): number {
  return Math.min(5.2, 2 + wave * 0.45);
}

export function isBossWave(wave: number): boolean {
  return wave % BOSS_WAVE === 0;
}

function rng(state: GunlineState): number {
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(state: GunlineState, items: readonly T[]): T {
  return items[Math.floor(rng(state) * items.length) % items.length];
}

export function unitOffsets(count: number): { x: number; z: number }[] {
  const shown = Math.min(count, 24);
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

export function squadHalfWidth(units: number): number {
  return (Math.min(units, UNIT_PER_ROW) * UNIT_SPACING) / 2 + 0.25;
}

export function createGunline(rules: RulesGunline, seed: number): GunlineState {
  return {
    phase: "ready",
    time: 0,
    wave: 1,
    playerX: 0,
    units: rules.startUnits,
    score: 0,
    kills: 0,
    weapon: { ...WEAPONS.pistol },
    mods: {
      damage: 1,
      fireRate: 1,
      pellets: 0,
      pierce: 0,
      crit: 0,
      slow: false,
      explosive: false,
    },
    fireTimer: 0,
    spawnTimer: 0.6,
    spawnsLeft: waveSizeOf(1),
    spawnInterval: spawnIntervalOf(1, rules),
    waveSize: waveSizeOf(1),
    gateDropped: false,
    enemies: [],
    bullets: [],
    gates: [],
    effects: [],
    offer: [],
    rules,
    seed: seed >>> 0,
    nextId: 1,
  };
}

function effect(state: GunlineState, kind: EffectKind, x: number, z: number, value = 0): void {
  if (state.effects.length > 120) {
    state.effects.shift();
  }
  state.effects.push({ kind, x, z, value, at: state.time });
}

function kindsFor(wave: number): EnemyKind[] {
  const kinds: EnemyKind[] = ["grunt", "runner"];
  if (wave >= 3) {
    kinds.push("tank");
  }
  if (wave >= 4) {
    kinds.push("shooter");
  }
  if (wave >= 6) {
    kinds.push("splitter");
  }
  return kinds;
}

function spawnEnemy(
  state: GunlineState,
  kind: EnemyKind,
  x: number,
  z: number,
  healthScale = 1,
): void {
  const spec = ENEMY_SPECS[kind];
  const health = waveHealth(state.wave, state.rules) * spec.health * healthScale;
  state.enemies.push({
    id: state.nextId++,
    kind,
    x,
    z,
    health,
    maxHealth: health,
    speed: spec.speed,
    scale: spec.scale,
    wobble: rng(state) * Math.PI * 2,
    fireAt: state.time + spec.fireEvery,
    slowUntil: 0,
    hitAt: 0,
    dyingAt: 0,
  });
}

function dropGates(state: GunlineState): void {
  const goodLeft = rng(state) < 0.5;
  const good: GunlineGate =
    rng(state) < 0.5
      ? {
          id: state.nextId++,
          x: 0,
          z: SPAWN_Z,
          kind: "mul",
          value: 1.2 + Math.floor(rng(state) * 3) * 0.2,
          charge: 0,
          good: true,
        }
      : {
          id: state.nextId++,
          x: 0,
          z: SPAWN_Z,
          kind: "add",
          value: 2 + Math.floor(rng(state) * 4),
          charge: 0,
          good: true,
        };
  const bad: GunlineGate =
    rng(state) < 0.5
      ? { id: state.nextId++, x: 0, z: SPAWN_Z, kind: "mul", value: 0.5, charge: 0, good: false }
      : {
          id: state.nextId++,
          x: 0,
          z: SPAWN_Z,
          kind: "add",
          value: -(3 + Math.floor(rng(state) * 6)),
          charge: 0,
          good: false,
        };

  good.x = goodLeft ? -1.5 : 1.5;
  bad.x = goodLeft ? 1.5 : -1.5;
  state.gates.push(good, bad);
  state.gateDropped = true;
}

export const GATE_ADD_HITS = 8;
export const GATE_MUL_HITS = 16;
export const GATE_ADD_CAP = 20;
export const GATE_MUL_CAP = 2.5;

export function gateHit(gate: GunlineGate): void {
  gate.charge += 1;
  if (gate.kind === "add") {
    if (gate.charge % GATE_ADD_HITS === 0) {
      gate.value = Math.min(GATE_ADD_CAP, gate.value + 1);
    }
  } else if (gate.charge % GATE_MUL_HITS === 0) {
    gate.value = Math.min(GATE_MUL_CAP, Math.round((gate.value + 0.1) * 10) / 10);
  }
  gate.good = gate.kind === "add" ? gate.value > 0 : gate.value >= 1;
}

function applyGate(state: GunlineState, gate: GunlineGate): void {
  const before = state.units;
  const next =
    gate.kind === "mul" ? Math.floor(state.units * gate.value) : state.units + gate.value;
  state.units = Math.max(1, Math.min(MAX_UNITS, next));
  effect(state, "gate", gate.x, gate.z, state.units - before);
}

function fire(state: GunlineState): void {
  const volley = Math.min(state.units, VOLLEY_CAP);
  if (volley <= 0) {
    return;
  }
  const offsets = unitOffsets(state.units);
  const scale = state.units / volley;
  const pellets = Math.max(1, state.weapon.pellets + state.mods.pellets);
  const damage = state.weapon.damage * state.mods.damage * scale;

  for (let index = 0; index < volley; index += 1) {
    const offset = offsets[index] ?? { x: 0, z: 0 };
    const originX = state.playerX + offset.x;
    const originZ = offset.z;
    effect(state, "muzzle", originX, originZ);

    for (let shot = 0; shot < pellets; shot += 1) {
      if (state.bullets.length >= MAX_BULLETS) {
        break;
      }
      const spread =
        state.weapon.spread * (pellets > 1 ? shot - (pellets - 1) / 2 : rng(state) - 0.5);
      const crit = rng(state) < state.mods.crit;
      state.bullets.push({
        id: state.nextId++,
        x: originX,
        z: originZ,
        vx: spread * state.weapon.speed,
        vz: -state.weapon.speed,
        damage: crit ? damage * 2 : damage,
        pierce: state.mods.pierce,
        hostile: false,
        crit,
      });
    }
  }
}

function killEnemy(state: GunlineState, enemy: GunlineEnemy): void {
  enemy.dyingAt = state.time;
  state.kills += 1;
  state.score += 10 + state.wave * 2 + (enemy.kind === "boss" ? 500 : 0);
  effect(state, enemy.kind === "boss" ? "blast" : "kill", enemy.x, enemy.z, enemy.scale);

  if (enemy.kind === "splitter") {
    spawnEnemy(state, "runner", enemy.x - 0.4, enemy.z, 0.4);
    spawnEnemy(state, "runner", enemy.x + 0.4, enemy.z, 0.4);
  }

  if (state.mods.explosive) {
    for (const other of state.enemies) {
      if (other.dyingAt > 0 || other.id === enemy.id) {
        continue;
      }
      const dx = other.x - enemy.x;
      const dz = other.z - enemy.z;
      if (dx * dx + dz * dz < 2.56) {
        other.health -= enemy.maxHealth * 0.4;
        other.hitAt = state.time;
        if (other.health <= 0) {
          killEnemy(state, other);
        }
      }
    }
  }
}

function damageEnemy(state: GunlineState, enemy: GunlineEnemy, amount: number): void {
  enemy.health -= amount;
  enemy.hitAt = state.time;
  if (state.mods.slow) {
    enemy.slowUntil = state.time + 1;
  }
  if (enemy.health <= 0) {
    killEnemy(state, enemy);
  }
}

function loseUnits(state: GunlineState, count: number, x: number, z: number): void {
  state.units = Math.max(0, state.units - count);
  effect(state, "hurt", x, z, count);
  if (state.units <= 0) {
    state.phase = "over";
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
      const spray = enemy.kind === "boss" ? [-0.28, 0, 0.28] : [0];
      for (const angle of spray) {
        state.bullets.push({
          id: state.nextId++,
          x: enemy.x,
          z: enemy.z,
          vx: angle * 9,
          vz: 9,
          damage: 1,
          pierce: 0,
          hostile: true,
          crit: false,
        });
      }
      effect(state, "muzzle", enemy.x, enemy.z);
    }

    if (enemy.z > LEAK_Z) {
      state.enemies.splice(index, 1);
      effect(state, "leak", enemy.x, enemy.z);
      loseUnits(state, enemy.kind === "boss" ? 3 : 1, enemy.x, enemy.z);
    }
  }
}

function stepBullets(state: GunlineState, dt: number): void {
  const half = squadHalfWidth(state.units);

  for (let index = state.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = state.bullets[index];
    bullet.x += bullet.vx * dt;
    bullet.z += bullet.vz * dt;

    if (bullet.z < SPAWN_Z - 4 || bullet.z > 6 || Math.abs(bullet.x) > 6) {
      state.bullets.splice(index, 1);
      continue;
    }

    if (bullet.hostile) {
      if (bullet.z > -0.4 && bullet.z < 2.4 && Math.abs(bullet.x - state.playerX) < half) {
        state.bullets.splice(index, 1);
        loseUnits(state, 1, bullet.x, bullet.z);
      }
      continue;
    }

    let consumed = false;

    for (const gate of state.gates) {
      if (Math.abs(bullet.x - gate.x) < 0.85 && Math.abs(bullet.z - gate.z) < 0.5) {
        gateHit(gate);
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
        const radius = ENEMY_SPECS[enemy.kind].radius;
        if (
          Math.abs(bullet.x - enemy.x) < radius &&
          Math.abs(bullet.z - enemy.z) < radius + 0.3
        ) {
          damageEnemy(state, enemy, bullet.damage);
          effect(state, "impact", bullet.x, bullet.z, bullet.crit ? 1 : 0);
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
  for (let index = state.gates.length - 1; index >= 0; index -= 1) {
    const gate = state.gates[index];
    gate.z += GATE_SPEED * dt;
    if (gate.z < LEAK_Z) {
      continue;
    }
    if (Math.abs(gate.x - state.playerX) < 0.95 + squadHalfWidth(state.units) * 0.5) {
      applyGate(state, gate);
    }
    state.gates.splice(index, 1);
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

  if (isBossWave(state.wave) && state.spawnsLeft === state.waveSize - 1) {
    spawnEnemy(state, "boss", 0, SPAWN_Z);
  } else {
    const kind = pick(state, kindsFor(state.wave));
    spawnEnemy(state, kind, (rng(state) - 0.5) * spawnSpreadOf(state.wave), SPAWN_Z - rng(state) * 3);
  }

  if (!state.gateDropped && state.spawnsLeft <= Math.floor(state.waveSize / 2)) {
    dropGates(state);
  }
}

const UPGRADE_POOL: readonly GunlineUpgrade[] = [
  { id: "damage", label: "Hasar +%25", detail: "Her mermi daha çok yakar.", rarity: "common" },
  { id: "rate", label: "Atış hızı +%20", detail: "Namlu soğumaz.", rarity: "common" },
  { id: "pellet", label: "+1 mermi", detail: "Her atışta bir mermi daha.", rarity: "rare" },
  { id: "pierce", label: "+1 delme", detail: "Mermi bir düşmanı daha deler.", rarity: "rare" },
  { id: "units", label: "+2 birim", detail: "Müfrezeye iki asker katılır.", rarity: "common" },
  { id: "crit", label: "Kritik +%10", detail: "Kritik vuruş iki kat hasar verir.", rarity: "rare" },
  {
    id: "slow",
    label: "Yavaşlatan mermi",
    detail: "Vurulan düşman bir saniye ağırlaşır.",
    rarity: "epic",
  },
  {
    id: "explosive",
    label: "Patlayıcı mermi",
    detail: "Ölen düşman çevresine hasar saçar.",
    rarity: "epic",
  },
];

function weaponUpgrade(state: GunlineState): GunlineUpgrade | null {
  const owned = WEAPON_ORDER.indexOf(state.weapon.id);
  const next = WEAPON_ORDER[owned + 1];
  if (!next) {
    return null;
  }
  return {
    id: `weapon:${next}`,
    label: WEAPONS[next].label,
    detail: "Silahını yükselt.",
    rarity: "epic",
  };
}

export function rollOffer(state: GunlineState): GunlineUpgrade[] {
  const pool = UPGRADE_POOL.filter(
    (upgrade) =>
      !(upgrade.id === "slow" && state.mods.slow) &&
      !(upgrade.id === "explosive" && state.mods.explosive),
  );
  const weapon = weaponUpgrade(state);
  if (weapon && rng(state) < 0.5) {
    pool.push(weapon);
  }

  const offer: GunlineUpgrade[] = [];
  while (offer.length < 3 && pool.length > 0) {
    const index = Math.floor(rng(state) * pool.length) % pool.length;
    offer.push(pool[index]);
    pool.splice(index, 1);
  }
  return offer;
}

export function chooseUpgrade(state: GunlineState, id: string): void {
  if (id.startsWith("weapon:")) {
    const next = id.slice("weapon:".length) as WeaponId;
    if (WEAPONS[next]) {
      state.weapon = { ...WEAPONS[next] };
    }
  } else if (id === "damage") {
    state.mods.damage *= 1.25;
  } else if (id === "rate") {
    state.mods.fireRate *= 1.2;
  } else if (id === "pellet") {
    state.mods.pellets += 1;
    state.weapon.spread = Math.max(state.weapon.spread, 0.08);
  } else if (id === "pierce") {
    state.mods.pierce += 1;
  } else if (id === "units") {
    state.units = Math.min(MAX_UNITS, state.units + 2);
  } else if (id === "crit") {
    state.mods.crit = Math.min(0.8, state.mods.crit + 0.1);
  } else if (id === "slow") {
    state.mods.slow = true;
  } else if (id === "explosive") {
    state.mods.explosive = true;
  }

  state.offer = [];
  state.wave += 1;
  state.waveSize = waveSizeOf(state.wave);
  state.spawnsLeft = state.waveSize;
  state.spawnInterval = spawnIntervalOf(state.wave, state.rules);
  state.spawnTimer = 0.8;
  state.gateDropped = false;
  state.phase = "wave";
}

export function startGunline(state: GunlineState): void {
  if (state.phase === "ready") {
    state.phase = "wave";
  }
}

export function stepGunline(state: GunlineState, dt: number, targetX: number): void {
  if (state.phase !== "wave") {
    return;
  }

  state.time += dt;
  state.playerX += (targetX - state.playerX) * Math.min(1, dt * 14);
  state.playerX = Math.max(-PLAYER_BOUND, Math.min(PLAYER_BOUND, state.playerX));

  state.fireTimer -= dt;
  if (state.fireTimer <= 0) {
    state.fireTimer = state.weapon.interval / state.mods.fireRate;
    fire(state);
  }

  stepSpawns(state, dt);
  stepEnemies(state, dt);
  stepGates(state, dt);
  stepBullets(state, dt);

  if (state.phase !== "wave") {
    return;
  }

  const alive = state.enemies.some((enemy) => enemy.dyingAt === 0);
  if (state.spawnsLeft <= 0 && !alive && state.gates.length === 0) {
    state.score += 100 * state.wave;
    state.offer = rollOffer(state);
    state.phase = "upgrade";
  }
}
