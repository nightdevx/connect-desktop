import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  ENEMY_SPECS,
  MAX_BULLETS,
  unitOffsets,
  type GunlineEnemy,
  type GunlineGate,
  type GunlineState,
} from "../gunline-logic";
import { loadGunlineAssets, type GunlineAssets, type Soldier, type SoldierSkin } from "./models";

const UNIT_HEIGHT = 1.5;
const LANE_WIDTH = 9;
const LANE_LENGTH = 62;
const GUN_OFFSET = new Vector3(0, -0.86, 0.24);
const GUN_SCALE = 1.1;
const MAX_PARTICLES = 220;
const MAX_SHADOWS = 96;
const MAX_HOSTILE = 160;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: Color;
}

interface EnemyView {
  soldier: Soldier;
  skin: SoldierSkin;
  gun: Object3D | null;
}

interface GateView {
  group: Group;
  slab: Mesh<BoxGeometry, MeshStandardMaterial>;
  label: Mesh<PlaneGeometry, MeshBasicMaterial>;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  text: string;
}

function cssColor(name: string, fallback: number): Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) {
    return new Color(fallback);
  }
  try {
    return new Color(raw);
  } catch {
    return new Color(fallback);
  }
}

function laneTexture(base: Color, stripe: Color): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = `#${base.getHexString()}`;
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = `#${stripe.getHexString()}`;
    context.fillRect(0, 0, 64, 6);
    context.globalAlpha = 0.5;
    context.fillRect(0, 32, 64, 3);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 22);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function blobTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  return texture;
}

function sparkTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.65)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  return texture;
}

