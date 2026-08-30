export const PLAYER_BOUND = 2.7;
export const SPAWN_Z = -24;
export const LEAK_Z = 2.3;
export const MAX_UNITS = 99;
export const MAX_BULLETS = 700;
export const VOLLEY_CAP = 12;
export const UNIT_SPACING = 0.62;
export const UNIT_PER_ROW = 5;
export const UNIT_ROW_DEPTH = 0.78;
export const UNIT_DRAW_CAP = 24;
export const GATE_SPEED = 3.2;
export const GATE_HALF_WIDTH = 1.05;
export const BOSS_WAVE = 5;

export const GATE_ADD_HITS = 8;
export const GATE_MUL_HITS = 16;
export const GATE_ADD_CAP = 20;
export const GATE_MUL_CAP = 2.5;
export const GATE_ARMOR_CAP = 12;
export const GATE_CLASS_CAP = 8;

export const CORRIDOR_SPEED = 5.6;
export const CORRIDOR_ROW_GAP = 4.6;

export const STREAK_WINDOW = 2.2;
export const STREAK_BONUS_AT = 8;

export const AIR_ONLY_PENALTY = 0.25;
export const SHIELD_FRONT_ARC = 0.55;
export const ARMOR_CAP = 0.75;

export const CAMPAIGN_LEVELS = 60;
export const CHAPTER_SIZE = 10;
export const CHAPTERS = 6;

export const PROFILE_VERSION = 1;

export const WAVE_BASE_HEALTH = 42;
export const WAVE_HEALTH_GROWTH = 1.46;
export const SPAWN_INTERVAL_FLOOR = 0.2;

export const MODIFIER_SCALE = {
  night: { spread: 1.6, spawn: 1 },
  sandstorm: { spread: 1.9, spawn: 1 },
  scarce: { fireRate: 0.72, damage: 1.5 },
  fog: { spread: 1.4, spawn: 1 },
  rain: { gateCharge: 0.7 },
  surge: { spawn: 1.35, count: 1.25 },
} as const;
