import { BASE_TILES, resolveEconomy, type GroupId } from "@rollbiz/engine";
import { drawIcon, type IconKind } from "./icons";
import { INNER_SIZE, PRINT_SIZE, TILE_D, TILE_W, tileRect } from "./layout";

/** Bright, clean group colours. */
export const GROUP_COLORS: Record<GroupId, string> = {
  brown: "#a8683c",
  lightBlue: "#5ccbf2",
  pink: "#ff7eb9",
  orange: "#ff9a2e",
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

  // Calm centre: soft sea-blue gradient, nothing else.
  const inner = INNER_SIZE * k;
  const grad = c.createRadialGradient(0, -inner * 0.1, inner * 0.05, 0, 0, inner * 0.78);
  grad.addColorStop(0, "#9be3f5");
  grad.addColorStop(0.55, "#56bfe6");
  grad.addColorStop(1, "#2f93d1");
  c.fillStyle = grad;
  c.fillRect(-inner / 2 - 4, -inner / 2 - 4, inner + 8, inner + 8);

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
    start: { bg: "#3ccf7e", bg2: "#1fa860", icon: "start", label: "START", sub: `Collect ${formatRupees(eco.rules.startBonus)}` },
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
  title(c, s.label, H * (s.sub ? 0.72 : 0.8), W * 0.86, Math.round(W * 0.165), 900, "#ffffff", 2);
  if (s.sub) {
    title(c, s.sub, H * 0.86, W * 0.78, Math.round(W * 0.095), 700, "rgba(255,255,255,0.95)", 1);
  }
  c.restore();
}

