import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@raycast/api": "/Users/vojtechstehlik/Documents/Personal/Projects/Raycast/TheDownloader/src/mocks/raycast-api.ts",
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
