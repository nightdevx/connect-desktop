import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import type { MinigameUnoCard } from "@shared/minigames";
import { unoCardTexture } from "./card-texture";
import {
  CARD_HEIGHT,
  CARD_THICKNESS,
  CARD_WIDTH,
  DISCARD_DEPTH,
  DISCARD_PILE,
  DRAW_PILE,
  DRAW_STACK_MAX,
  FACE_DOWN,
  FRAME_CENTER,
  FRAME_HALF_DEPTH,
  FRAME_HALF_HEIGHT,
  FRAME_HALF_WIDTH,
  FRAME_PADDING,
  HAND_HOVER_SCALE,
  HAND_HOVER_TILT,
  HAND_LIFT,
  HAND_PULL,
  RING_RADIUS,
  TABLE_RADIUS,
  arrowYaw,
  cardLie,
  discardPlacement,
  drawPlacement,
  handPlacement,
  opponentPlacement,
  ringShowsDirection,
  ringSpin,
  seatAngle,
  seatPosition,
  seatYaw,
  VIEW_ELEVATION,
  type Placement,
} from "./layout";

export interface UnoSceneSeat {
  seat: number;
  offset: number;
  count: number;
}

export interface UnoSceneState {
  hand: MinigameUnoCard[];
  seats: UnoSceneSeat[];
  totalSeats: number;
  mySeat: number;
  playedBy: number;
  top: MinigameUnoCard;
  activeColor: string;
  pile: number;
  direction: number;
  playable: boolean;
}

export interface UnoSceneLabel {
  seat: number;
  x: number;
  y: number;
}

export interface UnoSceneHooks {
  onPlay: (index: number) => void;
  onDraw: () => void;
  onLabels: (labels: UnoSceneLabel[]) => void;
}

const COLOR_HEX: Record<string, number> = {
  r: 0xee1c25,
  y: 0xffc900,
  g: 0x00a94f,
  b: 0x0077d4,
};

const FRAME_ORIGIN = new Vector3(FRAME_CENTER.x, FRAME_CENTER.y, FRAME_CENTER.z);
const VIEW_DIRECTION = new Vector3(0, Math.sin(VIEW_ELEVATION), Math.cos(VIEW_ELEVATION));

const CARD_EDGE = 0;
const CARD_FRONT = 1;
const CARD_BACK = 2;

function roundedCardShape(width: number, height: number, radius: number): Shape {
  const shape = new Shape();
  const w = width / 2;
  const h = height / 2;

  shape.moveTo(-w + radius, -h);
  shape.lineTo(w - radius, -h);
  shape.quadraticCurveTo(w, -h, w, -h + radius);
  shape.lineTo(w, h - radius);
  shape.quadraticCurveTo(w, h, w - radius, h);
  shape.lineTo(-w + radius, h);
  shape.quadraticCurveTo(-w, h, -w, h - radius);
  shape.lineTo(-w, -h + radius);
  shape.quadraticCurveTo(-w, -h, -w + radius, -h);

  return shape;
}

export function createCardGeometry(): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(
    roundedCardShape(CARD_WIDTH, CARD_HEIGHT, CARD_WIDTH * 0.085),
    { depth: CARD_THICKNESS, bevelEnabled: false, curveSegments: 8 },
  );
  geometry.translate(0, 0, -CARD_THICKNESS / 2);

  const caps = geometry.groups.find((group) => group.materialIndex === 0);
  const sides = geometry.groups.find((group) => group.materialIndex === 1);
  if (!caps || !sides) {
    return geometry;
  }

  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const capEnd = caps.start + caps.count;

  for (let index = caps.start; index < capEnd; index += 1) {
    uv.setXY(
      index,
      (position.getX(index) + CARD_WIDTH / 2) / CARD_WIDTH,
      (position.getY(index) + CARD_HEIGHT / 2) / CARD_HEIGHT,
    );
  }
  uv.needsUpdate = true;

  const firstZ = position.getZ(caps.start);
  let split = capEnd;
  for (let index = caps.start; index < capEnd; index += 3) {
    if (Math.abs(position.getZ(index) - firstZ) > 1e-6) {
      split = index;
      break;
    }
  }

  geometry.clearGroups();
  geometry.addGroup(caps.start, split - caps.start, firstZ > 0 ? CARD_FRONT : CARD_BACK);
  geometry.addGroup(split, capEnd - split, firstZ > 0 ? CARD_BACK : CARD_FRONT);
  geometry.addGroup(sides.start, sides.count, CARD_EDGE);

  return geometry;
}

