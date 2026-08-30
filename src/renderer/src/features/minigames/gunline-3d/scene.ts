import { Color, NeutralToneMapping, Scene, WebGLRenderer } from "three";
import { ENEMY_SPECS, type GunlineState } from "../gunline";
import { CameraRig } from "./camera";
import { EnemyView } from "./enemy-view";
import { Environment } from "./environment";
import { Floaters } from "./floaters";
import { GateView } from "./gate-view";
import { loadGunlineAssets, type GunlineAssets } from "./models";
import { SoldierPool } from "./soldier-pool";
import { SquadView } from "./squad-view";
import { Vfx } from "./vfx";

const UNIT_HEIGHT = 1.75;
const FRAME_SAMPLES = 45;

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

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export class GunlineScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly rig = new CameraRig();
  private readonly environment: Environment;
  private readonly pool: SoldierPool;
  private readonly squadView: SquadView;
  private readonly enemyView: EnemyView;
  private readonly gateView: GateView;
  private readonly vfx: Vfx;
  private readonly floaters: Floaters;
  private readonly resizeObserver: ResizeObserver;

  private readonly accentColor: Color;
  private readonly dangerColor: Color;
  private readonly successColor: Color;
  private readonly fireColor: Color;
  private readonly mutedColor: Color;

  private frameTotal = 0;
  private frameCount = 0;
  private quality = 1;
  private terrainApplied = "";
  private disposed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    assets: GunlineAssets,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;

    this.accentColor = cssColor("--ct-accent", 0xffffff);
    this.dangerColor = cssColor("--ct-danger", 0xef4444);
    this.successColor = cssColor("--ct-success", 0x10b981);
    this.fireColor = cssColor("--ct-warning", 0xff8a2b);
    this.mutedColor = cssColor("--ct-text-muted", 0x8a8a94);

    this.environment = new Environment(this.scene);
    this.pool = new SoldierPool(
      this.scene,
      assets,
      UNIT_HEIGHT / assets.characterHeight,
      "range",
    );
    this.squadView = new SquadView(this.pool, assets);
    this.enemyView = new EnemyView(this.pool, assets);
    this.gateView = new GateView(this.scene);
    this.vfx = new Vfx(this.scene, this.fireColor, this.dangerColor);
    this.floaters = new Floaters(this.scene);

    this.rig.setReducedMotion(prefersReducedMotion());
    this.renderer.setClearColor(this.environment.backgroundColor(), 1);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  public render(state: GunlineState, dt: number): void {
    if (this.disposed) {
      return;
    }

    this.trackFrame(dt);

    if (state.terrain !== this.terrainApplied) {
      this.terrainApplied = state.terrain;
      this.environment.apply(state.terrain);
      this.pool.setTerrain(state.terrain);
      this.renderer.setClearColor(this.environment.backgroundColor(), 1);
    }
    this.environment.setNight(state.modifiers.includes("night"));

    this.consumeEffects(state);

    this.squadView.sync(state);
    this.enemyView.sync(state);
    this.gateView.sync(state);
    this.vfx.syncBullets(state);
    this.vfx.syncShadows(state);
    this.vfx.syncRings(state);
    this.environment.setCrowd(state.spawnsLeft * 8);

    this.squadView.update(dt);
    this.enemyView.update(dt);
    this.environment.update(dt);
    this.vfx.step(dt, this.rig.camera);
    this.floaters.step(dt, this.rig.camera);

    const boss = state.enemies.some(
      (enemy) => ENEMY_SPECS[enemy.kind].boss && enemy.dyingAt === 0,
    );
    this.rig.setPhase(state.phase, boss);
    this.rig.update(dt);

    this.renderer.render(this.scene, this.rig.camera);
  }

  private trackFrame(dt: number): void {
    this.frameTotal += dt;
    this.frameCount += 1;
    if (this.frameCount < FRAME_SAMPLES) {
      return;
    }

    const average = this.frameTotal / this.frameCount;
    this.frameTotal = 0;
    this.frameCount = 0;

    const next = average > 0.024 ? Math.max(0.35, this.quality - 0.15) : Math.min(1, this.quality + 0.1);
    if (Math.abs(next - this.quality) < 0.01) {
      return;
    }
    this.quality = next;
    this.vfx.setBudget(next);
    this.floaters.setEnabled(next > 0.5);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, next > 0.6 ? 2 : 1));
  }

  private resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / height);
  }

  private consumeEffects(state: GunlineState): void {
    for (const item of state.effects) {
      switch (item.kind) {
        case "muzzle":
          this.vfx.spawn(1, item.x, item.z, 0.9, this.fireColor, 1.2, 0.09, 0.55);
          this.rig.addShake("fire", 0.012);
          break;
        case "impact":
          this.vfx.spawn(item.value > 0 ? 5 : 2, item.x, item.z, 0.9, this.accentColor, 2.4, 0.22, 0.3);
          break;
        case "kill":
          this.vfx.spawn(8, item.x, item.z, 0.7, this.fireColor, 3.2, 0.45, 0.45);
          this.rig.addShake("fire", 0.03);
          break;
        case "blast":
          this.vfx.spawn(26, item.x, item.z, 1, this.fireColor, 6, 0.8, 0.9);
          this.rig.addShake("blast", 0.7);
          break;
        case "gate":
          this.vfx.spawn(
            14,
            item.x,
            item.z,
            1.1,
            item.value >= 0 ? this.successColor : this.dangerColor,
            3.4,
            0.6,
            0.6,
          );
          if (item.value !== 0) {
            this.floaters.push(
              `${item.value > 0 ? "+" : ""}${item.value}`,
              item.value > 0 ? `#${this.successColor.getHexString()}` : `#${this.dangerColor.getHexString()}`,
              item.x,
              1.6,
              item.z,
              1.3,
            );
          }
          break;
        case "heal":
          this.vfx.spawn(10, item.x, item.z, 1, this.successColor, 2.4, 0.5, 0.5);
          if (item.value > 0) {
            this.floaters.push(`+${item.value}`, `#${this.successColor.getHexString()}`, item.x, 1.5, item.z);
          }
          break;
        case "shield":
          this.vfx.spawn(6, item.x, item.z, 1, this.accentColor, 2, 0.4, 0.4);
          this.floaters.push(`-${item.value} zırh`, `#${this.accentColor.getHexString()}`, item.x, 1.4, item.z, 0.8);
          break;
        case "jam":
          this.vfx.spawn(12, item.x, item.z, 1.2, this.mutedColor, 2.6, 0.6, 0.55);
          this.floaters.push("PARAZİT", `#${this.mutedColor.getHexString()}`, item.x, 1.8, item.z, 0.9);
          break;
        case "ability":
          this.vfx.spawn(18, item.x, 0.4, 1.2, this.accentColor, 4, 0.5, 0.7);
          this.rig.addShake("blast", 0.25);
          break;
        case "star":
          this.vfx.spawn(30, 0, -2, 1.4, this.successColor, 5, 1, 0.8);
          break;
        case "hurt":
        case "leak":
          this.vfx.spawn(10, item.x, item.z, 0.8, this.dangerColor, 3, 0.5, 0.5);
          this.rig.addShake("hurt", 0.45);
          this.floaters.push(
            `-${item.value || 1}`,
            `#${this.dangerColor.getHexString()}`,
            item.x,
            1.4,
            item.z,
            1.1,
          );
          break;
        default:
          break;
      }
    }
    state.effects.length = 0;
  }

  public dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.squadView.dispose();
    this.enemyView.dispose();
    this.gateView.dispose();
    this.vfx.dispose();
    this.floaters.dispose();
    this.environment.dispose();
    this.pool.dispose();
    this.renderer.dispose();
  }
}

export async function createGunlineScene(canvas: HTMLCanvasElement): Promise<GunlineScene> {
  const assets = await loadGunlineAssets();
  return new GunlineScene(canvas, assets);
}
