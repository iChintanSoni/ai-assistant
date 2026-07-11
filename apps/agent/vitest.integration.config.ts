import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts on purpose: these tests need a real local Ollama
// (and, for docling, a real Docling CLI) and are never part of the default `npm test`
// run or CI. Run explicitly with `npm run test:integration` after RUN_INTEGRATION=1.
export default defineConfig({
  test: {
    name: "agent-integration",
    environment: "node",
    include: ["tests/integration/**/*.integration.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 60000,
  },
});
