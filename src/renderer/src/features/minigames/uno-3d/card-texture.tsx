import { renderToStaticMarkup } from "react-dom/server";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { MinigameUnoCard } from "@shared/minigames";
import { UnoCardFace } from "../components/card-art";

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 768;

export interface UnoPalette {
  r: string;
  y: string;
  g: string;
  b: string;
  w: string;
  shell: string;
  font: string;
}

export const UNO_FALLBACK_PALETTE: UnoPalette = {
  r: "#ee1c25",
  y: "#ffc900",
  g: "#00a94f",
  b: "#0077d4",
  w: "#17171c",
  shell: "#f8f6f1",
  font: '"Space Grotesk", "Segoe UI", sans-serif',
};

let palette: UnoPalette | null = null;

function readPalette(): UnoPalette {
  if (palette) {
    return palette;
  }

  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;

  palette = {
    r: read("--ct-uno-r", UNO_FALLBACK_PALETTE.r),
    y: read("--ct-uno-y", UNO_FALLBACK_PALETTE.y),
    g: read("--ct-uno-g", UNO_FALLBACK_PALETTE.g),
    b: read("--ct-uno-b", UNO_FALLBACK_PALETTE.b),
    w: read("--ct-uno-w", UNO_FALLBACK_PALETTE.w),
    shell: read("--ct-uno-shell", UNO_FALLBACK_PALETTE.shell),
    font: read("--ct-font-sans", UNO_FALLBACK_PALETTE.font),
  };

  return palette;
}

function bodyColor(color: string, tones: UnoPalette): string {
  switch (color) {
    case "r":
      return tones.r;
    case "y":
      return tones.y;
    case "g":
      return tones.g;
    case "b":
      return tones.b;
    default:
      return tones.w;
  }
}

function faceStyles(color: string, facedown: boolean, tones: UnoPalette): string {
  const ink = facedown ? tones.w : bodyColor(color, tones);

  return [
    `.ct-uno-shell{fill:${tones.shell}}`,
    `.ct-uno-body{fill:${ink}}`,
    `.ct-uno-keyline{fill:none;stroke:rgb(0 0 0 / 0.22);stroke-width:1.4}`,
    `.ct-uno-oval{fill:${tones.shell};transform:rotate(-20deg);transform-origin:50px 75px}`,
    `.ct-uno-backmark{transform:rotate(-20deg);transform-origin:50px 75px}`,
    `.ct-uno-numeral{font-family:${tones.font};font-size:72px;font-weight:700;` +
      `fill:${ink};paint-order:stroke;stroke:${tones.shell};stroke-width:7}`,
    `.ct-uno-corner{font-family:${tones.font};font-size:25px;font-weight:700;` +
      `fill:${tones.shell};paint-order:stroke;stroke:rgb(0 0 0 / 0.4);stroke-width:4}`,
    `.ct-uno-glyph{fill:${ink};stroke:${ink};paint-order:stroke}`,
    `.ct-uno-glyph [fill="none"]{fill:none}`,
    `.ct-uno-cards rect{fill:${ink};stroke:${tones.shell};stroke-width:4}`,
    `.ct-uno-cards rect[data-wedge="r"],.ct-uno-wedges path[data-wedge="r"]{fill:${tones.r}}`,
    `.ct-uno-cards rect[data-wedge="y"],.ct-uno-wedges path[data-wedge="y"]{fill:${tones.y}}`,
    `.ct-uno-cards rect[data-wedge="g"],.ct-uno-wedges path[data-wedge="g"]{fill:${tones.g}}`,
    `.ct-uno-cards rect[data-wedge="b"],.ct-uno-wedges path[data-wedge="b"]{fill:${tones.b}}`,
  ].join("");
}

export function unoCardMarkup(
  card: MinigameUnoCard,
  facedown: boolean,
  tones: UnoPalette,
): string {
  const face = renderToStaticMarkup(<UnoCardFace card={card} facedown={facedown} />);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TEXTURE_WIDTH}" height="${TEXTURE_HEIGHT}"`,
    ` viewBox="0 0 100 150">`,
    `<style>${faceStyles(card.color, facedown, tones)}</style>`,
    face,
    `</svg>`,
  ].join("");
}

const textures = new Map<string, CanvasTexture>();

export function unoCardTexture(
  card: MinigameUnoCard,
  facedown: boolean,
  onReady: () => void,
): CanvasTexture {
  const key = facedown ? "back" : `${card.color}:${card.kind}`;
  const cached = textures.get(key);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  textures.set(key, texture);

  const image = new Image();
  image.onload = () => {
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
      context.drawImage(image, 0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    }
    texture.needsUpdate = true;
    onReady();
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    unoCardMarkup(card, facedown, readPalette()),
  )}`;

  return texture;
}
