import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  CanvasTexture,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from "three";
import "../r3f-jsx";
import { BOARD_THICKNESS, PRINT_SIZE } from "./layout";
import { paintBoard } from "./paint";

export { BOARD_SIZE, tileCenter } from "./layout";

const TEXTURE_SIZE = 4096;
const CORNER_RADIUS = 0.3;
const BEVEL = 0.05;

function roundedRect(size: number, r: number): Shape {
  const h = size / 2;
  const s = new Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
  s.lineTo(h, h - r);
  s.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-h + r, h);
  s.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-h, -h + r);
  s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** The 40-tile board: a thick rounded card slab with one 4096px printed top face. */
export function Board() {
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const maxTex = useThree((s) => s.gl.capabilities.maxTextureSize);

  const { slab, face, edgeMat } = useMemo(() => {
    const bt = BEVEL * 0.8;
    const slab = new ExtrudeGeometry(roundedRect(PRINT_SIZE, CORNER_RADIUS), {
      depth: BOARD_THICKNESS - 2 * bt,
      bevelEnabled: true,
      bevelThickness: bt,
      bevelSize: BEVEL,
      bevelSegments: 4,
      curveSegments: 10,
    });
    slab.translate(0, 0, bt);
    slab.rotateX(-Math.PI / 2);

    const face = new ShapeGeometry(roundedRect(PRINT_SIZE, CORNER_RADIUS), 10);
    const pos = face.getAttribute("position");
    const uv = face.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / PRINT_SIZE + 0.5, pos.getY(i) / PRINT_SIZE + 0.5);
    face.rotateX(-Math.PI / 2);

    const edgeMat = new MeshStandardMaterial({ color: "#f3eee0", roughness: 0.55, metalness: 0 });
    return { slab, face, edgeMat };
  }, []);

  const { texture, faceMat } = useMemo(() => {
    const size = Math.min(TEXTURE_SIZE, maxTex);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    paintBoard(canvas);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = maxAniso;
    texture.needsUpdate = true;
    const faceMat = new MeshStandardMaterial({
      map: texture,
      roughness: 0.6,
      metalness: 0,
      emissive: "#ffffff",
      emissiveMap: texture,
      emissiveIntensity: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    return { texture, faceMat };
  }, [maxAniso, maxTex]);

  // Repaint once web fonts are ready (the stack is system fonts, but a late font swap must not leave stale text).
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (!live) return;
      paintBoard(texture.image as HTMLCanvasElement);
      texture.needsUpdate = true;
    });
    return () => {
      live = false;
    };
  }, [texture]);

  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(
    () => () => {
      slab.dispose();
      face.dispose();
      edgeMat.dispose();
      faceMat.dispose();
    },
    [slab, face, edgeMat, faceMat],
  );

  return (
    <group>
      <mesh geometry={slab} material={edgeMat} castShadow receiveShadow />
      <mesh geometry={face} material={faceMat} position={[0, BOARD_THICKNESS + 0.0005, 0]} receiveShadow />
    </group>
  );
}
