import { BASE_TILES, resolveEconomy, type GroupId } from "@rollbiz/engine";
import { drawIcon, type IconKind } from "./icons";
import { INNER_SIZE, PRINT_SIZE, TILE_D, TILE_W, tileRect } from "./layout";

/** Bright, clean group colours. */
export const GROUP_COLORS: Record<GroupId, string> = {
  brown: "#ff8a1f",
  lightBlue: "#9b5de5",
  pink: "#ff7eb9",
  orange: "#38bdf8",
  red: "#ef4444",
  yellow: "#ffd02b",
  green: "#2fbf71",
  darkBlue: "#2f61d6",
};

const PAPER = "#fbf9f3";
const MARGIN_PAPER = "#f1ecdd";
const LINE = "#d9d3c3";
const LINE_STRONG = "#b9b19b";
const INK = "#1d2433";
const MUTED = "#6b7385";

const FONT = "'SF Pro Rounded', 'Avenir Next', 'Nunito', 'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif";

type Ctx = CanvasRenderingContext2D;

/** 12345678 -> "₹1,23,45,678" */
export function formatRupees(n: number): string {
  const s = String(Math.round(n));
  const tail = s.slice(-3);
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return "₹" + (head ? `${head},${tail}` : tail);
}

function wrapText(c: Ctx, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && c.measureText(test).width > maxW) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw a (wrapped) title centred on (0, cy); shrinks the font until it fits. Returns the block height. */
function title(c: Ctx, text: string, cy: number, maxW: number, size: number, weight = 800, color = INK, maxLines = 3) {
  let s = size;
  let lines: string[] = [];
  for (; s > 20; s -= 2) {
    c.font = `${weight} ${s}px ${FONT}`;
    lines = wrapText(c, text, maxW);
    if (lines.length <= maxLines && lines.every((l) => c.measureText(l).width <= maxW)) break;
  }
  c.fillStyle = color;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const lh = s * 1.15;
  const top = cy - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => c.fillText(l, 0, top + i * lh));
  return lines.length * lh;
}

let nameSize = 48;
const isCornerKind = (kind: string) => kind === "start" || kind === "jail" || kind === "restHouse" || kind === "club";

const TRANSPORT_ICON: Record<string, IconKind> = {
  "indian-railways": "train",
  "national-highways": "road",
  "indian-airways": "plane",
  "coastal-shipping": "ship",
};
const UTILITY_ICON: Record<string, IconKind> = {
  "power-grid": "bolt",
  "digital-bharat-network": "wifi",
};

/** Paint the whole board face onto `canvas` (square). */
export function paintBoard(canvas: HTMLCanvasElement) {
  const c = canvas.getContext("2d");
  if (!c) return;
  const px = canvas.width;
  const k = px / PRINT_SIZE; // pixels per world unit
  const eco = resolveEconomy();
  // One name size for every tile: the largest that still fits the longest single word.
  c.font = `800 100px ${FONT}`;
  const longest = Math.max(...BASE_TILES.filter((t) => !isCornerKind(t.kind)).flatMap((t) => t.name.split(" ").map((w) => c.measureText(w).width)));
  nameSize = Math.min(Math.floor((TILE_W * k * 0.9 * 100) / longest), Math.round(TILE_W * k * 0.2));

  // Printed margin.
  c.fillStyle = MARGIN_PAPER;
  c.fillRect(0, 0, px, px);

  // World (x, z) -> canvas: origin at the centre of the printed area.
  c.save();
  c.translate(px / 2, px / 2);

  const inner = INNER_SIZE * k;
  paintCentre(c, inner, k);

  for (let i = 0; i < 40; i++) {
    const t = tileRect(i);
    const tile = BASE_TILES[i]!;
    c.save();
    c.translate(t.x * k, t.z * k);
    c.rotate(t.rotation);
    const W = t.w * k;
    const H = t.d * k;
    c.beginPath();
    c.rect(-W / 2, -H / 2, W, H);
    c.clip();
    c.translate(-W / 2, -H / 2); // origin at the tile's top-left (top = towards the board centre)
    if (t.isCorner) paintCorner(c, tile.id, W, H, eco);
    else paintTile(c, tile.kind, tile.id, tile.name, tile.group, W, H, eco);
    c.restore();
  }

  // Grid lines between tiles.
  c.lineWidth = 4;
  c.strokeStyle = LINE;
  for (let i = 0; i < 40; i++) {
    const t = tileRect(i);
    const sideways = t.side === 1 || t.side === 3; // world extents swap on the left and right sides
    const ex = (sideways ? t.d : t.w) * k;
    const ez = (sideways ? t.w : t.d) * k;
    c.strokeRect(t.x * k - ex / 2, t.z * k - ez / 2, ex, ez);
  }
  // Track outline (outer and inner).
  c.lineWidth = 7;
  c.strokeStyle = LINE_STRONG;
  const outer = (INNER_SIZE + 2 * TILE_D) * k;
  c.strokeRect(-outer / 2, -outer / 2, outer, outer);
  c.strokeRect(-inner / 2, -inner / 2, inner, inner);
  c.restore();
}

