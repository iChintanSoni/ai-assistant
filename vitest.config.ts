import { defineConfig } from "vitest/config";

// Coverage is a workspace-root-level concern in Vitest's `projects` mode: per-project
// `test.coverage` settings in apps/*/vitest.config.ts are only honored when that
// project's config is run standalone (e.g. `cd apps/agent && vitest run --coverage`).
// When orchestrated from here via `projects`, only this root config's coverage
// settings apply, so the authoritative include/exclude/thresholds live here.
export default defineConfig({
  test: {
    projects: ["apps/agent", "apps/file-storage", "apps/frontend"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "apps/agent/src/**/*.ts",
        "apps/file-storage/src/**/*.ts",
        "apps/frontend/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "apps/agent/src/index.ts",
        "apps/agent/src/config.ts",
        "apps/file-storage/src/index.ts",
        "apps/file-storage/src/config.ts",
        "apps/frontend/src/main.tsx",
        "apps/frontend/src/test/**",
        "apps/frontend/src/**/*.test.{ts,tsx}",
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
