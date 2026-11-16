import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Les tests n'ont jamais besoin de charger de fichiers `.env`.
  envDir: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // En dehors du bundler React, « server-only » lèverait une erreur à l'import.
      "server-only": fileURLToPath(
        new URL("./src/server/testing/empty.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
