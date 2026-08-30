import {
  CanvasTexture,
  Camera,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
} from "three";

const POOL_SIZE = 18;
const RISE = 1.6;
const LIFE = 0.9;

interface Floater {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  life: number;
  baseY: number;
}

export class Floaters {
  private readonly pool: Floater[] = [];
  private cursor = 0;
  private enabled = true;

  public constructor(private readonly scene: Scene) {
    const geometry = new PlaneGeometry(1.1, 0.55);
    for (let index = 0; index < POOL_SIZE; index += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 96;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;

      const mesh = new Mesh(
        geometry.clone(),
        new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
      );
      mesh.visible = false;
      mesh.renderOrder = 3;
      scene.add(mesh);

      this.pool.push({ mesh, canvas, texture, life: 0, baseY: 0 });
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      for (const item of this.pool) {
        item.mesh.visible = false;
        item.life = 0;
      }
    }
  }

  public push(text: string, color: string, x: number, y: number, z: number, size = 1): void {
    if (!this.enabled) {
      return;
    }

    const item = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % POOL_SIZE;

    const context = item.canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, item.canvas.width, item.canvas.height);
      context.font = "bold 68px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 10;
      context.strokeStyle = "rgba(0,0,0,0.75)";
      context.strokeText(text, item.canvas.width / 2, item.canvas.height / 2);
      context.fillStyle = color;
      context.fillText(text, item.canvas.width / 2, item.canvas.height / 2);
    }

    item.texture.needsUpdate = true;
    item.life = LIFE;
    item.baseY = y;
    item.mesh.visible = true;
    item.mesh.position.set(x, y, z);
    item.mesh.scale.setScalar(size);
  }

  public step(dt: number, camera: Camera): void {
    for (const item of this.pool) {
      if (item.life <= 0) {
        continue;
      }
      item.life -= dt;
      if (item.life <= 0) {
        item.mesh.visible = false;
        continue;
      }
      const ratio = 1 - item.life / LIFE;
      item.mesh.position.y = item.baseY + ratio * RISE;
      item.mesh.material.opacity = 1 - ratio * ratio;
      item.mesh.quaternion.copy(camera.quaternion);
    }
  }

  public dispose(): void {
    for (const item of this.pool) {
      item.mesh.geometry.dispose();
      item.mesh.material.dispose();
      item.texture.dispose();
      this.scene.remove(item.mesh);
    }
  }
}
