import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
