import {
  AnimationMixer,
  Box3,
  CanvasTexture,
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
import type { EnemyKind, TerrainId, WeaponId } from "../gunline";

export type SoldierSkin = "unit" | EnemyKind;

export type SoldierPose =
  | "idle"
  | "walk"
  | "sprint"
  | "die"
  | "holding-both"
  | "holding-both-shoot";

const ENEMY_TEXTURES: Record<EnemyKind, string> = {
  militia: textureRunnerUrl,
  infantry: textureGruntUrl,
  heavy: textureTankUrl,
  marksman: textureShooterUrl,
  sapper: textureSplitterUrl,
  drone: textureBossUrl,
  apc: textureTankUrl,
  mortar: textureShooterUrl,
  medic: textureSplitterUrl,
  shield: textureGruntUrl,
  jammer: textureBossUrl,
  commander: textureBossUrl,
};

const WEAPON_MODELS: Record<WeaponId, string> = {
  pistol: blasterPistolUrl,
  smg: blasterSmgUrl,
  shotgun: blasterShotgunUrl,
  rifle: blasterRifleUrl,
  lmg: blasterSmgUrl,
  dmr: blasterRifleUrl,
  launcher: blasterShotgunUrl,
  rail: blasterRifleUrl,
};

const CAMO_TINTS: Record<TerrainId, [string, string]> = {
  range: ["#8d9c73", "#5c6b4a"],
  desert: ["#d9c08a", "#a9884f"],
  urban: ["#9aa3ad", "#5f6771"],
  forest: ["#7c9a6a", "#43603a"],
  snow: ["#e6edf5", "#a9b8c8"],
  industrial: ["#9a958c", "#5f5b53"],
};

const ENEMY_TINTS: [string, string] = ["#d8443a", "#7d1f18"];

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
  createSoldier: (skin: SoldierSkin, terrain: TerrainId) => Soldier;
  createGun: (weapon: WeaponId) => Object3D;
  dispose: () => void;
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

function tintTexture(source: Texture, tints: [string, string]): CanvasTexture | null {
  const image = source.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!image || !("width" in image) || !image.width) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(image as CanvasImageSource, 0, 0);

  const [light, dark] = tints;
  context.globalCompositeOperation = "source-atop";
  context.globalAlpha = 0.45;
  context.fillStyle = light;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const blotches = 26;
  context.globalAlpha = 0.36;
  context.fillStyle = dark;
  for (let index = 0; index < blotches; index += 1) {
    const angle = (index / blotches) * Math.PI * 2;
    const x = (Math.sin(angle * 3.1) * 0.5 + 0.5) * canvas.width;
    const y = (Math.cos(angle * 2.3) * 0.5 + 0.5) * canvas.height;
    const size = (canvas.width / 16) * (0.6 + (index % 4) * 0.2);
    context.beginPath();
    context.ellipse(x, y, size, size * 0.62, angle, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  return matchTransform(source, texture) as CanvasTexture;
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
    gltfLoader.loadAsync(blasterPistolUrl),
    gltfLoader.loadAsync(blasterSmgUrl),
    gltfLoader.loadAsync(blasterShotgunUrl),
    gltfLoader.loadAsync(blasterRifleUrl),
  ]);

  const source = character.scene;
  const baseMap = textureOf(source);

  const uniqueEnemyUrls = [...new Set(Object.values(ENEMY_TEXTURES))];
  const loaded = await Promise.all(
    uniqueEnemyUrls.map(async (url) => {
      const texture = await textureLoader.loadAsync(url);
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = false;
      texture.magFilter = NearestFilter;
      const tinted = tintTexture(texture, ENEMY_TINTS);
      return [url, matchTransform(baseMap, tinted ?? texture)] as const;
    }),
  );
  const byUrl = new Map(loaded);

  const clips = new Map<string, AnimationClip>(
    character.animations.map((clip) => [clip.name, clip]),
  );

  const size = new Box3().setFromObject(source).getSize(new Vector3());
  const characterHeight = size.y || 1;

  const camo = new Map<TerrainId, Texture | null>();
  const camoFor = (terrain: TerrainId): Texture | null => {
    if (camo.has(terrain)) {
      return camo.get(terrain) ?? null;
    }
    const made = baseMap ? tintTexture(baseMap, CAMO_TINTS[terrain]) : null;
    camo.set(terrain, made ?? baseMap);
    return made ?? baseMap;
  };

  const materials = new Map<string, MeshStandardMaterial>();
  const materialFor = (skin: SoldierSkin, terrain: TerrainId): MeshStandardMaterial => {
    const key = skin === "unit" ? `unit:${terrain}` : `enemy:${skin}`;
    const cached = materials.get(key);
    if (cached) {
      return cached;
    }
    const map = skin === "unit"
      ? camoFor(terrain)
      : byUrl.get(ENEMY_TEXTURES[skin]) ?? baseMap;
    const made = litMaterial(map);
    materials.set(key, made);
    return made;
  };

  const gunScenes: Record<string, Object3D> = {
    [blasterPistolUrl]: guns[0].scene,
    [blasterSmgUrl]: guns[1].scene,
    [blasterShotgunUrl]: guns[2].scene,
    [blasterRifleUrl]: guns[3].scene,
  };
  const gunMaterials = new Map<string, MeshStandardMaterial>();
  const gunMaterialFor = (url: string): MeshStandardMaterial => {
    const cached = gunMaterials.get(url);
    if (cached) {
      return cached;
    }
    const made = litMaterial(textureOf(gunScenes[url]));
    gunMaterials.set(url, made);
    return made;
  };

  const createSoldier = (skin: SoldierSkin, terrain: TerrainId): Soldier => {
    const root = cloneHierarchy(source) as Group;
    const material = materialFor(skin, terrain);

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
    const url = WEAPON_MODELS[weapon] ?? blasterPistolUrl;
    const gun = gunScenes[url].clone(true);
    const material = gunMaterialFor(url);
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

  const dispose = (): void => {
    for (const material of materials.values()) {
      material.dispose();
    }
    for (const material of gunMaterials.values()) {
      material.dispose();
    }
    for (const texture of camo.values()) {
      if (texture && texture !== baseMap) {
        texture.dispose();
      }
    }
  };

  return { characterHeight, createSoldier, createGun, dispose };
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
