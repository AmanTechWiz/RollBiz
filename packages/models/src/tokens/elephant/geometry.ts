import { BufferGeometry } from "three";
import { mergeAll } from "../geoKit";
import { BASE_H, FIELD_BOX, elephantField } from "./body";
import { meshField } from "./mesher";
import { clothGeometries, clothSurface } from "./cloth";
import { earGeometry, eyeGeometry, eyeLid, feetDetails, smileGeometry, tailGeometry, trunkWrinkles, tuskGeometry } from "./parts";

// Elephant token, built to match docs/art/reference/token-elephant-v2.png.
// One continuous SDF body (surface nets), thin parts as separate meshes, all in final units.

const CELL = 0.0092;
const FIT_LENGTH = 0.75;

/** Drop skin triangles that are entirely hidden under the saddle cloth. */
function cullUnder(g: BufferGeometry, hidden: (x: number, y: number, z: number) => boolean): BufferGeometry {
  const pos = g.getAttribute("position");
  const idx = g.getIndex()!;
  const hid = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) hid[i] = hidden(pos.getX(i), pos.getY(i), pos.getZ(i)) ? 1 : 0;
  const keep: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    if (hid[a] && hid[b] && hid[c]) continue;
    keep.push(a, b, c);
  }
  g.setIndex(keep);
  return g;
}

export interface ElephantGeometry {
  body: BufferGeometry;
  ivory: BufferGeometry;
  eyes: BufferGeometry;
}

export function buildElephant(): ElephantGeometry {
  const field = elephantField();
  const cloth = clothSurface(field);
  const skin = cullUnder(meshField(field, FIELD_BOX, CELL), (x, y, z) => cloth.covers(x, y, z, 0.012));
  const body = mergeAll([
    skin,
    ...clothGeometries(cloth),
    earGeometry(1),
    earGeometry(-1),
    eyeLid(field, 1),
    eyeLid(field, -1),
    ...tailGeometry(),
    ...feetDetails(field),
    ...trunkWrinkles(),
    smileGeometry(field, 1),
    smileGeometry(field, -1),
  ]);
  const ivory = mergeAll([tuskGeometry(1), tuskGeometry(-1)]);
  const eyes = mergeAll([eyeGeometry(field, 1), eyeGeometry(field, -1)]);
  // stand on the ground (soles at y = 0), centre the footprint on X and fit about 0.75 long
  body.computeBoundingBox();
  ivory.computeBoundingBox();
  const minX = Math.min(body.boundingBox!.min.x, ivory.boundingBox!.min.x);
  const maxX = Math.max(body.boundingBox!.max.x, ivory.boundingBox!.max.x);
  const k = FIT_LENGTH / (maxX - minX);
  for (const part of [body, ivory, eyes]) {
    part.translate(-(minX + maxX) / 2, -BASE_H, 0);
    part.scale(k, k, k);
  }
  return { body, ivory, eyes };
}
