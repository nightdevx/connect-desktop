import { Object3D, Vector3 } from "three";
import { ENEMY_SPECS, type EnemyKind, type GunlineEnemy, type GunlineState } from "../gunline";
import type { GunlineAssets, Soldier } from "./models";
import type { SoldierPool } from "./soldier-pool";

const GUN_OFFSET = new Vector3(0, -0.86, 0.24);
const GUN_SCALE = 1.1;
const ARMED: readonly EnemyKind[] = ["marksman", "apc", "commander", "mortar", "shield"];

interface EnemyEntry {
  soldier: Soldier;
  kind: EnemyKind;
  gun: Object3D | null;
}

export class EnemyView {
  private readonly entries = new Map<number, EnemyEntry>();

  public constructor(
    private readonly pool: SoldierPool,
    private readonly assets: GunlineAssets,
  ) {}

  private poseOf(enemy: GunlineEnemy): "walk" | "sprint" | "die" | "holding-both-shoot" {
    if (enemy.dyingAt > 0) {
      return "die";
    }
    const spec = ENEMY_SPECS[enemy.kind];
    if (enemy.z >= spec.stopZ) {
      return "holding-both-shoot";
    }
    return spec.speed >= 3 ? "sprint" : "walk";
  }

  public sync(state: GunlineState): void {
    const seen = new Set<number>();

    for (const enemy of state.enemies) {
      seen.add(enemy.id);
      let entry = this.entries.get(enemy.id);

      if (!entry) {
        const soldier = this.pool.take(enemy.kind);
        let gun: Object3D | null = null;
        if (ARMED.includes(enemy.kind)) {
          gun = this.assets.createGun("pistol");
          gun.scale.setScalar(GUN_SCALE);
          gun.position.copy(GUN_OFFSET);
          (soldier.hand ?? soldier.root).add(gun);
        }
        entry = { soldier, kind: enemy.kind, gun };
        this.entries.set(enemy.id, entry);
      }

      const spec = ENEMY_SPECS[enemy.kind];
      const root = entry.soldier.root;
      root.position.set(enemy.x, spec.flying ? 1.4 + Math.sin(enemy.wobble * 2) * 0.16 : 0, enemy.z);
      root.rotation.y = 0;
      root.scale.setScalar(this.pool.unitScale * enemy.scale);
      entry.soldier.play(this.poseOf(enemy));
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) {
        continue;
      }
      if (entry.gun) {
        (entry.soldier.hand ?? entry.soldier.root).remove(entry.gun);
      }
      this.pool.release(entry.kind, entry.soldier);
      this.entries.delete(id);
    }
  }

  public update(dt: number): void {
    for (const entry of this.entries.values()) {
      entry.soldier.update(dt);
    }
  }

  public dispose(): void {
    for (const entry of this.entries.values()) {
      if (entry.gun) {
        (entry.soldier.hand ?? entry.soldier.root).remove(entry.gun);
      }
      this.pool.release(entry.kind, entry.soldier);
    }
    this.entries.clear();
  }
}
