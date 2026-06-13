import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@dokeza/authz": resolve(repoRoot, "packages/authz/src/index.ts"),
      "@dokeza/config": resolve(repoRoot, "packages/config/src/index.ts"),
      "@dokeza/contracts": resolve(repoRoot, "packages/contracts/src/index.ts"),
      "@dokeza/telemetry": resolve(repoRoot, "packages/telemetry/src/index.ts"),
    },
  },
  test: {
    coverage: {
      reporter: ["text", "html"],
    },
    globals: true,
    include: ["**/*.{test,spec}.ts"],
  },
});
