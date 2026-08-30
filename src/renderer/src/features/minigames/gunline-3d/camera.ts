import { PerspectiveCamera, Vector3 } from "three";
import type { RunPhase } from "../gunline";

const HOME = new Vector3(0, 9.4, 15);
const CORRIDOR = new Vector3(0, 10.4, 16.5);
const BOSS = new Vector3(0, 8.4, 13);

const LOOK_HOME = new Vector3(0, 1.2, -12);
const LOOK_CORRIDOR = new Vector3(0, 1.4, -15);

export class CameraRig {
  public readonly camera = new PerspectiveCamera(46, 1, 0.1, 260);

  private readonly target = new Vector3().copy(HOME);
  private readonly look = new Vector3().copy(LOOK_HOME);
  private readonly current = new Vector3().copy(HOME);
  private readonly currentLook = new Vector3().copy(LOOK_HOME);

  private shakeFire = 0;
  private shakeBlast = 0;
  private shakeHurt = 0;
  private reduced = false;

  public constructor() {
    this.camera.position.copy(HOME);
    this.camera.lookAt(LOOK_HOME);
  }

  public setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  public setPhase(phase: RunPhase, bossPresent: boolean): void {
    if (phase === "corridor") {
      this.target.copy(CORRIDOR);
      this.look.copy(LOOK_CORRIDOR);
      return;
    }
    if (bossPresent) {
      this.target.copy(BOSS);
      this.look.copy(LOOK_HOME);
      return;
    }
    this.target.copy(HOME);
    this.look.copy(LOOK_HOME);
  }

  public addShake(kind: "fire" | "blast" | "hurt", amount: number): void {
    if (this.reduced) {
      return;
    }
    if (kind === "fire") {
      this.shakeFire = Math.min(0.4, this.shakeFire + amount);
    } else if (kind === "blast") {
      this.shakeBlast = Math.min(1, this.shakeBlast + amount);
    } else {
      this.shakeHurt = Math.min(1, this.shakeHurt + amount);
    }
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public update(dt: number): void {
    const ease = Math.min(1, dt * 3.2);
    this.current.lerp(this.target, ease);
    this.currentLook.lerp(this.look, ease);

    this.shakeFire = Math.max(0, this.shakeFire - dt * 3.4);
    this.shakeBlast = Math.max(0, this.shakeBlast - dt * 2.6);
    this.shakeHurt = Math.max(0, this.shakeHurt - dt * 2.2);

    const jitter = (this.shakeFire * 0.08 + this.shakeBlast * 0.22 + this.shakeHurt * 0.3);
    this.camera.position.set(
      this.current.x + (Math.random() - 0.5) * jitter,
      this.current.y + (Math.random() - 0.5) * jitter,
      this.current.z + (Math.random() - 0.5) * jitter * 0.4,
    );
    this.camera.lookAt(this.currentLook);
  }
}
