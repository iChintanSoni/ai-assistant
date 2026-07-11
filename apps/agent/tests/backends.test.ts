import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { CompositeBackend } from "deepagents";
import { buildBackend } from "../src/agent/backends.js";
import { config } from "../src/config.js";

test("buildBackend creates the memories directory under dataDir", () => {
  buildBackend();
  expect(existsSync(path.join(config.dataDir, "memories"))).toBe(true);
});

test("buildBackend returns a CompositeBackend mounting /memories/ over the default state backend", () => {
  const backend = buildBackend();
  expect(backend).toBeInstanceOf(CompositeBackend);
});
