import { resolveEconomy, type GroupId, type TileId } from "@rollbiz/engine";
import type { Texture } from "three";
import { rupees } from "./describe";
import { CardMesh, fitWrapped, makeCanvas, roundRectPath, setFont, toTexture } from "./cardMesh";

/** Title deeds are portrait: 1.0 x 1.45 units. */
const W_UNITS = 1.0;
const H_UNITS = 1.45;
const PX_H = 1024;
const PX_W = Math.round((PX_H * W_UNITS) / H_UNITS); // 706

/** Bright, clean group colours. `ink` is the text colour used on top of the header. */
export const GROUP_COLORS: Record<GroupId, { fill: string; deep: string; ink: string }> = {
  brown: { fill: "#ff922b", deep: "#ec7409", ink: "#ffffff" },
  lightBlue: { fill: "#a36bf0", deep: "#8248d9", ink: "#ffffff" },
  pink: { fill: "#f573ae", deep: "#e44f93", ink: "#ffffff" },
  orange: { fill: "#4cc3f7", deep: "#22a6e3", ink: "#0b3a55" },
  red: { fill: "#f25151", deep: "#d93636", ink: "#ffffff" },
  yellow: { fill: "#ffd83d", deep: "#f5be0f", ink: "#4a3600" },
  green: { fill: "#3fc772", deep: "#23a857", ink: "#ffffff" },
  darkBlue: { fill: "#4a67e3", deep: "#3249c2", ink: "#ffffff" },
};
const TRANSPORT = { fill: "#56627c", deep: "#3a4560", ink: "#ffffff" };
const UTILITY = { fill: "#20c1ae", deep: "#0ea08f", ink: "#ffffff" };

const INK = "#1b2434";
const MUTED = "#6c7689";
const LINE = "#d3d9e4";
const PAPER = "#ffffff";

const economy = resolveEconomy();

interface Row {
  label: string;
  value: string;
  strong?: boolean;
}

