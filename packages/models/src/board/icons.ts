// Flat, rounded canvas icons for the board faces. Each draws inside a box centred on (0,0) with
// half-size `r`, in the current (already translated / rotated) canvas space.

export type IconKind =
  | "train" | "road" | "plane" | "ship" | "bolt" | "wifi"
  | "chance" | "chest" | "incomeTax" | "wealthTax"
  | "start" | "jail" | "rest" | "club";

type Ctx = CanvasRenderingContext2D;

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}

const WHITE = "#ffffff";

export function drawIcon(c: Ctx, kind: IconKind, r: number, color: string, accent = "#ffffff") {
  c.save();
  c.lineCap = "round";
  c.lineJoin = "round";
  c.fillStyle = color;
  c.strokeStyle = color;
  const u = r / 100; // 1 unit = 1% of the half-size
  c.scale(u, u);
  ICONS[kind](c, color, accent);
  c.restore();
}

const ICONS: Record<IconKind, (c: Ctx, col: string, acc: string) => void> = {
  train(c, col, acc) {
    // Front view of an express train.
    rr(c, -62, -88, 124, 150, 38); c.fill();
    c.fillStyle = acc;
    rr(c, -44, -66, 88, 52, 14); c.fill();
    c.fillStyle = acc;
    circle(c, -30, 30, 11); c.fill();
    circle(c, 30, 30, 11); c.fill();
    c.fillStyle = col;
    rr(c, -52, 66, 104, 14, 7); c.fill();
    c.strokeStyle = col; c.lineWidth = 12;
    c.beginPath(); c.moveTo(-40, 82); c.lineTo(-58, 98); c.moveTo(40, 82); c.lineTo(58, 98); c.stroke();
    c.fillStyle = acc;
    rr(c, -20, -8, 40, 10, 5); c.fill();
  },
  road(c, col, acc) {
    c.beginPath();
    c.moveTo(-18, -92); c.lineTo(18, -92); c.lineTo(88, 92); c.lineTo(-88, 92); c.closePath(); c.fill();
    c.strokeStyle = acc; c.lineWidth = 9;
    c.setLineDash([22, 20]);
    c.beginPath(); c.moveTo(0, -84); c.lineTo(0, 92); c.stroke();
    c.setLineDash([]);
    c.lineWidth = 6;
    c.beginPath(); c.moveTo(-12, -80); c.lineTo(-72, 86); c.moveTo(12, -80); c.lineTo(72, 86); c.stroke();
  },
  plane(c, col) {
    // Top-down airliner pointing up-right.
    c.rotate(Math.PI / 4);
    c.beginPath();
    c.moveTo(0, -96);
    c.quadraticCurveTo(14, -80, 14, -50);
    c.lineTo(14, -14); c.lineTo(94, 36); c.lineTo(94, 52); c.lineTo(14, 30);
    c.lineTo(14, 62); c.lineTo(40, 82); c.lineTo(40, 94); c.lineTo(0, 84);
    c.lineTo(-40, 94); c.lineTo(-40, 82); c.lineTo(-14, 62);
    c.lineTo(-14, 30); c.lineTo(-94, 52); c.lineTo(-94, 36); c.lineTo(-14, -14); c.lineTo(-14, -50);
    c.quadraticCurveTo(-14, -80, 0, -96);
    c.closePath(); c.fillStyle = col; c.fill();
  },
  ship(c, col, acc) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(-92, 10); c.lineTo(92, 10); c.lineTo(66, 62); c.quadraticCurveTo(62, 68, 54, 68);
    c.lineTo(-54, 68); c.quadraticCurveTo(-62, 68, -66, 62); c.closePath(); c.fill();
    rr(c, -56, -38, 112, 40, 8); c.fill();
    rr(c, -30, -74, 28, 38, 6); c.fill();
    rr(c, 6, -62, 30, 26, 6); c.fill();
    c.fillStyle = acc;
    for (const x of [-42, -14, 14, 42]) { circle(c, x, -18, 7); c.fill(); }
    c.strokeStyle = col; c.lineWidth = 9;
    c.beginPath();
    for (let x = -88; x < 80; x += 44) {
      c.moveTo(x, 90); c.quadraticCurveTo(x + 11, 76, x + 22, 90); c.quadraticCurveTo(x + 33, 104, x + 44, 90);
    }
    c.stroke();
  },
  bolt(c, col) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(24, -96); c.lineTo(-58, 12); c.lineTo(-8, 12); c.lineTo(-30, 96); c.lineTo(58, -18); c.lineTo(6, -18);
    c.closePath(); c.lineWidth = 14; c.strokeStyle = col; c.stroke(); c.fill();
  },
  wifi(c, col) {
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 17;
    for (const rad of [88, 58, 28]) {
      c.beginPath(); c.arc(0, 62, rad, -Math.PI * 0.77, -Math.PI * 0.23); c.stroke();
    }
    circle(c, 0, 62, 13); c.fill();
  },
  chance(c, col, acc) {
    c.save(); c.rotate(-0.12);
    rr(c, -66, -88, 132, 176, 26); c.fill();
    c.strokeStyle = acc; c.fillStyle = acc; c.lineWidth = 24;
    c.beginPath(); c.arc(0, -28, 34, Math.PI * 0.95, Math.PI * 2.5); c.lineTo(0, 30); c.stroke();
    circle(c, 0, 62, 14); c.fill();
    c.restore();
  },
  chest(c, col, acc) {
    // Treasure chest with a lock.
    c.beginPath();
    c.moveTo(-84, -6); c.lineTo(-84, -34); c.quadraticCurveTo(-84, -76, 0, -76); c.quadraticCurveTo(84, -76, 84, -34); c.lineTo(84, -6);
    c.closePath(); c.fill();
    rr(c, -84, -2, 168, 78, 12); c.fill();
    c.strokeStyle = acc; c.lineWidth = 8;
    c.beginPath(); c.moveTo(-84, -2); c.lineTo(84, -2); c.moveTo(-50, -72); c.lineTo(-50, 74); c.moveTo(50, -72); c.lineTo(50, 74); c.stroke();
    c.fillStyle = acc;
    rr(c, -17, -18, 34, 38, 8); c.fill();
    c.fillStyle = col;
    circle(c, 0, -2, 6); c.fill();
    c.fillRect(-3, -2, 6, 14);
  },
  incomeTax(c, col, acc) {
    // Document with a rupee sign.
    c.beginPath();
    c.moveTo(-60, -90); c.lineTo(22, -90); c.lineTo(60, -52); c.lineTo(60, 80); c.quadraticCurveTo(60, 92, 48, 92);
    c.lineTo(-48, 92); c.quadraticCurveTo(-60, 92, -60, 80); c.closePath(); c.fill();
    c.fillStyle = acc;
    c.beginPath(); c.moveTo(22, -90); c.lineTo(22, -64); c.quadraticCurveTo(22, -52, 34, -52); c.lineTo(60, -52); c.closePath(); c.globalAlpha = 0.45; c.fill(); c.globalAlpha = 1;
    c.font = "800 96px 'Avenir Next', 'Helvetica Neue', Arial, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("₹", 0, 22);
    c.fillRect(-34, -34, 44, 9);
  },
  wealthTax(c, col, acc) {
    // Gem.
    c.beginPath();
    c.moveTo(-46, -76); c.lineTo(46, -76); c.lineTo(92, -18); c.lineTo(0, 88); c.lineTo(-92, -18); c.closePath();
    c.fill();
    c.strokeStyle = acc; c.lineWidth = 7;
    c.beginPath();
    c.moveTo(-92, -18); c.lineTo(92, -18);
    c.moveTo(-46, -76); c.lineTo(-24, -18); c.lineTo(0, 88);
    c.moveTo(46, -76); c.lineTo(24, -18); c.lineTo(0, 88);
    c.moveTo(-24, -18); c.lineTo(0, -76); c.lineTo(24, -18);
    c.stroke();
  },
  start(c, col, acc) {
    // Big rounded arrow pointing in the direction of travel (left in tile space, i.e. towards -X on the bottom row).
    c.beginPath();
    c.moveTo(-96, 0); c.lineTo(-30, -66); c.lineTo(-30, -32); c.lineTo(92, -32); c.lineTo(92, 32); c.lineTo(-30, 32); c.lineTo(-30, 66);
    c.closePath(); c.lineWidth = 16; c.strokeStyle = col; c.stroke(); c.fill();
    void acc;
  },
  jail(c, col, acc) {
    rr(c, -82, -82, 164, 164, 22); c.fill();
    c.fillStyle = acc;
    for (const x of [-48, -16, 16, 48]) { rr(c, x - 7, -62, 14, 124, 7); c.fill(); }
  },
  rest(c, col, acc) {
    // Little house: roof, body, door and window.
    c.beginPath();
    c.moveTo(-96, -2); c.lineTo(0, -92); c.lineTo(96, -2); c.closePath();
    c.lineWidth = 14; c.strokeStyle = col; c.stroke(); c.fill();
    rr(c, -68, -4, 136, 88, 12); c.fill();
    rr(c, 44, -84, 24, 46, 6); c.fill();
    c.fillStyle = acc;
    rr(c, -18, 26, 36, 58, 10); c.fill();
    rr(c, -52, 14, 22, 22, 5); c.fill();
    rr(c, 30, 14, 22, 22, 5); c.fill();
  },
  club(c, col, acc) {
    // Cocktail glass with a star.
    c.beginPath();
    c.moveTo(-86, -80); c.lineTo(86, -80); c.lineTo(8, 10); c.lineTo(8, 62); c.lineTo(46, 80); c.lineTo(-46, 80); c.lineTo(-8, 62); c.lineTo(-8, 10);
    c.closePath(); c.fill();
    c.fillStyle = acc;
    c.beginPath(); c.moveTo(-64, -62); c.lineTo(64, -62); c.lineTo(36, -30); c.lineTo(-36, -30); c.closePath(); c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1;
    c.fillStyle = col;
    circle(c, 56, -88, 16); c.fill();
  },
};

export { WHITE };
