import {
  AnimationMixer,
  Box3,
  Group,
  LoadingManager,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type AnimationAction,
  type AnimationClip,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneHierarchy } from "three/examples/jsm/utils/SkeletonUtils.js";
import characterUrl from "@/assets/gunline/character-a.glb?url";
import blasterPistolUrl from "@/assets/gunline/blaster-a.glb?url";
import blasterSmgUrl from "@/assets/gunline/blaster-e.glb?url";
import blasterShotgunUrl from "@/assets/gunline/blaster-j.glb?url";
import blasterRifleUrl from "@/assets/gunline/blaster-p.glb?url";
import colormapUrl from "@/assets/gunline/colormap.png";
import textureBaseUrl from "@/assets/gunline/texture-a.png";
import textureRunnerUrl from "@/assets/gunline/texture-e.png";
import textureGruntUrl from "@/assets/gunline/texture-h.png";
import textureTankUrl from "@/assets/gunline/texture-n.png";
import textureShooterUrl from "@/assets/gunline/texture-k.png";
import textureSplitterUrl from "@/assets/gunline/texture-c.png";
import textureBossUrl from "@/assets/gunline/texture-r.png";
import type { EnemyKind, WeaponId } from "../gunline-logic";

export type SoldierSkin = "unit" | EnemyKind;

export type SoldierPose =
  | "idle"
  | "walk"
  | "sprint"
  | "die"
  | "holding-both"
  | "holding-both-shoot";

const SKIN_TEXTURES: Partial<Record<SoldierSkin, string>> = {
  runner: textureRunnerUrl,
  grunt: textureGruntUrl,
  tank: textureTankUrl,
  shooter: textureShooterUrl,
  splitter: textureSplitterUrl,
  boss: textureBossUrl,
};

const WEAPON_MODELS: Record<WeaponId, string> = {
  pistol: blasterPistolUrl,
  smg: blasterSmgUrl,
  shotgun: blasterShotgunUrl,
  rifle: blasterRifleUrl,
};

const EXTERNAL_TEXTURES: Record<string, string> = {
  "texture-a.png": textureBaseUrl,
  "colormap.png": colormapUrl,
};

export interface Soldier {
  root: Group;
  hand: Object3D | null;
  pose: SoldierPose | null;
  play: (pose: SoldierPose, fade?: number) => void;
  update: (dt: number) => void;
}

export interface GunlineAssets {
  characterHeight: number;
  createSoldier: (skin: SoldierSkin) => Soldier;
  createGun: (weapon: WeaponId) => Object3D;
}

let pending: Promise<GunlineAssets> | null = null;

function textureOf(root: Object3D): Texture | null {
  let found: Texture | null = null;
  root.traverse((child) => {
    if (found || !(child instanceof Mesh)) {
      return;
    }
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    const map = (material as MeshStandardMaterial).map;
    if (map) {
      found = map;
    }
  });
  return found;
}

function litMaterial(map: Texture | null): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: map ? 0xffffff : 0xb9c2cc,
    roughness: 0.86,
    metalness: 0,
  });
  if (map) {
    material.map = map;
    material.needsUpdate = true;
  }
  return material;
}

function matchTransform(source: Texture | null, target: Texture): Texture {
  if (source) {
    target.offset.copy(source.offset);
    target.repeat.copy(source.repeat);
    target.center.copy(source.center);
    target.rotation = source.rotation;
    target.wrapS = source.wrapS;
    target.wrapT = source.wrapT;
    target.flipY = source.flipY;
  }
  target.needsUpdate = true;
  return target;
}

async function build(): Promise<GunlineAssets> {
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    const name = url.split("/").pop() ?? "";
    return EXTERNAL_TEXTURES[name] ?? url;
  });

  const gltfLoader = new GLTFLoader(manager);
  const textureLoader = new TextureLoader();

  const [character, ...guns] = await Promise.all([
    gltfLoader.loadAsync(characterUrl),
    gltfLoader.loadAsync(WEAPON_MODELS.pistol),
    gltfLoader.loadAsync(WEAPON_MODELS.smg),
    gltfLoader.loadAsync(WEAPON_MODELS.shotgun),
    gltfLoader.loadAsync(WEAPON_MODELS.rifle),
  ]);

  const source = character.scene;
  const baseMap = textureOf(source);

  const alternates = await Promise.all(
    Object.entries(SKIN_TEXTURES).map(async ([skin, url]) => {
      const texture = await textureLoader.loadAsync(url);
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = false;
      texture.magFilter = NearestFilter;
      return [skin as SoldierSkin, matchTransform(baseMap, texture)] as const;
    }),
  );
  const textures = new Map<SoldierSkin, Texture>(alternates);

  const clips = new Map<string, AnimationClip>(
    character.animations.map((clip) => [clip.name, clip]),
  );

  const size = new Box3().setFromObject(source).getSize(new Vector3());
  const characterHeight = size.y || 1;

  const materials = new Map<SoldierSkin, MeshStandardMaterial>();
  const materialFor = (skin: SoldierSkin): MeshStandardMaterial => {
    const cached = materials.get(skin);
    if (cached) {
      return cached;
    }
    const made = litMaterial(textures.get(skin) ?? baseMap);
    materials.set(skin, made);
    return made;
  };

  const gunScenes: Record<WeaponId, Object3D> = {
    pistol: guns[0].scene,
    smg: guns[1].scene,
    shotgun: guns[2].scene,
    rifle: guns[3].scene,
  };
  const gunMaterials = new Map<WeaponId, MeshStandardMaterial>();
  const gunMaterialFor = (weapon: WeaponId): MeshStandardMaterial => {
    const cached = gunMaterials.get(weapon);
    if (cached) {
      return cached;
    }
    const made = litMaterial(textureOf(gunScenes[weapon]));
    gunMaterials.set(weapon, made);
    return made;
  };

  const createSoldier = (skin: SoldierSkin): Soldier => {
    const root = cloneHierarchy(source) as Group;
    const material = materialFor(skin);

    root.traverse((child) => {
      if (child instanceof Mesh) {
        child.material = material;
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = false;
      }
    });

    const mixer = new AnimationMixer(root);
    const actions = new Map<SoldierPose, AnimationAction>();
    let current: AnimationAction | null = null;

    const soldier: Soldier = {
      root,
      hand: root.getObjectByName("arm-right") ?? null,
      pose: null,
      play: (pose, fade = 0.18) => {
        if (soldier.pose === pose) {
          return;
        }
        const clip = clips.get(pose);
        if (!clip) {
          return;
        }
        let action = actions.get(pose);
        if (!action) {
          action = mixer.clipAction(clip, root);
          actions.set(pose, action);
        }
        action.reset();
        if (pose === "die") {
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(LoopRepeat, Infinity);
        }
        action.enabled = true;
        action.setEffectiveTimeScale(1);
        action.setEffectiveWeight(1);
        if (current && fade > 0) {
          action.crossFadeFrom(current, fade, false);
        }
        action.play();
        current = action;
        soldier.pose = pose;
      },
      update: (dt) => mixer.update(dt),
    };

    return soldier;
  };

  const createGun = (weapon: WeaponId): Object3D => {
    const gun = gunScenes[weapon].clone(true);
    const material = gunMaterialFor(weapon);
    gun.traverse((child) => {
      if (child instanceof Mesh) {
        child.material = material;
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = false;
      }
    });
    return gun;
  };

  return { characterHeight, createSoldier, createGun };
}

export function loadGunlineAssets(): Promise<GunlineAssets> {
  if (!pending) {
    pending = build().catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
