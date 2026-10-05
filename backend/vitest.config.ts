import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test-setup.ts"],
    // Backend tests hit a real Postgres database (see src/db) — run them
    // sequentially so they don't race each other over shared rows.
    fileParallelism: false,
  },
});
