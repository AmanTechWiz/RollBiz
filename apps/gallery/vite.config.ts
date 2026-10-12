import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Model inspection site. Serves the repo's reference art at /reference.
export default defineConfig({
  plugins: [react()],
  publicDir: "../../docs/art",
  server: { host: true, port: 5174 },
});
