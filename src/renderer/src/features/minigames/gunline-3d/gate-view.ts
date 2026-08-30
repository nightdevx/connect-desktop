import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
} from "three";
import { gateIcon, gateLabel, type GunlineGate, type GunlineState } from "../gunline";

const GOOD = new Color("#2f7ff5");
const BAD = new Color("#e8443a");
const LOCKED = new Color("#7c8391");
const FRAME = new Color("#12305e");

const SLAB_WIDTH = 2.1;
const SLAB_HEIGHT = 1.2;

interface GateEntry {
  group: Group;
  frame: Mesh<BoxGeometry, MeshStandardMaterial>;
  slab: Mesh<BoxGeometry, MeshStandardMaterial>;
  label: Mesh<PlaneGeometry, MeshBasicMaterial>;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  text: string;
  locked: boolean;
}

export class GateView {
  private readonly entries: GateEntry[] = [];

  public constructor(private readonly scene: Scene) {}

  private create(): GateEntry {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;

    const frame = new Mesh(
      new BoxGeometry(SLAB_WIDTH + 0.16, SLAB_HEIGHT + 0.16, 0.12),
      new MeshStandardMaterial({ color: FRAME.getHex(), roughness: 0.6 }),
    );
    frame.position.set(0, SLAB_HEIGHT / 2 + 0.12, -0.04);

    const slab = new Mesh(
      new BoxGeometry(SLAB_WIDTH, SLAB_HEIGHT, 0.16),
      new MeshStandardMaterial({
        color: GOOD.getHex(),
        emissive: GOOD.getHex(),
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.92,
        roughness: 0.35,
      }),
    );
    slab.position.set(0, SLAB_HEIGHT / 2 + 0.12, 0);

    const label = new Mesh(
      new PlaneGeometry(SLAB_WIDTH * 0.92, SLAB_HEIGHT * 0.86),
      new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    label.position.set(0, SLAB_HEIGHT / 2 + 0.12, 0.11);

    const group = new Group();
    group.add(frame, slab, label);
    this.scene.add(group);

    const entry: GateEntry = {
      group,
      frame,
      slab,
      label,
      canvas,
      texture,
      text: "",
      locked: false,
    };
    this.entries.push(entry);
    return entry;
  }

  private paint(entry: GateEntry, gate: GunlineGate): void {
    const tone = gate.locked ? LOCKED : gate.good ? GOOD : BAD;
    entry.slab.material.color.copy(tone);
    entry.slab.material.emissive.copy(tone);

    const text = `${gateIcon(gate)} ${gateLabel(gate)}`;
    if (entry.text === text && entry.locked === gate.locked) {
      return;
    }
    entry.text = text;
    entry.locked = gate.locked;

    const context = entry.canvas.getContext("2d");
    if (context) {
      const width = entry.canvas.width;
      const height = entry.canvas.height;
      const label = gateLabel(gate);
      const compact = label.length <= 5;

      context.clearRect(0, 0, width, height);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineJoin = "round";
      context.strokeStyle = "rgba(10,24,48,0.85)";
      context.fillStyle = "#ffffff";

      if (compact) {
        context.font = "900 150px system-ui, sans-serif";
        context.lineWidth = 22;
        context.strokeText(label, width / 2, height / 2 + 6);
        context.fillText(label, width / 2, height / 2 + 6);
      } else {
        context.font = "900 96px system-ui, sans-serif";
        context.lineWidth = 16;
        context.strokeText(gateIcon(gate), width / 2, height * 0.3);
        context.fillText(gateIcon(gate), width / 2, height * 0.3);
        context.font = "800 74px system-ui, sans-serif";
        context.lineWidth = 14;
        context.strokeText(label, width / 2, height * 0.7);
        context.fillText(label, width / 2, height * 0.7);
      }
    }
    entry.texture.needsUpdate = true;
  }

  public sync(state: GunlineState): void {
    while (this.entries.length < state.gates.length) {
      this.create();
    }

    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      const gate = state.gates[index];
      if (!gate) {
        entry.group.visible = false;
        continue;
      }
      entry.group.visible = true;
      entry.group.position.set(gate.x, 0, gate.z);
      this.paint(entry, gate);
    }
  }

  public dispose(): void {
    for (const entry of this.entries) {
      entry.frame.geometry.dispose();
      entry.frame.material.dispose();
      entry.slab.geometry.dispose();
      entry.slab.material.dispose();
      entry.label.geometry.dispose();
      entry.label.material.dispose();
      entry.texture.dispose();
      this.scene.remove(entry.group);
    }
    this.entries.length = 0;
  }
}
