import { resolveEconomy, type CardId, type DeckId } from "@rollbiz/engine";
import type { Texture } from "three";
import { describeEffect } from "./describe";
import { CardMesh, fitWrapped, makeCanvas, roundRectPath, setFont, toTexture } from "./cardMesh";

/** Event cards are landscape: 1.45 x 1.0 units. */
const W_UNITS = 1.45;
const H_UNITS = 1.0;
const PX_W = 1024;
const PX_H = Math.round((PX_W * H_UNITS) / W_UNITS); // 706

interface Theme {
  name: string;
  /** Strong accent, top of the gradient. */
  a: string;
  /** Deeper accent, bottom of the gradient. */
  b: string;
  /** Very light page tint for the front. */
  paper: string;
  /** Light tint for the effect panel. */
  panel: string;
  /** Text colour on the panel. */
  ink: string;
}

const THEMES: Record<DeckId, Theme> = {
  chance: { name: "CHANCE", a: "#ffae3d", b: "#ff7a1a", paper: "#fffaf3", panel: "#fff0dc", ink: "#8a3c05" },
  communityChest: { name: "COMMUNITY CHEST", a: "#4cb4ff", b: "#1c78f0", paper: "#f5faff", panel: "#e3f1ff", ink: "#0d478f" },
};

const TITLE_INK = "#1b2434";

const economy = resolveEconomy();

// ---------------------------------------------------------------------------
// Drawing

function drawQuestion(ctx: CanvasRenderingContext2D, cx: number, cy: number, px: number, fill: string) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setFont(ctx, 900, px);
  ctx.fillStyle = fill;
  ctx.fillText("?", cx, cy);
  ctx.textBaseline = "alphabetic";
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** Treasure chest centred on (cx, cy), `s` px wide. */
function drawChest(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, lid: string, body: string, gold: string, dark: string) {
  ctx.save();
  ctx.translate(cx, cy);
  const x0 = -s / 2;
  const seam = 0; // y of lid / body seam
  const bodyH = s * 0.42;
  const lidH = s * 0.36;

  // Body
  ctx.fillStyle = body;
  roundRectPath(ctx, x0, seam, s, bodyH, s * 0.06);
  ctx.fill();
  // Lid (dome)
  ctx.fillStyle = lid;
  ctx.beginPath();
  ctx.moveTo(x0, seam);
  ctx.lineTo(x0, seam - lidH * 0.45);
  ctx.ellipse(0, seam - lidH * 0.45, s / 2, lidH * 0.55, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(x0 + s, seam);
  ctx.closePath();
  ctx.fill();
  // Straps
  ctx.fillStyle = gold;
  for (const sx of [-0.3, 0.3]) {
    roundRectPath(ctx, sx * s - s * 0.04, seam - lidH * 0.98, s * 0.08, lidH * 0.98 + bodyH, s * 0.02);
    ctx.fill();
  }
  // Seam band
  roundRectPath(ctx, x0, seam - s * 0.035, s, s * 0.07, s * 0.03);
  ctx.fill();
  // Lock
  roundRectPath(ctx, -s * 0.085, seam - s * 0.06, s * 0.17, s * 0.19, s * 0.04);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.lineWidth = s * 0.016;
  ctx.strokeStyle = dark;
  ctx.stroke();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, seam + s * 0.0, s * 0.026, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-s * 0.009, seam, s * 0.018, s * 0.06);
  ctx.restore();
}

