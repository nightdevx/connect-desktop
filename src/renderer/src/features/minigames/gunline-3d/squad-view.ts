import { Object3D, Vector3 } from "three";
import { formation, type GunlineState, type SquadClass, type WeaponId } from "../gunline";
import type { GunlineAssets, Soldier } from "./models";
import type { SoldierPool } from "./soldier-pool";

const GUN_OFFSET = new Vector3(0, -0.86, 0.24);
const GUN_SCALE = 1.1;

const CLASS_SCALE: Record<SquadClass, number> = {
  rifleman: 1,
  sniper: 1,
  gunner: 1.08,
  grenadier: 1.05,
  medic: 0.96,
  engineer: 1.12,
};

interface SquadMember {
  soldier: Soldier;
  gun: Object3D | null;
  cls: SquadClass;
}

export class SquadView {
  private readonly members: SquadMember[] = [];
  private weaponId: WeaponId | "" = "";

  public constructor(
    private readonly pool: SoldierPool,
    private readonly assets: GunlineAssets,
  ) {}

  private attachGun(member: SquadMember, weapon: WeaponId): void {
    const holder = member.soldier.hand ?? member.soldier.root;
    if (member.gun) {
      holder.remove(member.gun);
    }
    const gun = this.assets.createGun(weapon);
    gun.scale.setScalar(GUN_SCALE);
    gun.position.copy(GUN_OFFSET);
    holder.add(gun);
    member.gun = gun;
  }

  public sync(state: GunlineState): void {
    const slots = formation(state.roster);

    while (this.members.length < slots.length) {
      const soldier = this.pool.take("unit");
      const member: SquadMember = { soldier, gun: null, cls: "rifleman" };
      this.attachGun(member, state.weapon.id);
      this.members.push(member);
    }

    if (state.weapon.id !== this.weaponId) {
      this.weaponId = state.weapon.id;
      for (const member of this.members) {
        this.attachGun(member, state.weapon.id);
      }
    }

    const pose = state.phase === "wave" || state.phase === "corridor"
      ? "holding-both-shoot"
      : "holding-both";

    for (let index = 0; index < this.members.length; index += 1) {
      const member = this.members[index];
      const slot = slots[index];
      if (!slot) {
        member.soldier.root.visible = false;
        continue;
      }
      member.cls = slot.cls;
      member.soldier.root.visible = true;
      member.soldier.root.position.set(state.playerX + slot.x, 0, slot.z);
      member.soldier.root.rotation.y = Math.PI;
      member.soldier.root.scale.setScalar(this.pool.unitScale * CLASS_SCALE[slot.cls]);
      member.soldier.play(pose);
    }
  }

  public update(dt: number): void {
    for (const member of this.members) {
      if (member.soldier.root.visible) {
        member.soldier.update(dt);
      }
    }
  }

  public dispose(): void {
    for (const member of this.members) {
      const holder = member.soldier.hand ?? member.soldier.root;
      if (member.gun) {
        holder.remove(member.gun);
      }
      this.pool.release("unit", member.soldier);
    }
    this.members.length = 0;
  }
}
