import * as path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    env: {
      DEBUG: "testcontainers*",
    },
    testTimeout: 180000,
    coverage: {
      provider: 'v8'
    },
    silent: "passed-only",
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true
  },
});