import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@dokeza/contracts": resolve(repoRoot, "packages/contracts/src/index.ts")
    }
  },
  server: {
    port: 1420,
    strictPort: true
  }
});
