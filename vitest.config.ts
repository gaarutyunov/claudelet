import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "server/src/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["server/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/types.ts"],
    },
    testTimeout: 10000,
  },
});
