import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/support/env.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    // Integration tests share one database; run files sequentially for determinism.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: { provider: "v8", include: ["src/features/**", "src/lib/**", "src/server/**"], reporter: ["text-summary", "html"] },
  },
});
