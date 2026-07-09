/**
 * Persistent document library: metadata + chunks for uploaded documents.
 * Separate SQLite db from history.db/checkpoints.db, same shape as historyStore.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { cosineSimilarity, fromEmbeddingBlob, toEmbeddingBlob } from "./embeddings.js";

export type DocumentStatus = "pending" | "ready" | "failed";
export type SummaryStatus = "pending" | "ready" | "failed";
export type SizeClass = "pending" | "small" | "large";
export type ChunkKind = "text" | "table" | "figure";

export interface DocumentRecord {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  pageCount: number;
  sizeClass: SizeClass;
  fileStorageFilename: string;
  fullText: string | null;
  summary: string | null;
  summaryStatus: SummaryStatus;
  status: DocumentStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewChunk {
  seq: number;
  kind: ChunkKind;
  pageStart: number;
  pageEnd: number;
  text: string;
  imageUrl?: string;
  embedding?: number[];
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  seq: number;
  kind: ChunkKind;
  pageStart: number;
  pageEnd: number;
  text: string;
  imageUrl: string | null;
}

export interface SearchResult extends ChunkRecord {
  documentName: string;
  score: number;
}

interface DocumentRow {
  id: string;
  original_name: string;
  mime_type: string;
  size: number;
  page_count: number;
  size_class: SizeClass;
  file_storage_filename: string;
  full_text: string | null;
  summary: string | null;
  summary_status: SummaryStatus;
  status: DocumentStatus;
  error: string | null;
  created_at: number;
  updated_at: number;
}

interface ChunkRow {
  id: string;
  document_id: string;
  seq: number;
  kind: ChunkKind;
  page_start: number;
  page_end: number;
  text: string;
  image_url: string | null;
  embedding: Buffer | null;
}

let db: Database.Database | undefined;

function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    db = new Database(path.join(config.dataDir, "documents.db"));
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        page_count INTEGER NOT NULL DEFAULT 0,
        size_class TEXT NOT NULL DEFAULT 'pending',
        file_storage_filename TEXT NOT NULL,
        full_text TEXT,
        summary TEXT,
        summary_status TEXT NOT NULL DEFAULT 'pending',
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id),
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        page_start INTEGER NOT NULL,
        page_end INTEGER NOT NULL,
        text TEXT NOT NULL,
        image_url TEXT,
        embedding BLOB,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id, seq);
    `);
  }
  return db;
}

function toDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    pageCount: row.page_count,
    sizeClass: row.size_class,
    fileStorageFilename: row.file_storage_filename,
    fullText: row.full_text,
    summary: row.summary,
    summaryStatus: row.summary_status,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toChunk(row: ChunkRow): ChunkRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    seq: row.seq,
    kind: row.kind,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    text: row.text,
    imageUrl: row.image_url,
  };
}

export function insertDocument(args: {
  originalName: string;
  mimeType: string;
  size: number;
  fileStorageFilename: string;
}): DocumentRecord {
  const now = Date.now();
  const row: DocumentRow = {
    id: randomUUID(),
    original_name: args.originalName,
    mime_type: args.mimeType,
    size: args.size,
    page_count: 0,
    size_class: "pending",
    file_storage_filename: args.fileStorageFilename,
    full_text: null,
    summary: null,
    summary_status: "pending",
    status: "pending",
    error: null,
    created_at: now,
    updated_at: now,
  };
  getDb()
    .prepare(
      `INSERT INTO documents (id, original_name, mime_type, size, page_count, size_class,
         file_storage_filename, full_text, summary, summary_status, status, error, created_at, updated_at)
       VALUES (@id, @original_name, @mime_type, @size, @page_count, @size_class,
         @file_storage_filename, @full_text, @summary, @summary_status, @status, @error, @created_at, @updated_at)`,
    )
    .run(row);
  return toDocument(row);
}

export function updateDocumentIngestResult(
  id: string,
  patch: { pageCount: number; sizeClass: SizeClass; fullText: string | null; status: DocumentStatus; error?: string | null },
): void {
  getDb()
    .prepare(
      `UPDATE documents SET page_count = ?, size_class = ?, full_text = ?, status = ?, error = ?, updated_at = ? WHERE id = ?`,
    )
    .run(patch.pageCount, patch.sizeClass, patch.fullText, patch.status, patch.error ?? null, Date.now(), id);
}

export function updateDocumentSummary(id: string, summary: string | null, status: SummaryStatus): void {
  getDb()
    .prepare(`UPDATE documents SET summary = ?, summary_status = ?, updated_at = ? WHERE id = ?`)
    .run(summary, status, Date.now(), id);
}

export function markDocumentFailed(id: string, error: string): void {
  getDb().prepare(`UPDATE documents SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`).run(error, Date.now(), id);
}

export function listDocuments(): DocumentRecord[] {
  const rows = getDb().prepare(`SELECT * FROM documents ORDER BY updated_at DESC`).all() as DocumentRow[];
  return rows.map(toDocument);
}

export function getDocumentRecord(id: string): DocumentRecord | null {
  const row = getDb().prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as DocumentRow | undefined;
  return row ? toDocument(row) : null;
}

export function getDocumentsByIds(ids: string[]): DocumentRecord[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT * FROM documents WHERE id IN (${placeholders})`)
    .all(...ids) as DocumentRow[];
  return rows.map(toDocument);
}

export function deleteDocumentRecord(id: string): void {
  const database = getDb();
  database.prepare(`DELETE FROM chunks WHERE document_id = ?`).run(id);
  database.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
}

export function insertChunks(documentId: string, chunks: NewChunk[]): void {
  if (chunks.length === 0) return;
  const database = getDb();
  const insert = database.prepare(
    `INSERT INTO chunks (id, document_id, seq, kind, page_start, page_end, text, image_url, embedding, created_at)
     VALUES (@id, @document_id, @seq, @kind, @page_start, @page_end, @text, @image_url, @embedding, @created_at)`,
  );
  const now = Date.now();
  const tx = database.transaction((items: NewChunk[]) => {
    for (const c of items) {
      insert.run({
        id: randomUUID(),
        document_id: documentId,
        seq: c.seq,
        kind: c.kind,
        page_start: c.pageStart,
        page_end: c.pageEnd,
        text: c.text,
        image_url: c.imageUrl ?? null,
        embedding: c.embedding ? toEmbeddingBlob(c.embedding) : null,
        created_at: now,
      });
    }
  });
  tx(chunks);
}

export function getChunksForDocument(documentId: string): ChunkRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM chunks WHERE document_id = ? ORDER BY seq ASC`)
    .all(documentId) as ChunkRow[];
  return rows.map(toChunk);
}

export function getChunksInPageRange(documentId: string, pageStart: number, pageEnd: number): ChunkRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM chunks WHERE document_id = ? AND page_end >= ? AND page_start <= ? ORDER BY seq ASC`,
    )
    .all(documentId, pageStart, pageEnd) as ChunkRow[];
  return rows.map(toChunk);
}

/** Brute-force cosine similarity search across the given documents' embedded chunks. */
export function searchChunks(documentIds: string[], queryEmbedding: number[], k: number): SearchResult[] {
  if (documentIds.length === 0) return [];
  const placeholders = documentIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT c.*, d.original_name as document_name FROM chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.document_id IN (${placeholders}) AND c.embedding IS NOT NULL`,
    )
    .all(...documentIds) as (ChunkRow & { document_name: string })[];

  const query = new Float32Array(queryEmbedding);
  const scored = rows.map((row) => ({
    ...toChunk(row),
    documentName: row.document_name,
    score: cosineSimilarity(query, fromEmbeddingBlob(row.embedding!)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export function deleteChunksForDocument(documentId: string): void {
  getDb().prepare(`DELETE FROM chunks WHERE document_id = ?`).run(documentId);
}
