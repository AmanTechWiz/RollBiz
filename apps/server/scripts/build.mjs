// Bundles the server into dist/index.js.
// Workspace packages (@rollbiz/*) ship raw TypeScript, so they are inlined;
// every other runtime dependency stays external and is loaded from node_modules.
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const root = new URL("..", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith("@rollbiz/"));

await build({
  absWorkingDir: root.pathname,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
  logLevel: "info",
});
