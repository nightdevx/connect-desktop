import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
} from "three";
import type { TerrainId } from "../gunline";

export const DECK_WIDTH = 7.4;
export const DECK_LENGTH = 96;

const PARAPET_HEIGHT = 1.15;
const PARAPET_THICKNESS = 0.55;
const WATER_LEVEL = -1.35;

const PILLAR_COUNT = 10;
const CROWD_COLUMNS = 15;
const CROWD_ROWS = 16;
const CROWD_MAX = CROWD_COLUMNS * CROWD_ROWS;
const CROWD_FRONT_Z = -20;
const CROWD_DEPTH = 0.78;
const CROWD_SPACING = 0.42;

export interface TerrainTheme {
  deck: string;
  seam: string;
  parapet: string;
  parapetCap: string;
  water: string;
  sky: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  key: string;
  keyIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  crowd: string;
}

export const TERRAIN_THEMES: Record<TerrainId, TerrainTheme> = {
  range: {
    deck: "#d9cfb6",
    seam: "#c2b59a",
    parapet: "#e4dcc6",
    parapetCap: "#b9ac91",
    water: "#1d6fc4",
    sky: "#7fb6ef",
    fog: "#1d6fc4",
    fogNear: 46,
    fogFar: 96,
    key: "#fff6e4",
    keyIntensity: 2.5,
    hemiSky: "#dbe9ff",
    hemiGround: "#9d9a8c",
    hemiIntensity: 1.5,
    crowd: "#d8352c",
  },
  desert: {
    deck: "#dcc188",
    seam: "#c2a468",
    parapet: "#e7d5a8",
    parapetCap: "#bda072",
    water: "#c9a05a",
    sky: "#f0d9a8",
    fog: "#d8b878",
    fogNear: 34,
    fogFar: 78,
    key: "#fff0cf",
    keyIntensity: 2.7,
    hemiSky: "#ffe9c0",
    hemiGround: "#a98a58",
    hemiIntensity: 1.6,
    crowd: "#c5382c",
  },
  urban: {
    deck: "#9aa0a8",
    seam: "#767c85",
    parapet: "#b0b6bd",
    parapetCap: "#7f858d",
    water: "#3c4653",
    sky: "#8f9aa8",
    fog: "#3a424c",
    fogNear: 40,
    fogFar: 88,
    key: "#f4f7ff",
    keyIntensity: 2.2,
    hemiSky: "#ccd6e2",
    hemiGround: "#5a6068",
    hemiIntensity: 1.3,
    crowd: "#d13a30",
  },
  forest: {
    deck: "#8f9b74",
    seam: "#6d7a56",
    parapet: "#a4ae87",
    parapetCap: "#6f7a5a",
    water: "#2f5d46",
    sky: "#9fc0a0",
    fog: "#294a38",
    fogNear: 28,
    fogFar: 66,
    key: "#eaffe0",
    keyIntensity: 2,
    hemiSky: "#cfe4c4",
    hemiGround: "#455239",
    hemiIntensity: 1.35,
    crowd: "#cf3b2f",
  },
  snow: {
    deck: "#e8eef6",
    seam: "#c8d3e0",
    parapet: "#f3f7fc",
    parapetCap: "#c2cddb",
    water: "#7fa5c9",
    sky: "#dbe9f7",
    fog: "#b9cde0",
    fogNear: 26,
    fogFar: 62,
    key: "#ffffff",
    keyIntensity: 2,
    hemiSky: "#eaf3ff",
    hemiGround: "#a8b8c8",
    hemiIntensity: 1.6,
    crowd: "#d0352b",
  },
  industrial: {
    deck: "#8b8681",
    seam: "#6a6560",
    parapet: "#9c968f",
    parapetCap: "#6f6a64",
    water: "#33302c",
    sky: "#a89e8c",
    fog: "#2b2926",
    fogNear: 32,
    fogFar: 74,
    key: "#ffd9a8",
    keyIntensity: 2.1,
    hemiSky: "#c4bcae",
    hemiGround: "#4a4641",
    hemiIntensity: 1.2,
    crowd: "#c93a2e",
  },
};

