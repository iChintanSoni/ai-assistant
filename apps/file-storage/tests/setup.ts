/**
 * Points config.dbPath/storageDir at a fresh temp directory before any
 * module under test imports config.js, so store.ts's SQLite singleton and
 * app.ts's on-disk uploads never touch the real dev database/storage.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "file-storage-test-"));
process.env.DB_PATH = path.join(dir, "file-storage.db");
process.env.STORAGE_DIR = path.join(dir, "storage");

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