interface TableCard {
  mesh: Mesh;
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
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

export class UnoTableScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(44, 1, 0.1, 60);
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2(-2, -2);

  private readonly cardGeometry = createCardGeometry();
  private readonly edgeMaterial: MeshStandardMaterial;
  private readonly faceMaterials = new Map<string, MeshPhysicalMaterial>();
  private backMaterial: MeshPhysicalMaterial | null = null;

  private readonly handGroup = new Group();
  private readonly drawGroup = new Group();
  private readonly discardGroup = new Group();
  private readonly seatGroups = new Map<number, Group>();
  private readonly seatCards = new Map<number, TableCard[]>();

  private readonly handCards: TableCard[] = [];
  private readonly drawCards: TableCard[] = [];
  private readonly discardCards: TableCard[] = [];
  private readonly discardFaces: Array<MinigameUnoCard | null> = [];

  private readonly directionRing = new Group();
  private readonly directionArrows: Mesh[] = [];
  private ringTurns = true;
  private readonly ringMaterial: MeshStandardMaterial;
  private readonly haloMaterials: MeshBasicMaterial[] = [];
  private readonly colorLight = new PointLight(0xffffff, 0, 7.5, 2);

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly scratch = new Vector3();

  private state: UnoSceneState | null = null;
  private hovered = -1;
  private frame = 0;
  private shadowsStale = true;
  private lastTime = 0;
  private idleTick = 0;
  private running = false;
  private readonly reducedMotion: boolean;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: UnoSceneHooks,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    // A shadow map is a second full pass over every caster, from the light's
    // point of view, and three.js redoes it on every render by default. Nothing
    // that casts one moves while the cards are settled -- the direction ring
    // does not cast -- so the map is frozen until something actually does. See
    // start(), which is the one funnel for "something changed".
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.edgeMaterial = new MeshStandardMaterial({
      color: cssColor("--ct-uno-shell", 0xf4f2ee),
      roughness: 0.72,
      metalness: 0,
    });
    this.disposables.push(this.edgeMaterial);

