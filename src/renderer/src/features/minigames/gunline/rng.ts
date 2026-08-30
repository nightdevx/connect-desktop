export interface RngCursor {
  seed: number;
}

export function nextRandom(cursor: RngCursor): number {
  cursor.seed = (cursor.seed + 0x6d2b79f5) >>> 0;
  let t = cursor.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function pickRandom<T>(cursor: RngCursor, items: readonly T[]): T {
  return items[Math.floor(nextRandom(cursor) * items.length) % items.length];
}

export function rangeRandom(cursor: RngCursor, low: number, high: number): number {
  return low + nextRandom(cursor) * (high - low);
}

export function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
