import {
  AdditiveBlending,
  BoxGeometry,
  Camera,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
} from "three";
import { MAX_BULLETS, formation, squadSize, type GunlineState } from "../gunline";

const MAX_PARTICLES = 400;
const MAX_SHADOWS = 128;
const MAX_HOSTILE = 200;
const MAX_RINGS = 24;

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

export class Vfx {
  private readonly bullets: InstancedMesh;
  private readonly hostileBullets: InstancedMesh;
  private readonly shadows: InstancedMesh;
  private readonly sparks: InstancedMesh;
  private readonly rings: InstancedMesh;
  private readonly blobMap: CanvasTexture;
  private readonly sparkMap: CanvasTexture;
  private readonly particles: Particle[] = [];
  private readonly dummy = new Object3D();
  private budget = 1;

  public constructor(
    private readonly scene: Scene,
    fire: Color,
    danger: Color,
  ) {
    this.bullets = new InstancedMesh(
      new BoxGeometry(0.07, 0.07, 0.42),
      new MeshBasicMaterial({ color: fire.getHex() }),
      MAX_BULLETS,
    );
    this.bullets.frustumCulled = false;
    scene.add(this.bullets);

    this.hostileBullets = new InstancedMesh(
      new SphereGeometry(0.14, 8, 6),
      new MeshBasicMaterial({ color: danger.getHex() }),
      MAX_HOSTILE,
    );
    this.hostileBullets.frustumCulled = false;
    scene.add(this.hostileBullets);

    this.blobMap = blobTexture();
    this.shadows = new InstancedMesh(
      new CircleGeometry(0.45, 14),
      new MeshBasicMaterial({
        map: this.blobMap,
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
      }),
      MAX_SHADOWS,
    );
    this.shadows.frustumCulled = false;
    scene.add(this.shadows);

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
    scene.add(this.sparks);

    this.rings = new InstancedMesh(
      new RingGeometry(0.8, 1, 20),
      new MeshBasicMaterial({
        color: danger.getHex(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: DoubleSide,
      }),
      MAX_RINGS,
    );
    this.rings.frustumCulled = false;
    scene.add(this.rings);
  }

  public setBudget(budget: number): void {
    this.budget = Math.max(0.25, Math.min(1, budget));
  }

  public spawn(
    count: number,
    x: number,
    z: number,
    y: number,
    color: Color,
    speed: number,
    life: number,
    size: number,
  ): void {
    const wanted = Math.max(1, Math.round(count * this.budget));
    for (let index = 0; index < wanted; index += 1) {
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

  public syncBullets(state: GunlineState): void {
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

  public syncShadows(state: GunlineState): void {
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

    if (this.budget > 0.5) {
      for (const slot of formation(state.roster)) {
        place(state.playerX + slot.x, slot.z, 1);
      }
    } else {
      place(state.playerX, 0.4, Math.min(3, 1 + squadSize(state.roster) * 0.05));
    }

    for (const enemy of state.enemies) {
      place(enemy.x, enemy.z, enemy.scale);
    }

    this.shadows.count = index;
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  public syncRings(state: GunlineState): void {
    let index = 0;
    for (const strike of state.strikes) {
      if (index >= MAX_RINGS) {
        break;
      }
      const left = Math.max(0, strike.landsAt - state.time);
      const pulse = 1 - Math.min(1, left / 3);
      this.dummy.position.set(strike.x, 0.05, strike.z);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.setScalar(strike.radius * (0.6 + pulse * 0.5));
      this.dummy.updateMatrix();
      this.rings.setMatrixAt(index, this.dummy.matrix);
      index += 1;
    }
    this.rings.count = index;
    this.rings.instanceMatrix.needsUpdate = true;
  }

  public step(dt: number, camera: Camera): void {
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

    let index = 0;
    for (const particle of this.particles) {
      if (index >= MAX_PARTICLES) {
        break;
      }
      const fade = particle.life / particle.maxLife;
      this.dummy.position.set(particle.x, Math.max(0.05, particle.y), particle.z);
      this.dummy.quaternion.copy(camera.quaternion);
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

  public dispose(): void {
    const meshes: Mesh[] = [
      this.bullets,
      this.hostileBullets,
      this.shadows,
      this.sparks,
      this.rings,
    ];
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material.dispose();
      }
      this.scene.remove(mesh);
    }
    this.blobMap.dispose();
    this.sparkMap.dispose();
  }
}
