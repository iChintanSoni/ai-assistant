/**
 * Metadata for every stored file: the verified mimetype (never the client's
 * claim), size, and original name. Lets /files/:filename serve the right
 * Content-Type and lets the agent reconcile+garbage-collect what's still
 * referenced by a saved conversation.
 */
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

export interface FileMeta {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

interface FileRow {
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: number;
}

let db: Database.Database | undefined;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.resolve(process.cwd(), config.dbPath));
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        filename TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);
    `);
  }
  return db;
}

function toFileMeta(row: FileRow): FileMeta {
  return {
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
  };
}

export function insertFile(meta: FileMeta): void {
  getDb()
    .prepare(
      `INSERT INTO files (filename, original_name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(meta.filename, meta.originalName, meta.mimeType, meta.size, meta.createdAt);
}

export function getFile(filename: string): FileMeta | null {
  const row = getDb().prepare(`SELECT * FROM files WHERE filename = ?`).get(filename) as
    | FileRow
    | undefined;
  return row ? toFileMeta(row) : null;
}

export function listFiles(): FileMeta[] {
  const rows = getDb().prepare(`SELECT * FROM files ORDER BY created_at DESC`).all() as FileRow[];
  return rows.map(toFileMeta);
}

/** Returns true if a row existed and was removed. */
export function deleteFile(filename: string): boolean {
  return getDb().prepare(`DELETE FROM files WHERE filename = ?`).run(filename).changes > 0;
}