function drawIcon(ctx: CanvasRenderingContext2D, kind: "transport" | "utility", id: string, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "transport") {
    // Front-on train: body, windscreen, lights, rails
    roundRectPath(ctx, -s * 0.42, -s * 0.52, s * 0.84, s * 0.88, s * 0.18);
    ctx.fill();
    ctx.fillStyle = TRANSPORT.fill;
    roundRectPath(ctx, -s * 0.3, -s * 0.4, s * 0.6, s * 0.34, s * 0.08);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-s * 0.2, s * 0.18, s * 0.07, 0, Math.PI * 2);
    ctx.arc(s * 0.2, s * 0.18, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.5);
    ctx.lineTo(-s * 0.4, s * 0.64);
    ctx.moveTo(s * 0.3, s * 0.5);
    ctx.lineTo(s * 0.4, s * 0.64);
    ctx.stroke();
  } else if (id === "power-grid") {
    // Lightning bolt
    ctx.beginPath();
    ctx.moveTo(s * 0.12, -s * 0.62);
    ctx.lineTo(-s * 0.36, s * 0.1);
    ctx.lineTo(-s * 0.04, s * 0.1);
    ctx.lineTo(-s * 0.14, s * 0.62);
    ctx.lineTo(s * 0.38, -s * 0.12);
    ctx.lineTo(s * 0.06, -s * 0.12);
    ctx.closePath();
    ctx.fill();
  } else {
    // Signal arcs
    ctx.lineWidth = s * 0.1;
    for (const r of [0.28, 0.5, 0.72]) {
      ctx.beginPath();
      ctx.arc(0, s * 0.36, s * r, Math.PI * 1.22, Math.PI * 1.78);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, s * 0.36, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRows(ctx: CanvasRenderingContext2D, rows: Row[], x: number, y: number, w: number, rowH: number, accent: string) {
  rows.forEach((row, i) => {
    const cy = y + i * rowH + rowH / 2;
    if (row.strong) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.14;
      roundRectPath(ctx, x - 16, y + i * rowH + 6, w + 32, rowH - 12, 22);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (i > 0 && !rows[i - 1]!.strong) {
      ctx.fillStyle = LINE;
      ctx.fillRect(x, y + i * rowH - 1.5, w, 3);
    }
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    setFont(ctx, row.strong ? 800 : 700, 36);
    ctx.fillStyle = row.strong ? INK : MUTED;
    ctx.fillText(row.label, x, cy + 1);
    ctx.textAlign = "right";
    setFont(ctx, 900, row.strong ? 46 : 40);
    ctx.fillStyle = INK;
    ctx.fillText(row.value, x + w, cy + 1);
  });
  ctx.textBaseline = "alphabetic";
}

/** Mortgage line anchored to the bottom of the card. */
function drawFooter(ctx: CanvasRenderingContext2D, value: string, x: number, w: number) {
  const y = PX_H - 118;
  ctx.fillStyle = LINE;
  roundRectPath(ctx, x, y, w, 4, 2);
  ctx.fill();
  drawRows(ctx, [{ label: "Mortgage", value }], x, y + 12, w, 80, INK);
}

function drawDice(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  const pips: Record<number, [number, number][]> = {
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  const draw = (x: number, y: number, n: 4 | 6, rot: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    roundRectPath(ctx, -52, -52, 104, 104, 26);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    for (const [px, py] of pips[n]!) {
      ctx.beginPath();
      ctx.arc(px * 26, py * 26, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  draw(cx - 62, cy + 8, 4, -0.18);
  draw(cx + 62, cy - 8, 6, 0.16);
}

function drawDeed(tileId: TileId): HTMLCanvasElement {
  const prop = economy.properties[tileId];
  if (!prop) throw new Error(`not a property tile: ${tileId}`);
  const { canvas, ctx } = makeCanvas(PX_W, PX_H);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PX_W, PX_H);

  const theme = prop.kind === "city" ? GROUP_COLORS[prop.group] : prop.kind === "transport" ? TRANSPORT : UTILITY;
  const HEAD = 250;
  const g = ctx.createLinearGradient(0, 0, PX_W, HEAD);
  g.addColorStop(0, theme.fill);
  g.addColorStop(1, theme.deep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PX_W, HEAD);

  // Header content
  const padX = 52;
  const textW = PX_W - padX * 2;
  ctx.textAlign = "left";
  ctx.fillStyle = theme.ink;
  ctx.globalAlpha = 0.8;
  setFont(ctx, 800, 26);
  ctx.letterSpacing = "6px";
  const kindLabel = prop.kind === "city" ? "TITLE DEED" : prop.kind === "transport" ? "TRANSPORT" : "UTILITY";
  ctx.fillText(kindLabel, padX, 62);
  ctx.letterSpacing = "0px";
  ctx.globalAlpha = 1;

  const iconR = 58;
  const hasIcon = prop.kind !== "city";
  const nameW = hasIcon ? textW - iconR * 2 - 24 : textW;
  let name = fitWrapped(ctx, prop.name, 900, 76, 54, nameW, 1);
  if (name.lines.length > 1) name = fitWrapped(ctx, prop.name, 900, 60, 40, nameW, 2);
  ctx.fillStyle = theme.ink;
  setFont(ctx, 900, name.px);
  const blockH = name.px * 1.08 * name.lines.length;
  const nameTop = 84 + (HEAD - 84 - 28 - blockH) / 2;
  name.lines.forEach((line, i) => ctx.fillText(line, padX, nameTop + name.px * 0.88 + i * name.px * 1.08));
  if (hasIcon) drawIcon(ctx, prop.kind as "transport" | "utility", prop.id, PX_W - padX - iconR, HEAD / 2 + 16, iconR);

  // Price pill straddling the header edge
  const priceText = rupees(prop.price);
  setFont(ctx, 900, 38);
  const pw = ctx.measureText(priceText).width + 64;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(20,30,50,0.18)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  roundRectPath(ctx, padX, HEAD - 34, pw, 68, 34);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(priceText, padX + 32, HEAD + 2);
  ctx.textBaseline = "alphabetic";

  // Body
  const top = HEAD + 66;
  const left = padX;
  if (prop.kind === "city") {
    const group = economy.groups[prop.group];
    const [base, h1, h2, h3, hotel] = prop.rents;
    const rows: Row[] = [
      { label: "Base rent", value: rupees(base), strong: true },
      { label: "With 1 house", value: rupees(h1) },
      { label: "With 2 houses", value: rupees(h2) },
      { label: "With 3 houses", value: rupees(h3) },
      { label: "With hotel", value: rupees(hotel), strong: true },
    ];
    drawRows(ctx, rows, left, top, textW, 84, theme.deep);
    const costs: Row[] = [
      { label: "House cost", value: rupees(group.houseCost) },
      { label: "Hotel cost", value: rupees(group.hotelCost) },
      { label: "Mortgage", value: rupees(prop.mortgage) },
    ];
    const cy = top + rows.length * 84 + 26;
    ctx.fillStyle = LINE;
    roundRectPath(ctx, left, cy, textW, 4, 2);
    ctx.fill();
    drawRows(ctx, costs, left, cy + 14, textW, 70, theme.deep);
  } else if (prop.kind === "transport") {
    const rows: Row[] = prop.rents.map((r, i) => ({
      label: i === 0 ? "Own 1 transport" : `Own ${i + 1} transports`,
      value: rupees(r),
      strong: i === 0 || i === 3,
    }));
    drawRows(ctx, rows, left, top, textW, 128, theme.deep);
    drawFooter(ctx, rupees(prop.mortgage), left, textW);
  } else {
    const [one, both] = economy.rules.utilityMultipliers;
    const rows: Row[] = [
      { label: "Own 1 utility", value: `${one}× dice`, strong: true },
      { label: "Own both utilities", value: `${both}× dice`, strong: true },
    ];
    drawRows(ctx, rows, left, top, textW, 112, theme.deep);
    ctx.textAlign = "center";
    setFont(ctx, 700, 30);
    ctx.fillStyle = MUTED;
    ctx.fillText("Rent is the dice total times the multiplier", PX_W / 2, top + rows.length * 112 + 50);
    drawDice(ctx, PX_W / 2, top + rows.length * 112 + 160, theme.deep);
    drawFooter(ctx, rupees(prop.mortgage), left, textW);
  }

  return canvas;
}

function drawBack(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(PX_W, PX_H);
  const g = ctx.createLinearGradient(0, 0, PX_W, PX_H);
  g.addColorStop(0, "#2b3a63");
  g.addColorStop(1, "#141c36");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PX_W, PX_H);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 3;
  for (let r = 120; r < 900; r += 70) {
    ctx.beginPath();
    ctx.arc(PX_W / 2, PX_H / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 6;
  roundRectPath(ctx, 34, 34, PX_W - 68, PX_H - 68, 40);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  setFont(ctx, 900, 86);
  ctx.letterSpacing = "8px";
  ctx.fillText("ROLLBIZ", PX_W / 2 + 4, PX_H / 2 + 28);
  ctx.letterSpacing = "6px";
  setFont(ctx, 800, 30);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("TITLE DEED", PX_W / 2 + 3, PX_H / 2 + 86);
  ctx.letterSpacing = "0px";
  return canvas;
}

// One texture per tile id (front), one shared back.
const frontCache = new Map<TileId, Texture>();
let backTex: Texture | undefined;

function frontTexture(tileId: TileId): Texture {
  let tex = frontCache.get(tileId);
  if (!tex) {
    tex = toTexture(drawDeed(tileId));
    frontCache.set(tileId, tex);
  }
  return tex;
}

/** Title-deed card for a city, transport or utility. */
export function PropertyCard({ tileId }: { tileId: TileId }) {
  const front = frontTexture(tileId);
  backTex ??= toTexture(drawBack());
  return <CardMesh width={W_UNITS} height={H_UNITS} top={front} bottom={backTex} />;
}