type Eco = ReturnType<typeof resolveEconomy>;

// ---------------------------------------------------------------- centre artwork
// Canvas x = world x, canvas y = world z (the player sits on the +z side, at the bottom).

/** Deck spots printed under the four card stacks: [world x sign, world z sign, deck, world y-rotation]. */
export const DECK_SPOTS: { sx: number; sz: number; deck: "chance" | "communityChest"; angle: number }[] = [
  { sx: -1, sz: -1, deck: "chance", angle: -Math.PI / 4 },
  { sx: 1, sz: 1, deck: "chance", angle: (3 * Math.PI) / 4 },
  { sx: 1, sz: -1, deck: "communityChest", angle: Math.PI / 4 },
  { sx: -1, sz: 1, deck: "communityChest", angle: (-3 * Math.PI) / 4 },
];
/** Distance of each deck from the board centre along x and z (world units). */
export const DECK_INSET = INNER_SIZE / 2 - 1.2;

function paintCentre(c: Ctx, inner: number, k: number) {
  const h = inner / 2;
  c.save();
  c.beginPath();
  c.rect(-h - 4, -h - 4, inner + 8, inner + 8);
  c.clip();

  // Warm festive base.
  const base = c.createRadialGradient(0, 0, inner * 0.05, 0, 0, inner * 0.75);
  base.addColorStop(0, "#fffaf0");
  base.addColorStop(0.6, "#fff0d6");
  base.addColorStop(1, "#ffd9a8");
  c.fillStyle = base;
  c.fillRect(-h - 4, -h - 4, inner + 8, inner + 8);

  // Sunburst rays.
  const rays = 36;
  for (let i = 0; i < rays; i++) {
    if (i % 2) continue;
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = ((i + 1) / rays) * Math.PI * 2;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, inner, a0, a1);
    c.closePath();
    c.fillStyle = "rgba(255, 170, 70, 0.10)";
    c.fill();
  }

  paintRangoli(c, inner * 0.34);
  for (const spot of DECK_SPOTS) paintDeckSpot(c, spot, k);
  paintLogo(c, inner);
  c.restore();
}

/** A colourful rangoli mandala: rings of petals, dots and a lotus centre. */
function paintRangoli(c: Ctx, r: number) {
  const ring = (count: number, dist: number, len: number, wid: number, fill: string, stroke = "#ffffff", spin = 0) => {
    for (let i = 0; i < count; i++) {
      c.save();
      c.rotate((i / count) * Math.PI * 2 + spin);
      c.translate(0, -dist);
      c.beginPath();
      c.ellipse(0, 0, wid, len, 0, 0, Math.PI * 2);
      c.fillStyle = fill;
      c.fill();
      c.lineWidth = r * 0.012;
      c.strokeStyle = stroke;
      c.stroke();
      c.restore();
    }
  };
  const dots = (count: number, dist: number, size: number, fill: string) => {
    c.fillStyle = fill;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      c.beginPath();
      c.arc(Math.cos(a) * dist, Math.sin(a) * dist, size, 0, Math.PI * 2);
      c.fill();
    }
  };
  // soft halo
  const halo = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.15);
  halo.addColorStop(0, "rgba(255,255,255,0.9)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = halo;
  c.beginPath();
  c.arc(0, 0, r * 1.15, 0, Math.PI * 2);
  c.fill();

  c.globalAlpha = 0.55;
  ring(16, r * 0.82, r * 0.2, r * 0.085, "#8b5cf6", "#ffffff", Math.PI / 16);
  ring(16, r * 0.8, r * 0.16, r * 0.07, "#1fb5a8");
  dots(32, r * 1.02, r * 0.028, "#ff9b2f");
  ring(12, r * 0.55, r * 0.17, r * 0.08, "#ff4f8b", "#ffffff", Math.PI / 12);
  ring(12, r * 0.55, r * 0.12, r * 0.05, "#ffc531");
  dots(24, r * 0.72, r * 0.022, "#1e9bf0");
  ring(8, r * 0.3, r * 0.14, r * 0.075, "#ff9b2f", "#ffffff", Math.PI / 8);
  c.globalAlpha = 1;
  c.beginPath();
  c.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  c.fillStyle = "#ffffff";
  c.fill();
  c.lineWidth = r * 0.03;
  c.strokeStyle = "#ff4f8b";
  c.stroke();
}

