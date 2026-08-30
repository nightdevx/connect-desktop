import type { Scene } from "three";
import type { TerrainId } from "../gunline";
import type { GunlineAssets, Soldier, SoldierSkin } from "./models";

export class SoldierPool {
  private readonly recycled = new Map<string, Soldier[]>();
  private readonly live: Soldier[] = [];

  public constructor(
    private readonly scene: Scene,
    private readonly assets: GunlineAssets,
    private readonly scale: number,
    private terrain: TerrainId,
  ) {}

  public setTerrain(terrain: TerrainId): void {
    this.terrain = terrain;
  }

  private keyOf(skin: SoldierSkin): string {
    return skin === "unit" ? `unit:${this.terrain}` : skin;
  }

  public take(skin: SoldierSkin): Soldier {
    const key = this.keyOf(skin);
    const reused = this.recycled.get(key)?.pop();
    if (reused) {
      reused.root.visible = true;
      reused.root.scale.setScalar(this.scale);
      return reused;
    }

    const soldier = this.assets.createSoldier(skin, this.terrain);
    soldier.root.scale.setScalar(this.scale);
    this.scene.add(soldier.root);
    this.live.push(soldier);
    return soldier;
  }

  public release(skin: SoldierSkin, soldier: Soldier): void {
    soldier.root.visible = false;
    soldier.pose = null;
    soldier.root.scale.setScalar(this.scale);

    const key = this.keyOf(skin);
    const pool = this.recycled.get(key);
    if (pool) {
      pool.push(soldier);
    } else {
      this.recycled.set(key, [soldier]);
    }
  }

  public get unitScale(): number {
    return this.scale;
  }

  public dispose(): void {
    for (const soldier of this.live) {
      this.scene.remove(soldier.root);
    }
    this.live.length = 0;
    this.recycled.clear();
  }
}
