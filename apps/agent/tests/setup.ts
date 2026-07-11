/**
 * Points config.dataDir at a fresh temp directory before any module under
 * test imports config.js, so every SQLite-backed store in this test file
 * gets an isolated, disposable database instead of touching ./data.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "agent-test-"));
process.env.DATA_DIR = dir;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