export class GunlineScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 140);
  private readonly resizeObserver: ResizeObserver;

  private readonly squad: Soldier[] = [];
  private readonly squadGuns: (Object3D | null)[] = [];
  private readonly enemies = new Map<number, EnemyView>();
  private readonly recycled = new Map<SoldierSkin, Soldier[]>();
  private readonly gates: GateView[] = [];

  private readonly bullets: InstancedMesh;
  private readonly hostileBullets: InstancedMesh;
  private readonly shadows: InstancedMesh;
  private readonly sparks: InstancedMesh;

  private readonly particles: Particle[] = [];
  private readonly lane: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private readonly laneMap: CanvasTexture;

  private readonly dummy = new Object3D();
  private readonly rails: Mesh[] = [];
  private readonly blobMap: CanvasTexture;
  private readonly sparkMap: CanvasTexture;
  private readonly cameraHome = new Vector3(0, 5.4, 8.2);
  private readonly cameraLook = new Vector3(0, 1.2, -6.5);

  private readonly accentColor: Color;
  private readonly dangerColor: Color;
  private readonly successColor: Color;
  private readonly fireColor: Color;

  private readonly soldierScale: number;
  private shake = 0;
  private laneScroll = 0;
  private weaponId = "pistol";
  private disposed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: GunlineAssets,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;

    this.soldierScale = UNIT_HEIGHT / this.assets.characterHeight;

    const bed = cssColor("--ct-board-bed", 0x0e0e11);
    const cell = cssColor("--ct-board-cell", 0x23232a);
    this.accentColor = cssColor("--ct-accent", 0xffffff);
    this.dangerColor = cssColor("--ct-danger", 0xef4444);
    this.successColor = cssColor("--ct-success", 0x10b981);
    this.fireColor = cssColor("--ct-fire", 0xff8a2b);

    this.scene.fog = new Fog(bed.getHex(), 34, 78);

    this.scene.add(new HemisphereLight(0xdfe7ff, cell.getHex(), 1.35));
    const key = new DirectionalLight(0xfff4e2, 2.1);
    key.position.set(4, 9, 6);
    this.scene.add(key);
    const rim = new DirectionalLight(0x9fc4ff, 0.9);
    rim.position.set(-5, 5, -8);
    this.scene.add(rim);

    this.laneMap = laneTexture(cell, bed.clone().lerp(cell, 2));
    this.lane = new Mesh(
      new PlaneGeometry(LANE_WIDTH, LANE_LENGTH),
      new MeshStandardMaterial({ map: this.laneMap, roughness: 0.95, metalness: 0 }),
    );
    this.lane.rotation.x = -Math.PI / 2;
    this.lane.position.set(0, 0, -LANE_LENGTH / 2 + 6);
    this.scene.add(this.lane);

    const railMaterial = new MeshStandardMaterial({ color: cell.getHex(), roughness: 0.7 });
    for (const side of [-1, 1]) {
      const rail = new Mesh(new BoxGeometry(0.5, 0.9, LANE_LENGTH), railMaterial);
      rail.position.set(side * (LANE_WIDTH / 2 - 0.25), 0.45, -LANE_LENGTH / 2 + 6);
      this.rails.push(rail);
      this.scene.add(rail);
    }

    this.bullets = new InstancedMesh(
      new BoxGeometry(0.09, 0.09, 0.62),
      new MeshBasicMaterial({ color: this.fireColor.getHex() }),
      MAX_BULLETS,
    );
    this.bullets.frustumCulled = false;
    this.scene.add(this.bullets);

    this.hostileBullets = new InstancedMesh(
      new SphereGeometry(0.14, 8, 6),
      new MeshBasicMaterial({ color: this.dangerColor.getHex() }),
      MAX_HOSTILE,
    );
    this.hostileBullets.frustumCulled = false;
    this.scene.add(this.hostileBullets);

    this.blobMap = blobTexture();
    this.shadows = new InstancedMesh(
      new CircleGeometry(0.45, 14),
      new MeshBasicMaterial({ map: this.blobMap, transparent: true, depthWrite: false, opacity: 0.75 }),
      MAX_SHADOWS,
    );
    this.shadows.frustumCulled = false;
    this.scene.add(this.shadows);

    this.sparkMap = sparkTexture();
    this.sparks = new InstancedMesh(
      new PlaneGeometry(0.5, 0.5),
      new MeshBasicMaterial({
        map: this.sparkMap,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
      MAX_PARTICLES,
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    this.camera.position.copy(this.cameraHome);
    this.camera.lookAt(this.cameraLook);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  public dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    const owned: Mesh[] = [
      this.lane,
      this.bullets,
      this.hostileBullets,
      this.shadows,
      this.sparks,
      ...this.rails,
    ];
    for (const mesh of owned) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material.dispose();
      }
    }

    for (const gate of this.gates) {
      gate.slab.geometry.dispose();
      gate.slab.material.dispose();
      gate.label.geometry.dispose();
      gate.label.material.dispose();
      gate.texture.dispose();
    }

    this.laneMap.dispose();
    this.blobMap.dispose();
    this.sparkMap.dispose();
    this.renderer.dispose();
  }

  public render(state: GunlineState, dt: number): void {
    if (this.disposed) {
      return;
    }

    this.consumeEffects(state);
    this.syncSquad(state);
    this.syncEnemies(state);
    this.syncGates(state);
    this.syncBullets(state);
    this.syncShadows(state);
    this.stepParticles(dt);

    for (const soldier of this.squad) {
      soldier.update(dt);
    }
    for (const view of this.enemies.values()) {
      view.soldier.update(dt);
    }

    this.laneScroll = (this.laneScroll + dt * 0.35) % 1;
    this.laneMap.offset.y = -this.laneScroll;

    this.shake = Math.max(0, this.shake - dt * 2.6);
    const jitter = this.shake * 0.22;
    this.camera.position.set(
      this.cameraHome.x + (Math.random() - 0.5) * jitter,
      this.cameraHome.y + (Math.random() - 0.5) * jitter,
      this.cameraHome.z,
    );
    this.camera.lookAt(this.cameraLook);

    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private takeSoldier(skin: SoldierSkin): Soldier {
    const pool = this.recycled.get(skin);
    const reused = pool?.pop();
    if (reused) {
      reused.root.visible = true;
      return reused;
    }
    const soldier = this.assets.createSoldier(skin);
    soldier.root.scale.setScalar(this.soldierScale);
    this.scene.add(soldier.root);
    return soldier;
  }

  private releaseSoldier(skin: SoldierSkin, soldier: Soldier): void {
    soldier.root.visible = false;
    soldier.pose = null;
    const pool = this.recycled.get(skin);
    if (pool) {
      pool.push(soldier);
    } else {
      this.recycled.set(skin, [soldier]);
    }
  }

  private syncSquad(state: GunlineState): void {
    const offsets = unitOffsets(state.units);
    const wanted = offsets.length;

    while (this.squad.length < wanted) {
      const soldier = this.takeSoldier("unit");
      const gun = this.assets.createGun(state.weapon.id);
      gun.scale.setScalar(GUN_SCALE);
      gun.position.copy(GUN_OFFSET);
      if (soldier.hand) {
        soldier.hand.add(gun);
      } else {
        soldier.root.add(gun);
      }
      this.squad.push(soldier);
      this.squadGuns.push(gun);
    }

    if (state.weapon.id !== this.weaponId) {
      this.weaponId = state.weapon.id;
      for (let index = 0; index < this.squad.length; index += 1) {
        const previous = this.squadGuns[index];
        const holder = this.squad[index].hand ?? this.squad[index].root;
        if (previous) {
          holder.remove(previous);
        }
        const gun = this.assets.createGun(state.weapon.id);
        gun.scale.setScalar(GUN_SCALE);
        gun.position.copy(GUN_OFFSET);
        holder.add(gun);
        this.squadGuns[index] = gun;
      }
    }

    const pose = state.phase === "wave" ? "holding-both-shoot" : "holding-both";

    for (let index = 0; index < this.squad.length; index += 1) {
      const soldier = this.squad[index];
      const offset = offsets[index];
      if (!offset) {
        soldier.root.visible = false;
        continue;
      }
      soldier.root.visible = true;
      soldier.root.position.set(state.playerX + offset.x, 0, offset.z);
      soldier.root.rotation.y = Math.PI;
      soldier.play(pose);
    }
  }

  private enemyPose(enemy: GunlineEnemy): "walk" | "sprint" | "die" | "holding-both-shoot" {
    if (enemy.dyingAt > 0) {
      return "die";
    }
    const spec = ENEMY_SPECS[enemy.kind];
    if (enemy.z >= spec.stopZ) {
      return "holding-both-shoot";
    }
    return enemy.kind === "runner" ? "sprint" : "walk";
  }

  private syncEnemies(state: GunlineState): void {
    const seen = new Set<number>();

    for (const enemy of state.enemies) {
      seen.add(enemy.id);
      let view = this.enemies.get(enemy.id);

      if (!view) {
        const soldier = this.takeSoldier(enemy.kind);
        let gun: Object3D | null = null;
        if (enemy.kind === "shooter" || enemy.kind === "boss") {
          gun = this.assets.createGun("pistol");
          gun.scale.setScalar(GUN_SCALE);
          gun.position.copy(GUN_OFFSET);
          (soldier.hand ?? soldier.root).add(gun);
        }
        view = { soldier, skin: enemy.kind, gun };
        this.enemies.set(enemy.id, view);
      }

      const soldier = view.soldier;
      soldier.root.position.set(enemy.x, 0, enemy.z);
      soldier.root.rotation.y = 0;
      soldier.root.scale.setScalar(this.soldierScale * enemy.scale);
      soldier.play(this.enemyPose(enemy));
    }

    for (const [id, view] of this.enemies) {
      if (!seen.has(id)) {
        if (view.gun) {
          (view.soldier.hand ?? view.soldier.root).remove(view.gun);
        }
        view.soldier.root.scale.setScalar(this.soldierScale);
        this.releaseSoldier(view.skin, view.soldier);
        this.enemies.delete(id);
      }
    }
  }

  private gateText(gate: GunlineGate): string {
    return gate.kind === "mul" ? `x${gate.value.toFixed(1)}` : `${gate.value > 0 ? "+" : ""}${gate.value}`;
  }

  private paintGate(view: GateView, gate: GunlineGate): void {
    const text = this.gateText(gate);
    const tone = gate.good ? this.successColor : this.dangerColor;
    view.slab.material.color.copy(tone);
    view.slab.material.emissive.copy(tone);

    if (view.text === text) {
      return;
    }
    view.text = text;

    const context = view.canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, view.canvas.width, view.canvas.height);
      context.fillStyle = "#ffffff";
      context.font = "bold 120px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, view.canvas.width / 2, view.canvas.height / 2);
    }
    view.texture.needsUpdate = true;
  }

  private syncGates(state: GunlineState): void {
    while (this.gates.length < state.gates.length) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 128;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;

      const slab = new Mesh(
        new BoxGeometry(1.9, 1.8, 0.14),
        new MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.42,
          roughness: 0.4,
        }),
      );
      slab.position.y = 0.9;

      const label = new Mesh(
        new PlaneGeometry(1.6, 0.8),
        new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
      );
      label.position.set(0, 0.95, 0.1);

      const group = new Group();
      group.add(slab, label);
      this.scene.add(group);
      this.gates.push({ group, slab, label, canvas, texture, text: "" });
    }

    for (let index = 0; index < this.gates.length; index += 1) {
      const view = this.gates[index];
      const gate = state.gates[index];
      if (!gate) {
        view.group.visible = false;
        continue;
      }
      view.group.visible = true;
      view.group.position.set(gate.x, 0, gate.z);
      this.paintGate(view, gate);
    }
  }

  private syncBullets(state: GunlineState): void {
    let friendly = 0;
    let hostile = 0;

    for (const bullet of state.bullets) {
      if (bullet.hostile) {
        if (hostile >= MAX_HOSTILE) {
          continue;
        }
        this.dummy.position.set(bullet.x, 0.85, bullet.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.hostileBullets.setMatrixAt(hostile, this.dummy.matrix);
        hostile += 1;
        continue;
      }

      if (friendly >= MAX_BULLETS) {
        continue;
      }
      this.dummy.position.set(bullet.x, 0.85, bullet.z);
      this.dummy.rotation.set(0, Math.atan2(bullet.vx, bullet.vz), 0);
      this.dummy.scale.set(1, 1, bullet.crit ? 1.6 : 1);
      this.dummy.updateMatrix();
      this.bullets.setMatrixAt(friendly, this.dummy.matrix);
      friendly += 1;
    }

    this.bullets.count = friendly;
    this.bullets.instanceMatrix.needsUpdate = true;
    this.hostileBullets.count = hostile;
    this.hostileBullets.instanceMatrix.needsUpdate = true;
  }

  private syncShadows(state: GunlineState): void {
    let index = 0;

    const place = (x: number, z: number, radius: number): void => {
      if (index >= MAX_SHADOWS) {
        return;
      }
      this.dummy.position.set(x, 0.02, z);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.setScalar(radius);
      this.dummy.updateMatrix();
      this.shadows.setMatrixAt(index, this.dummy.matrix);
      index += 1;
    };

    for (const offset of unitOffsets(state.units)) {
      place(state.playerX + offset.x, offset.z, 1);
    }
    for (const enemy of state.enemies) {
      place(enemy.x, enemy.z, enemy.scale);
    }

    this.shadows.count = index;
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  private spawnParticles(
    count: number,
    x: number,
    z: number,
    y: number,
    color: Color,
    speed: number,
    life: number,
    size: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      if (this.particles.length >= MAX_PARTICLES) {
        this.particles.shift();
      }
      this.particles.push({
        x,
        y,
        z,
        vx: (Math.random() - 0.5) * speed,
        vy: Math.random() * speed * 0.8,
        vz: (Math.random() - 0.5) * speed,
        life,
        maxLife: life,
        size,
        color,
      });
    }
  }

  private consumeEffects(state: GunlineState): void {
    for (const item of state.effects) {
      if (item.kind === "muzzle") {
        this.spawnParticles(1, item.x, item.z, 0.9, this.fireColor, 1.2, 0.09, 0.55);
      } else if (item.kind === "impact") {
        this.spawnParticles(item.value > 0 ? 5 : 2, item.x, item.z, 0.9, this.accentColor, 2.4, 0.22, 0.3);
      } else if (item.kind === "kill") {
        this.spawnParticles(8, item.x, item.z, 0.7, this.fireColor, 3.2, 0.45, 0.45);
        this.shake = Math.min(1, this.shake + 0.05);
      } else if (item.kind === "blast") {
        this.spawnParticles(26, item.x, item.z, 1, this.fireColor, 6, 0.8, 0.9);
        this.shake = 1;
      } else if (item.kind === "gate") {
        this.spawnParticles(
          14,
          item.x,
          item.z,
          1.1,
          item.value >= 0 ? this.successColor : this.dangerColor,
          3.4,
          0.6,
          0.6,
        );
      } else if (item.kind === "hurt" || item.kind === "leak") {
        this.spawnParticles(10, item.x, item.z, 0.8, this.dangerColor, 3, 0.5, 0.5);
        this.shake = Math.min(1, this.shake + 0.45);
      }
    }
    state.effects.length = 0;
  }

  private stepParticles(dt: number): void {
    let index = 0;

    for (let cursor = this.particles.length - 1; cursor >= 0; cursor -= 1) {
      const particle = this.particles[cursor];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(cursor, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vy -= dt * 3.4;
    }

    for (const particle of this.particles) {
      if (index >= MAX_PARTICLES) {
        break;
      }
      const fade = particle.life / particle.maxLife;
      this.dummy.position.set(particle.x, Math.max(0.05, particle.y), particle.z);
      this.dummy.quaternion.copy(this.camera.quaternion);
      this.dummy.scale.setScalar(particle.size * fade);
      this.dummy.updateMatrix();
      this.sparks.setMatrixAt(index, this.dummy.matrix);
      this.sparks.setColorAt(index, particle.color);
      index += 1;
    }

    this.sparks.count = index;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) {
      this.sparks.instanceColor.needsUpdate = true;
    }
  }
}

export async function createGunlineScene(canvas: HTMLCanvasElement): Promise<GunlineScene> {
  const assets = await loadGunlineAssets();
  return new GunlineScene(canvas, assets);
}