/** Printed outline under a deck, with the deck's name below it. */
function paintDeckSpot(c: Ctx, spot: (typeof DECK_SPOTS)[number], k: number) {
  const w = 1.7 * k;
  const hgt = 1.25 * k;
  const colour = spot.deck === "chance" ? "#ff8a1f" : "#1e9bf0";
  c.save();
  c.translate(spot.sx * DECK_INSET * k, spot.sz * DECK_INSET * k);
  c.rotate(-spot.angle); // world y-rotation -> canvas rotation
  c.beginPath();
  c.roundRect(-w / 2, -hgt / 2, w, hgt, k * 0.14);
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.fill();
  c.lineWidth = k * 0.05;
  c.strokeStyle = colour;
  c.setLineDash([k * 0.12, k * 0.07]);
  c.stroke();
  c.setLineDash([]);
  c.lineWidth = k * 0.018;
  c.strokeStyle = "#ffffff";
  c.beginPath();
  c.roundRect(-w / 2 + k * 0.06, -hgt / 2 + k * 0.06, w - k * 0.12, hgt - k * 0.12, k * 0.1);
  c.stroke();
  c.fillStyle = colour;
  c.font = `900 ${Math.round(k * 0.17)}px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(spot.deck === "chance" ? "CHANCE" : "COMMUNITY CHEST", 0, hgt / 2 + k * 0.17);
  c.restore();
}

/** The RollBiz wordmark on a glossy white banner, printed corner to corner (bottom-left up to top-right). */
function paintLogo(c: Ctx, inner: number) {
  const size = Math.round(inner * 0.16);
  const text = "RollBiz";
  c.save();
  c.rotate(-Math.PI / 4);
  c.font = `900 ${size}px 'Fredoka Variable', 'Fredoka', ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const tw = c.measureText(text).width;
  const bw = tw + size * 0.9;
  const bh = size * 1.25;

  // banner with a soft drop shadow and a cyan rim
  c.shadowColor = "rgba(20, 60, 110, 0.3)";
  c.shadowBlur = size * 0.25;
  c.shadowOffsetY = size * 0.08;
  c.beginPath();
  c.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  c.fillStyle = "#ffffff";
  c.fill();
  c.shadowColor = "transparent";
  c.lineWidth = size * 0.07;
  c.strokeStyle = "#1e9bf0";
  c.stroke();
  // gloss on the banner's top half
  const gloss = c.createLinearGradient(0, -bh / 2, 0, 0);
  gloss.addColorStop(0, "rgba(200,235,255,0.7)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = gloss;
  c.beginPath();
  c.roundRect(-bw / 2 + size * 0.12, -bh / 2 + size * 0.1, bw - size * 0.24, bh * 0.42, bh * 0.3);
  c.fill();

  // lettering: dark outline, then gradient fill
  const y = size * 0.04;
  c.lineJoin = "round";
  c.lineWidth = size * 0.12;
  c.strokeStyle = "#0d4f9c";
  c.strokeText(text, 0, y);
  const fill = c.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
  fill.addColorStop(0, "#7fdcff");
  fill.addColorStop(0.5, "#1e9bf0");
  fill.addColorStop(1, "#1468d6");
  c.fillStyle = fill;
  c.fillText(text, 0, y);
  c.restore();
}

function paintTile(c: Ctx, kind: string, id: string, name: string, group: GroupId | undefined, W: number, H: number, eco: Eco) {
  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, H);
  c.save();
  c.translate(W / 2, 0); // x = 0 is the tile's centreline
  const maxW = W * 0.9;
  const priceY = H - 66;
  const price = (n: number) => {
    c.fillStyle = INK;
    c.font = `800 ${Math.round(W * 0.185)}px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(formatRupees(n), 0, priceY);
  };

  if (kind === "city" && group) {
    const band = H * 0.24;
    c.fillStyle = GROUP_COLORS[group];
    c.fillRect(-W / 2, 0, W, band);
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(-W / 2, band, W, 5);
    const nameCy = band + (priceY - 52 - band) / 2 + 4;
    title(c, name, nameCy, maxW, nameSize);
    const p = eco.properties[id];
    if (p) price(p.price);
  } else if (kind === "transport" || kind === "utility") {
    const accent = kind === "transport" ? "#334155" : "#f59e0b";
    c.fillStyle = accent;
    c.fillRect(-W / 2, 0, W, 20);
    title(c, name, 100, maxW, nameSize, 800, INK, 2);
    c.save();
    c.translate(0, H * 0.5);
    const ico = (kind === "transport" ? TRANSPORT_ICON : UTILITY_ICON)[id];
    if (ico) drawIcon(c, ico, W * 0.25, accent, PAPER);
    c.restore();
    const p = eco.properties[id];
    if (p) price(p.price);
  } else if (kind === "chance") {
    c.fillStyle = "#ff8a1f";
    c.fillRect(-W / 2, 0, W, 20);
    title(c, name, 100, maxW, nameSize);
    c.save();
    c.translate(0, H * 0.6);
    drawIcon(c, "chance", W * 0.3, "#ff6b00", "#ffffff");
    c.restore();
  } else if (kind === "communityChest") {
    c.fillStyle = "#3b82f6";
    c.fillRect(-W / 2, 0, W, 20);
    title(c, name, 100, maxW, nameSize, 800, INK, 2);
    c.save();
    c.translate(0, H * 0.6);
    drawIcon(c, "chest", W * 0.3, "#2563eb", "#fcd34d");
    c.restore();
  } else if (kind === "incomeTax") {
    c.fillStyle = "#ef4444";
    c.fillRect(-W / 2, 0, W, 20);
    title(c, name, 100, maxW, nameSize, 800, INK, 2);
    c.save();
    c.translate(0, H * 0.5);
    drawIcon(c, "incomeTax", W * 0.25, "#475569", "#ffffff");
    c.restore();
    c.fillStyle = "#dc2626";
    c.font = `800 ${Math.round(W * 0.15)}px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(`Pay ${formatRupees(eco.rules.incomeTax)}`, 0, priceY);
  } else if (kind === "wealthTax") {
    c.fillStyle = "#8b5cf6";
    c.fillRect(-W / 2, 0, W, 20);
    title(c, name, 100, maxW, nameSize, 800, INK, 2);
    c.save();
    c.translate(0, H * 0.5);
    drawIcon(c, "wealthTax", W * 0.25, "#8b5cf6", "#ffffff");
    c.restore();
    c.fillStyle = "#7c3aed";
    title(c, `${formatRupees(eco.rules.wealthTaxPerHouse)} per house`, priceY - 20, maxW, Math.round(W * 0.13), 800, "#7c3aed", 1);
    c.fillStyle = MUTED;
    c.font = `700 ${Math.round(W * 0.115)}px ${FONT}`;
    c.fillText(`Max ${formatRupees(eco.rules.wealthTaxCap)}`, 0, priceY + 26);
  }
  c.restore();
}

