import path from "node:path";
import { defineConfig } from "vitest/config";

// Pure domain/state/logic tests run under the fast Node environment; component
// render-profiling tests (.test.tsx) declare `@vitest-environment jsdom` in a
// docblock at the top of the file to opt into a DOM individually.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  // Next's SWC compiler normally handles JSX; vitest runs independently of
  // that pipeline, so .tsx test files need their own JSX transform here.
  esbuild: {
    jsx: "automatic",
  },
});