function deckTexture(base: Color, seam: Color): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = `#${base.getHexString()}`;
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = `#${seam.getHexString()}`;
    context.lineWidth = 4;
    for (let row = 0; row < 2; row += 1) {
      const y = row * 64;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(128, y);
      context.stroke();
      const offset = row % 2 === 0 ? 0 : 32;
      for (let column = 0; column < 2; column += 1) {
        const x = offset + column * 64;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + 64);
        context.stroke();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 44);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class Environment {
  private readonly water: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private readonly deck: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private deckMap: CanvasTexture;
  private readonly parapets: Mesh<BoxGeometry, MeshStandardMaterial>[] = [];
  private readonly caps: Mesh<BoxGeometry, MeshStandardMaterial>[] = [];
  private readonly pillars: InstancedMesh;
  private readonly crowd: InstancedMesh;
  private readonly hemi: HemisphereLight;
  private readonly key: DirectionalLight;
  private readonly rim: DirectionalLight;
  private readonly dummy = new Object3D();
  private readonly fog: Fog;

  private terrain: TerrainId = "range";
  private scroll = 0;
  private wobble = 0;

  public constructor(private readonly scene: Scene) {
    const theme = TERRAIN_THEMES.range;

    this.fog = new Fog(new Color(theme.sky).getHex(), theme.fogNear, theme.fogFar);
    scene.fog = this.fog;

    this.hemi = new HemisphereLight(
      new Color(theme.hemiSky).getHex(),
      new Color(theme.parapetCap).getHex(),
      theme.hemiIntensity,
    );
    scene.add(this.hemi);

    this.key = new DirectionalLight(new Color(theme.key).getHex(), theme.keyIntensity);
    this.key.position.set(5, 12, 7);
    scene.add(this.key);

    this.rim = new DirectionalLight(0x9fc4ff, 0.75);
    this.rim.position.set(-6, 6, -10);
    scene.add(this.rim);

    this.water = new Mesh(
      new PlaneGeometry(140, 200),
      new MeshStandardMaterial({ color: new Color(theme.water).getHex(), roughness: 0.35, metalness: 0.1 }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, WATER_LEVEL, -DECK_LENGTH / 2 + 8);
    scene.add(this.water);

    this.deckMap = deckTexture(new Color(theme.deck), new Color(theme.seam));
    this.deck = new Mesh(
      new PlaneGeometry(DECK_WIDTH, DECK_LENGTH),
      new MeshStandardMaterial({ map: this.deckMap, roughness: 0.95, metalness: 0 }),
    );
    this.deck.rotation.x = -Math.PI / 2;
    this.deck.position.set(0, 0, -DECK_LENGTH / 2 + 8);
    scene.add(this.deck);

    for (const side of [-1, 1]) {
      const parapet = new Mesh(
        new BoxGeometry(PARAPET_THICKNESS, PARAPET_HEIGHT, DECK_LENGTH),
        new MeshStandardMaterial({ color: new Color(theme.parapet).getHex(), roughness: 0.85 }),
      );
      parapet.position.set(
        side * (DECK_WIDTH / 2 + PARAPET_THICKNESS / 2 - 0.05),
        PARAPET_HEIGHT / 2 - 0.35,
        -DECK_LENGTH / 2 + 8,
      );
      this.parapets.push(parapet);
      scene.add(parapet);

      const cap = new Mesh(
        new BoxGeometry(PARAPET_THICKNESS + 0.18, 0.16, DECK_LENGTH),
        new MeshStandardMaterial({ color: new Color(theme.parapetCap).getHex(), roughness: 0.8 }),
      );
      cap.position.set(parapet.position.x, PARAPET_HEIGHT - 0.35, parapet.position.z);
      this.caps.push(cap);
      scene.add(cap);
    }

    this.pillars = new InstancedMesh(
      new BoxGeometry(1.2, 3.2, 1.2),
      new MeshStandardMaterial({ color: new Color(theme.parapetCap).getHex(), roughness: 0.9 }),
      PILLAR_COUNT * 2,
    );
    this.pillars.frustumCulled = false;
    scene.add(this.pillars);
    this.layoutPillars();

    this.crowd = new InstancedMesh(
      new BoxGeometry(0.3, 0.82, 0.3),
      new MeshStandardMaterial({ color: new Color(theme.crowd).getHex(), roughness: 0.95 }),
      CROWD_MAX,
    );
    this.crowd.frustumCulled = false;
    this.crowd.count = 0;
    scene.add(this.crowd);
  }

  public apply(terrain: TerrainId): void {
    if (this.terrain === terrain) {
      return;
    }
    this.terrain = terrain;
    const theme = TERRAIN_THEMES[terrain];

    this.fog.color.set(theme.sky);
    this.fog.near = theme.fogNear;
    this.fog.far = theme.fogFar;

    this.hemi.color.set(theme.hemiSky);
    this.hemi.groundColor.set(theme.hemiGround);
    this.hemi.intensity = theme.hemiIntensity;
    this.key.color.set(theme.key);
    this.key.intensity = theme.keyIntensity;

    const nextMap = deckTexture(new Color(theme.deck), new Color(theme.seam));
    this.deckMap.dispose();
    this.deckMap = nextMap;
    this.deck.material.map = nextMap;
    this.deck.material.needsUpdate = true;

    this.water.material.color.set(theme.water);
    for (const parapet of this.parapets) {
      parapet.material.color.set(theme.parapet);
    }
    for (const cap of this.caps) {
      cap.material.color.set(theme.parapetCap);
    }
    (this.pillars.material as MeshStandardMaterial).color.set(theme.parapetCap);
    (this.crowd.material as MeshStandardMaterial).color.set(theme.crowd);
  }

  public backgroundColor(): Color {
    return new Color(TERRAIN_THEMES[this.terrain].sky);
  }

  public setNight(night: boolean): void {
    const theme = TERRAIN_THEMES[this.terrain];
    this.hemi.intensity = theme.hemiIntensity * (night ? 0.4 : 1);
    this.key.intensity = theme.keyIntensity * (night ? 0.45 : 1);
    this.rim.intensity = night ? 1.5 : 0.75;
  }

  public setCrowd(count: number): void {
    const shown = Math.max(0, Math.min(CROWD_MAX, count));
    for (let index = 0; index < shown; index += 1) {
      const column = index % CROWD_COLUMNS;
      const row = Math.floor(index / CROWD_COLUMNS);
      const stagger = row % 2 === 0 ? 0 : CROWD_SPACING / 2;
      this.dummy.position.set(
        (column - (CROWD_COLUMNS - 1) / 2) * CROWD_SPACING + stagger,
        0.42 + Math.sin(this.wobble + index) * 0.04,
        CROWD_FRONT_Z - row * CROWD_DEPTH,
      );
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.crowd.setMatrixAt(index, this.dummy.matrix);
    }
    this.crowd.count = shown;
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  public update(dt: number): void {
    this.scroll = (this.scroll + dt * 0.28) % 1;
    this.deckMap.offset.y = -this.scroll;
    this.wobble += dt * 3.4;
  }

  private layoutPillars(): void {
    let index = 0;
    for (const side of [-1, 1]) {
      for (let step = 0; step < PILLAR_COUNT; step += 1) {
        this.dummy.position.set(
          side * (DECK_WIDTH / 2 + 0.1),
          WATER_LEVEL - 0.4,
          6 - step * 9.4,
        );
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.pillars.setMatrixAt(index, this.dummy.matrix);
        index += 1;
      }
    }
    this.pillars.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    const meshes: Mesh[] = [
      this.water,
      this.deck,
      this.pillars,
      this.crowd,
      ...this.parapets,
      ...this.caps,
    ];
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material.dispose();
      }
      this.scene.remove(mesh);
    }
    this.deckMap.dispose();
    this.scene.remove(this.hemi, this.key, this.rim);
  }
}
