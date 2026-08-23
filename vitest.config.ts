import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // First import of an API-route graph can exceed 5s on slow filesystems
    // (WSL /mnt/c); the tests themselves are fast.
    testTimeout: 20000,
  },
});