function paintCorner(c: Ctx, id: string, W: number, H: number, eco: Eco) {
  type Spec = { bg: string; bg2: string; icon: IconKind; label: string; sub?: string };
  const spec: Record<string, Spec> = {
    start: { bg: "#1f9150", bg2: "#0f6634", icon: "start", label: "START", sub: `Collect ${formatRupees(eco.rules.startBonus)}` },
    jail: { bg: "#ffa63a", bg2: "#f27a12", icon: "jail", label: "JAIL", sub: "Just Visiting" },
    "rest-house": { bg: "#3cd0c0", bg2: "#1a9fa0", icon: "rest", label: "REST HOUSE" },
    club: { bg: "#a779ff", bg2: "#7a4be0", icon: "club", label: "CLUB" },
  };
  const s = spec[id];
  if (!s) return;
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, s.bg);
  g.addColorStop(1, s.bg2);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // Soft inner plate.
  c.fillStyle = "rgba(255,255,255,0.08)";
  c.beginPath();
  c.roundRect(W * 0.07, H * 0.07, W * 0.86, H * 0.86, W * 0.1);
  c.fill();
  c.save();
  c.translate(W / 2, H * 0.4);
  drawIcon(c, s.icon, W * 0.25, "#ffffff", s.bg2);
  c.restore();
  c.save();
  c.translate(W / 2, 0);
  // a soft dark shadow under the lettering keeps it crisp and readable on any corner colour
  c.shadowColor = "rgba(0, 30, 15, 0.45)";
  c.shadowBlur = W * 0.02;
  c.shadowOffsetY = W * 0.008;
  const big = id === "start" ? 0.2 : 0.165;
  title(c, s.label, H * (s.sub ? 0.71 : 0.8), W * 0.86, Math.round(W * big), 900, "#ffffff", 2);
  if (s.sub) {
    title(c, s.sub, H * 0.86, W * 0.84, Math.round(W * (id === "start" ? 0.112 : 0.095)), 800, "#ffffff", 1);
  }
  c.restore();
}