function drawBack(deck: DeckId): HTMLCanvasElement {
  const t = THEMES[deck];
  const { canvas, ctx } = makeCanvas(PX_W, PX_H);

  const g = ctx.createLinearGradient(0, 0, PX_W * 0.5, PX_H);
  g.addColorStop(0, t.a);
  g.addColorStop(1, t.b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PX_W, PX_H);

  // Soft concentric rings behind the mark.
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 3;
  for (let r = 150; r < 760; r += 78) {
    ctx.beginPath();
    ctx.arc(PX_W / 2, PX_H * 0.46, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Inner keyline.
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 6;
  roundRectPath(ctx, 34, 34, PX_W - 68, PX_H - 68, 40);
  ctx.stroke();

  const cx = PX_W / 2;
  const cy = PX_H * 0.45;
  if (deck === "chance") {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(cx, cy, 255, 0, Math.PI * 2);
    ctx.fill();
    drawQuestion(ctx, cx + 10, cy + 14, 470, "rgba(150,60,0,0.28)");
    drawQuestion(ctx, cx, cy, 470, "#ffffff");
    drawSparkle(ctx, cx - 300, cy - 150, 34, "#fff");
    drawSparkle(ctx, cx + 315, cy + 120, 26, "#fff");
    drawSparkle(ctx, cx + 255, cy - 190, 18, "rgba(255,255,255,0.8)");
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(cx, cy, 255, 0, Math.PI * 2);
    ctx.fill();
    drawChest(ctx, cx + 8, cy - 40 + 12, 400, "rgba(0,50,130,0.3)", "rgba(0,50,130,0.3)", "rgba(0,50,130,0.3)", "rgba(0,50,130,0.3)");
    drawChest(ctx, cx, cy - 40, 400, "#ffffff", "#dcecff", "#ffc83d", "#7a5200");
    drawSparkle(ctx, cx - 290, cy - 150, 32, "#fff");
    drawSparkle(ctx, cx + 300, cy + 90, 24, "#fff");
    drawSparkle(ctx, cx + 250, cy - 190, 18, "rgba(255,255,255,0.8)");
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  setFont(ctx, 900, deck === "chance" ? 64 : 54);
  ctx.letterSpacing = "10px";
  ctx.fillText(t.name, cx + 5, PX_H - 92);
  ctx.letterSpacing = "0px";
  return canvas;
}

function drawFront(cardId: CardId): HTMLCanvasElement {
  const card = economy.cards[cardId];
  if (!card) throw new Error(`unknown card id: ${cardId}`);
  const t = THEMES[card.deck];
  const { canvas, ctx } = makeCanvas(PX_W, PX_H);

  ctx.fillStyle = t.paper;
  ctx.fillRect(0, 0, PX_W, PX_H);

  // Header band
  const HEAD = 150;
  const g = ctx.createLinearGradient(0, 0, PX_W, HEAD);
  g.addColorStop(0, t.a);
  g.addColorStop(1, t.b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PX_W, HEAD);
  // Faint ring accent in the header
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 3;
  for (let r = 70; r < 260; r += 44) {
    ctx.beginPath();
    ctx.arc(PX_W - 110, HEAD / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Deck name
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  setFont(ctx, 900, card.deck === "chance" ? 62 : 52);
  ctx.letterSpacing = "6px";
  ctx.fillText(t.name, 64, HEAD / 2 + (card.deck === "chance" ? 22 : 18));
  ctx.letterSpacing = "0px";

  // Badge
  const bx = PX_W - 110;
  const by = HEAD / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(bx, by, 52, 0, Math.PI * 2);
  ctx.fill();
  if (card.deck === "chance") {
    drawQuestion(ctx, bx, by + 4, 78, t.b);
  } else {
    drawChest(ctx, bx, by - 12, 84, t.a, t.b, "#ffc83d", "#7a5200");
  }

  // Title
  const padX = 64;
  const textW = PX_W - padX * 2;
  const title = fitWrapped(ctx, card.title, 900, 92, 52, textW, 2);
  ctx.fillStyle = TITLE_INK;
  ctx.textAlign = "left";
  setFont(ctx, 900, title.px);
  const titleTop = HEAD + 34;
  title.lines.forEach((line, i) => ctx.fillText(line, padX, titleTop + title.px * 0.95 + i * title.px * 1.08));
  const titleBottom = titleTop + title.px * 1.08 * title.lines.length;

  // Accent pill
  ctx.fillStyle = t.b;
  roundRectPath(ctx, padX, titleBottom + 22, 110, 10, 5);
  ctx.fill();

  // Effect panel
  const panelTop = Math.max(titleBottom + 68, 410);
  const panelBottom = PX_H - 54;
  ctx.fillStyle = t.panel;
  roundRectPath(ctx, padX - 16, panelTop, textW + 32, panelBottom - panelTop, 36);
  ctx.fill();

  const effect = describeEffect(card.effect);
  const fit = fitWrapped(ctx, effect, 800, 70, 34, textW - 30, 3);
  setFont(ctx, 800, fit.px);
  ctx.fillStyle = t.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lh = fit.px * 1.22;
  const midY = (panelTop + panelBottom) / 2;
  fit.lines.forEach((line, i) => ctx.fillText(line, PX_W / 2, midY + (i - (fit.lines.length - 1) / 2) * lh));
  ctx.textBaseline = "alphabetic";

  return canvas;
}

// ---------------------------------------------------------------------------
// Shared textures: one per card id (front) and one per deck (back).

const frontCache = new Map<CardId, Texture>();
const backCache = new Map<DeckId, Texture>();

function frontTexture(cardId: CardId): Texture {
  let tex = frontCache.get(cardId);
  if (!tex) {
    tex = toTexture(drawFront(cardId));
    frontCache.set(cardId, tex);
  }
  return tex;
}

function backTexture(deck: DeckId): Texture {
  let tex = backCache.get(deck);
  if (!tex) {
    tex = toTexture(drawBack(deck));
    backCache.set(deck, tex);
  }
  return tex;
}

/** Chance or Community Chest card. `faceUp` picks which side faces +Y. */
export function EventCard({ cardId, faceUp = true }: { cardId: CardId; faceUp?: boolean }) {
  const card = economy.cards[cardId];
  if (!card) throw new Error(`unknown card id: ${cardId}`);
  const front = frontTexture(cardId);
  const back = backTexture(card.deck);
  return <CardMesh width={W_UNITS} height={H_UNITS} top={faceUp ? front : back} bottom={faceUp ? back : front} />;
}
