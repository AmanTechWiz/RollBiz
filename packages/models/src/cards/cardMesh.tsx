import { useMemo } from "react";
import {
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Texture,
} from "three";

/** Card thickness and corner radius in world units. */
export const CARD_THICKNESS = 0.015;
const CORNER = 0.065;
const BEVEL = 0.0018;
const FACE_INSET = 0.004;
const FACE_LIFT = 0.0004;

export const FONT_STACK =
  '"SF Pro Rounded", ui-rounded, "Nunito", "Arial Rounded MT Bold", "Varela Round", "Helvetica Neue", system-ui, sans-serif';

// ---------------------------------------------------------------------------
// Canvas helpers

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function setFont(ctx: CanvasRenderingContext2D, weight: number | string, px: number) {
  ctx.font = `${weight} ${px}px ${FONT_STACK}`;
}

/** Greedy word-wrap. Returns the lines that fit `maxWidth` using the current font. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Picks the largest font size (down from `maxPx`) at which `text` wraps into at most `maxLines` lines. */
export function fitWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number | string,
  maxPx: number,
  minPx: number,
  maxWidth: number,
  maxLines: number,
): { px: number; lines: string[] } {
  for (let px = maxPx; px >= minPx; px -= 2) {
    setFont(ctx, weight, px);
    let lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines) {
      // Balance: narrow the measure while the line count stays the same, to avoid one-word last lines.
      if (lines.length > 1) {
        const n = lines.length;
        for (let w = maxWidth * 0.95; w > maxWidth * 0.4; w -= maxWidth * 0.025) {
          const trial = wrapLines(ctx, text, w);
          if (trial.length !== n) break;
          lines = trial;
        }
      }
      return { px, lines };
    }
  }
  setFont(ctx, weight, minPx);
  return { px: minPx, lines: wrapLines(ctx, text, maxWidth) };
}

export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx };
}

export function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Geometry + materials

function roundedRect(w: number, h: number, r: number): Shape {
  const x = -w / 2;
  const y = -h / 2;
  const s = new Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

interface CardGeo {
  body: BufferGeometry;
  top: BufferGeometry;
  bottom: BufferGeometry;
}

const geoCache = new Map<string, CardGeo>();

/** Shared card geometry per (w, h). Y-up, resting on y = 0; faces carry 0..1 UVs over the whole card. */
function cardGeometry(w: number, h: number): CardGeo {
  const key = `${w}x${h}`;
  let g = geoCache.get(key);
  if (g) return g;

  const depth = CARD_THICKNESS - 2 * BEVEL;
  const body = new ExtrudeGeometry(roundedRect(w - 2 * BEVEL, h - 2 * BEVEL, CORNER - BEVEL), {
    depth,
    steps: 1,
    curveSegments: 10,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 1,
  });
  body.rotateX(-Math.PI / 2); // extrude z -> +y, shape y -> -z
  body.translate(0, BEVEL, 0);

  const faceShape = () => roundedRect(w - 2 * FACE_INSET, h - 2 * FACE_INSET, CORNER - FACE_INSET);
  const mkFace = (up: boolean) => {
    const geo = new ShapeGeometry(faceShape(), 10);
    const pos = geo.getAttribute("position");
    const uv = geo.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
    }
    uv.needsUpdate = true;
    if (up) {
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, CARD_THICKNESS + FACE_LIFT, 0);
    } else {
      geo.rotateX(Math.PI / 2);
      geo.translate(0, -FACE_LIFT, 0);
    }
    return geo;
  };

  g = { body, top: mkFace(true), bottom: mkFace(false) };
  geoCache.set(key, g);
  return g;
}

/** White card stock for the edge. */
const edgeMaterial = new MeshStandardMaterial({ color: new Color("#fbfaf6"), roughness: 0.6, metalness: 0 });

const faceMaterials = new WeakMap<Texture, MeshStandardMaterial>();
function faceMaterial(tex: Texture): MeshStandardMaterial {
  let m = faceMaterials.get(tex);
  if (!m) {
    // The emissive copy of the map keeps print colours true under any scene lighting.
    m = new MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new Color("#ffffff"),
      emissiveIntensity: 0.12,
      toneMapped: false,
      roughness: 0.55,
      metalness: 0,
    });
    faceMaterials.set(tex, m);
  }
  return m;
}

/** A flat rounded-rect card lying on y = 0. `top` faces +Y, `bottom` faces -Y. */
export function CardMesh({ width, height, top, bottom }: { width: number; height: number; top: Texture; bottom: Texture }) {
  const geo = useMemo(() => cardGeometry(width, height), [width, height]);
  return (
    <group>
      <mesh geometry={geo.body} material={edgeMaterial} castShadow receiveShadow />
      <mesh geometry={geo.top} material={faceMaterial(top)} receiveShadow />
      <mesh geometry={geo.bottom} material={faceMaterial(bottom)} receiveShadow />
    </group>
  );
}
