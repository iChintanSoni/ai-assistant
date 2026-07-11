import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { getCheckpointer } from "../src/agent/checkpointer.js";
import { config } from "../src/config.js";

test("getCheckpointer creates checkpoints.db under dataDir", () => {
  getCheckpointer();
  expect(existsSync(path.join(config.dataDir, "checkpoints.db"))).toBe(true);
});

test("getCheckpointer caches a single instance across calls", () => {
  const a = getCheckpointer();
  const b = getCheckpointer();
  expect(a).toBe(b);
});
