// Screenshots one model from the running gallery so it can be compared with the reference art.
// Usage: bun run shot <model-id> [front|side|back|top] [out.png]
// Needs the gallery dev server running (bun run dev, port 5174).
import { chromium } from "playwright";

const [id, angle = "front", out = `shots/${id}-${angle}.png`] = process.argv.slice(2);
if (!id) {
  console.error("usage: bun run shot <model-id> [front|side|back|top] [out.png]");
  process.exit(2);
}

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (err) => console.error("page error:", err.message));
await page.goto(`http://localhost:5174/?model=${encodeURIComponent(id)}&shot=1&angle=${angle}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30_000 });
await page.screenshot({ path: out });
await browser.close();
console.log(out);