    this.ringMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      roughness: 0.5,
      transparent: true,
      opacity: 0.85,
    });
    this.disposables.push(this.ringMaterial);

    this.buildLights();
    this.buildTable();
    this.buildDirectionRing();
    this.buildColorHalo();

    this.scene.add(this.handGroup, this.drawGroup, this.discardGroup);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();

    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.start();
  }

  public setState(next: UnoSceneState): void {
    const previous = this.state?.top;
    this.state = next;

    if (!previous || previous.color !== next.top.color || previous.kind !== next.top.kind) {
      this.pushDiscard(next.top, previous ? next.playedBy : -1);
    }

    this.syncHand();
    this.syncDraw();
    this.syncSeats();
    this.applyActiveColor(next.activeColor);
    this.applyDirection(next.direction, next.totalSeats);
    this.emitLabels();
    this.start();
  }

  public dispose(): void {
    this.running = false;
    if (this.frame) {
      cancelAnimationFrame(this.frame);
    }

    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    for (const item of this.disposables) {
      item.dispose();
    }
    for (const material of this.faceMaterials.values()) {
      material.dispose();
    }
    this.backMaterial?.dispose();
    this.cardGeometry.dispose();
    this.renderer.dispose();
  }

  private buildLights(): void {
    const bounce = cssColor("--ct-felt-lift", 0x1e6045);
    this.scene.add(new HemisphereLight(0xdfe7ff, bounce.getHex(), 1.1));

    const key = new DirectionalLight(0xfff3e0, 2.6);
    key.position.set(2.6, 7.4, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.06;
    this.scene.add(key);

    const rim = new DirectionalLight(0x9fc6ff, 0.9);
    rim.position.set(-4.2, 3.6, -3.8);
    this.scene.add(rim);

    this.colorLight.position.set(0.62, 1.5, 0.15);
    this.scene.add(this.colorLight);
  }

  private buildTable(): void {
    const feltGeometry = new CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS * 0.99, 0.3, 96);
    const feltMaterial = new MeshStandardMaterial({
      color: cssColor("--ct-felt-base", 0x164a34),
      roughness: 0.98,
      metalness: 0,
    });
    const felt = new Mesh(feltGeometry, feltMaterial);
    felt.position.y = -0.15;
    felt.receiveShadow = true;
    this.scene.add(felt);
    this.disposables.push(feltGeometry, feltMaterial);

    const glowGeometry = new CircleGeometry(TABLE_RADIUS * 0.62, 72);
    const glowMaterial = new MeshStandardMaterial({
      color: cssColor("--ct-felt-lift", 0x1e6045),
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
    });
    const glow = new Mesh(glowGeometry, glowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.001;
    glow.receiveShadow = true;
    this.scene.add(glow);
    this.disposables.push(glowGeometry, glowMaterial);

    const railGeometry = new TorusGeometry(TABLE_RADIUS + 0.02, 0.19, 18, 96);
    const railMaterial = new MeshStandardMaterial({
      color: cssColor("--ct-felt-rail", 0x4a2f1c),
      roughness: 0.45,
      metalness: 0.12,
    });
    const rail = new Mesh(railGeometry, railMaterial);
    rail.rotation.x = -Math.PI / 2;
    rail.position.y = 0.02;
    rail.castShadow = true;
    rail.receiveShadow = true;
    this.scene.add(rail);
    this.disposables.push(railGeometry, railMaterial);
  }

  private buildDirectionRing(): void {
    const ringGeometry = new TorusGeometry(RING_RADIUS, 0.038, 10, 96);
    const ring = new Mesh(ringGeometry, this.ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    this.directionRing.add(ring);
    this.disposables.push(ringGeometry);

    const arrowGeometry = new ConeGeometry(0.1, 0.28, 14);
    this.disposables.push(arrowGeometry);
    for (let index = 0; index < 3; index += 1) {
      const angle = (index * 2 * Math.PI) / 3;
      const arrow = new Mesh(arrowGeometry, this.ringMaterial);
      arrow.position.set(
        Math.cos(angle) * RING_RADIUS,
        0.02,
        Math.sin(angle) * RING_RADIUS,
      );
      arrow.rotation.order = "YXZ";
      arrow.userData.ringAngle = angle;
      this.directionRing.add(arrow);
      this.directionArrows.push(arrow);
    }
    this.applyDirection(1, 4);

    this.directionRing.position.y = 0.012;
    this.scene.add(this.directionRing);
  }

  private buildColorHalo(): void {
    const bands = [
      { inner: 0.94, outer: 1.14, opacity: 0.95 },
      { inner: 1.14, outer: 1.62, opacity: 0.22 },
    ];

    for (const band of bands) {
      const geometry = new RingGeometry(band.inner, band.outer, 72);
      const material = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: band.opacity,
        toneMapped: false,
        depthWrite: false,
      });
      const ring = new Mesh(geometry, material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(DISCARD_PILE.x, 0.006, DISCARD_PILE.z);
      ring.renderOrder = -1;
      this.scene.add(ring);
      this.disposables.push(geometry, material);
      this.haloMaterials.push(material);
    }
  }

  private backTexture(): Texture {
    return unoCardTexture({ color: "w", kind: "wild" }, true, this.requestRender);
  }

  private materialsFor(card: MinigameUnoCard | null): Material[] {
    if (!this.backMaterial) {
      this.backMaterial = new MeshPhysicalMaterial({
        map: this.backTexture(),
        roughness: 0.55,
        metalness: 0,
        clearcoat: 0.45,
        clearcoatRoughness: 0.42,
      });
    }

    const edge = this.edgeMaterial;
    const back = this.backMaterial;

    if (!card) {
      return [edge, back, back];
    }

    const key = `${card.color}:${card.kind}`;
    let front = this.faceMaterials.get(key);
    if (!front) {
      front = new MeshPhysicalMaterial({
        map: unoCardTexture(card, false, this.requestRender),
        roughness: 0.52,
        metalness: 0,
        clearcoat: 0.45,
        clearcoatRoughness: 0.42,
      });
      this.faceMaterials.set(key, front);
    }

    return [edge, front, back];
  }

  private fit(pool: TableCard[], parent: Group, cards: Array<MinigameUnoCard | null>): void {
    while (pool.length > cards.length) {
      const spare = pool.pop();
      if (spare) {
        parent.remove(spare.mesh);
      }
    }
    while (pool.length < cards.length) {
      const mesh = new Mesh(this.cardGeometry, this.materialsFor(null));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      pool.push({
        mesh,
        position: new Vector3(),
        quaternion: new Quaternion(),
        scale: 1,
      });
    }
    cards.forEach((card, index) => {
      pool[index].mesh.material = this.materialsFor(card);
    });
  }

  private aim(entry: TableCard, placement: Placement, snap: boolean): void {
    entry.position.set(placement.x, placement.y, placement.z);
    entry.quaternion.setFromEuler(
      new Euler(placement.tilt, placement.yaw, placement.roll, "YXZ"),
    );
    entry.scale = placement.scale;

    if (snap || this.reducedMotion) {
      entry.mesh.position.copy(entry.position);
      entry.mesh.quaternion.copy(entry.quaternion);
      entry.mesh.scale.setScalar(entry.scale);
    }
  }

  private lift(placement: Placement): Placement {
    return {
      ...placement,
      y: placement.y + HAND_LIFT,
      z: placement.z - HAND_PULL,
      tilt: HAND_HOVER_TILT,
      scale: HAND_HOVER_SCALE,
    };
  }

  private syncHand(): void {
    const hand = this.state?.hand ?? [];
    const dealt = this.handCards.length;

    if (this.hovered >= hand.length) {
      this.hovered = -1;
    }

    this.fit(this.handCards, this.handGroup, hand);

    hand.forEach((_, index) => {
      const entry = this.handCards[index];
      if (index >= dealt) {
        entry.mesh.position.set(DRAW_PILE.x, 0.55, DRAW_PILE.z);
        entry.mesh.quaternion.setFromEuler(new Euler(FACE_DOWN, 0, 0.85, "YXZ"));
        entry.mesh.scale.setScalar(1);
      }
      const placement = handPlacement(index, hand.length);
      this.aim(entry, this.hovered === index ? this.lift(placement) : placement, false);
    });
  }

  private syncDraw(): void {
    const height = Math.min(this.state?.pile ?? 0, DRAW_STACK_MAX);
    this.fit(this.drawCards, this.drawGroup, new Array(height).fill(null));
    this.drawCards.forEach((entry, index) => {
      this.aim(entry, drawPlacement(index), true);
    });
  }

  private throwOrigin(playedBy: number): Vector3 | null {
    const state = this.state;
    if (!state || playedBy < 0) {
      return null;
    }

    if (playedBy === state.mySeat) {
      return this.scratch.set(0, 1.05, 2.5).clone();
    }

    const group = this.seatGroups.get(playedBy);
    if (!group) {
      return null;
    }

    return this.scratch.set(group.position.x * 0.7, 0.95, group.position.z * 0.7).clone();
  }

  private pushDiscard(card: MinigameUnoCard, playedBy: number): void {
    this.discardFaces.unshift(card);
    this.discardFaces.length = Math.min(this.discardFaces.length, DISCARD_DEPTH);

    this.fit(this.discardCards, this.discardGroup, this.discardFaces);

    const origin = this.throwOrigin(playedBy);

    this.discardFaces.forEach((face, index) => {
      const entry = this.discardCards[index];
      const placement = discardPlacement(index, face ? cardLie(face.color, face.kind) : 0);
      if (index === 0) {
        if (origin) {
          entry.mesh.position.copy(origin);
        } else {
          entry.mesh.position.set(placement.x, placement.y + 2.6, placement.z - 1.2);
        }
        entry.mesh.quaternion.setFromEuler(
          new Euler(placement.tilt + 1.2, 0, placement.roll + 1.9, "YXZ"),
        );
        entry.mesh.scale.setScalar(1.14);
      }
      this.aim(entry, placement, index > 0);
    });
  }

  private syncSeats(): void {
    const state = this.state;
    if (!state) {
      return;
    }

    const live = new Set(state.seats.map((seat) => seat.seat));
    for (const [seat, group] of this.seatGroups) {
      if (!live.has(seat)) {
        this.scene.remove(group);
        this.seatGroups.delete(seat);
        this.seatCards.delete(seat);
      }
    }

    for (const seat of state.seats) {
      let group = this.seatGroups.get(seat.seat);
      if (!group) {
        group = new Group();
        this.seatGroups.set(seat.seat, group);
        this.seatCards.set(seat.seat, []);
        this.scene.add(group);
      }

      const angle = seatAngle(seat.offset, state.totalSeats);
      const spot = seatPosition(angle);
      group.position.set(spot.x, 0, spot.z);
      group.rotation.y = seatYaw(angle);

      const pool = this.seatCards.get(seat.seat) ?? [];
      const shown = Math.max(Math.min(seat.count, 12), 0);
      const held = pool.length;
      this.fit(pool, group, new Array(shown).fill(null));

      group.updateMatrixWorld(true);
      const deck = group.worldToLocal(this.scratch.set(DRAW_PILE.x, 0.5, DRAW_PILE.z).clone());

      pool.forEach((entry, index) => {
        if (index >= held) {
          entry.mesh.position.copy(deck);
          entry.mesh.quaternion.setFromEuler(new Euler(FACE_DOWN, 0, 0.9, "YXZ"));
          entry.mesh.scale.setScalar(1);
        }
        this.aim(entry, opponentPlacement(index, shown, state.totalSeats), false);
      });
      this.seatCards.set(seat.seat, pool);
    }
  }

  private applyDirection(direction: number, totalSeats: number): void {
    this.ringTurns = ringShowsDirection(totalSeats);

    for (const arrow of this.directionArrows) {
      arrow.visible = this.ringTurns;
      const angle = (arrow.userData.ringAngle as number) ?? 0;
      arrow.rotation.set(Math.PI / 2, arrowYaw(angle, direction), 0);
    }
  }

  private applyActiveColor(color: string): void {
    const hex = COLOR_HEX[color] ?? 0xf2f2f2;
    this.ringMaterial.color.setHex(hex);
    this.ringMaterial.emissive.setHex(hex);
    this.colorLight.color.setHex(hex);
    this.colorLight.intensity = 7;
    for (const material of this.haloMaterials) {
      material.color.setHex(hex);
    }
  }

  private emitLabels(): void {
    const labels: UnoSceneLabel[] = [];

    for (const [seat, group] of this.seatGroups) {
      this.scratch.set(group.position.x, 1.15, group.position.z).project(this.camera);
      labels.push({
        seat,
        x: (this.scratch.x * 0.5 + 0.5) * 100,
        y: (-this.scratch.y * 0.5 + 0.5) * 100,
      });
    }

    this.hooks.onLabels(labels);
  }

  private resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;

    const vertical = (this.camera.fov * Math.PI) / 180;
    const halfVertical = Math.tan(vertical / 2);
    const halfHorizontal = halfVertical * this.camera.aspect;
    const skyline =
      FRAME_HALF_DEPTH * Math.sin(VIEW_ELEVATION) +
      FRAME_HALF_HEIGHT * Math.cos(VIEW_ELEVATION);
    const distance =
      Math.max(skyline / halfVertical, FRAME_HALF_WIDTH / halfHorizontal) * FRAME_PADDING;

    this.camera.position.copy(VIEW_DIRECTION).multiplyScalar(distance).add(FRAME_ORIGIN);
    this.camera.lookAt(FRAME_ORIGIN);
    this.camera.updateProjectionMatrix();

    this.emitLabels();
    this.start();
  }

  private readonly requestRender = (): void => {
    this.start();
  };

  private readonly onVisibilityChange = (): void => {
    this.start();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.updateHover();
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.set(-2, -2);
    this.updateHover();
  };

  private readonly onPointerDown = (): void => {
    if (!this.state?.playable) {
      return;
    }
    const hit = this.pick();
    if (hit.index >= 0) {
      this.hooks.onPlay(hit.index);
      return;
    }
    if (hit.draw) {
      this.hooks.onDraw();
    }
  };

  private pick(): { index: number; draw: boolean } {
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const handMeshes = this.handCards.map((entry) => entry.mesh);
    const handHits = this.raycaster.intersectObjects(handMeshes, false);
    if (handHits.length > 0) {
      return { index: handMeshes.indexOf(handHits[0].object as Mesh), draw: false };
    }

    const drawMeshes = this.drawCards.map((entry) => entry.mesh);
    return { index: -1, draw: this.raycaster.intersectObjects(drawMeshes, false).length > 0 };
  }

  private updateHover(): void {
    const playable = this.state?.playable ?? false;
    const hit = playable ? this.pick() : { index: -1, draw: false };

    this.canvas.style.cursor = hit.index >= 0 || hit.draw ? "pointer" : "default";

    if (hit.index === this.hovered) {
      return;
    }
    this.hovered = hit.index;
    this.syncHand();
    this.start();
  }

  private start(): void {
    // Before the guard, not after: the loop may already be running, and the
    // change still has to reach the shadow map.
    this.shadowsStale = true;

    if (this.running || document.visibilityState === "hidden") {
      return;
    }
    this.running = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    if (document.visibilityState === "hidden") {
      this.running = false;
      return;
    }

    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const settled = this.advance(delta);
    const spinning = !this.reducedMotion && this.ringTurns;

    if (spinning) {
      this.directionRing.rotation.y += ringSpin(this.state?.direction ?? 1, delta);
    }

    // Nothing is moving and nothing is going to: the cards have arrived and
    // there is no ring to turn. A two-seat table hides the ring entirely, so
    // that board used to hold the GPU at 30fps forever for a picture that never
    // changed -- next to a video call and a microphone, on the same machine.
    const finished = settled && !spinning;

    this.idleTick += 1;
    // Idle is what this board is almost all of the time: the cards have landed
    // and only the ring is turning. Half rate on a slow rotation is invisible;
    // the frames it does not draw are the point.
    if (!settled || finished || this.idleTick % 3 === 0) {
      this.renderer.shadowMap.needsUpdate = !settled || this.shadowsStale;
      this.shadowsStale = !settled;
      this.renderer.render(this.scene, this.camera);
    }

    if (finished) {
      this.running = false;
      return;
    }

    this.frame = requestAnimationFrame(this.tick);
  };

  private advance(delta: number): boolean {
    const factor = this.reducedMotion ? 1 : 1 - Math.pow(0.02, delta);
    let settled = true;

    const step = (entry: TableCard): void => {
      if (entry.mesh.position.distanceToSquared(entry.position) > 0.000004) {
        settled = false;
      }
      entry.mesh.position.lerp(entry.position, factor);
      entry.mesh.quaternion.slerp(entry.quaternion, factor);
      this.scratch.setScalar(entry.scale);
      entry.mesh.scale.lerp(this.scratch, factor);
    };

    this.handCards.forEach(step);
    this.discardCards.forEach(step);
    this.drawCards.forEach(step);
    for (const pool of this.seatCards.values()) {
      pool.forEach(step);
    }

    return settled;
  }
}
