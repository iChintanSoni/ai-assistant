/**
 * Unified index of every file that shows up in the Files gallery: uploaded
 * documents, plain message attachments, and AI-generated images. Built as a
 * side effect of the existing conversation/document write paths (see
 * server/app.ts) rather than by regexing transcript JSON like fileCleanup.ts
 * does for its GC sweep — this is what lets the Files page query/sort/filter
 * instead of scanning everything on every request.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { listDocuments } from "./documentStore.js";

export type AttachmentKind = "document" | "attachment" | "generated-image";

export interface AttachmentRecord {
  id: string;
  fileStorageFilename: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  documentId: string | null;
  conversationId: string | null;
  createdAt: number;
}

export interface NewAttachment {
  fileStorageFilename: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  documentId?: string | null;
  conversationId?: string | null;
  createdAt?: number;
}

interface AttachmentRow {
  id: string;
  file_storage_filename: string;
  url: string;
  original_name: string;
  mime_type: string;
  size: number;
  kind: AttachmentKind;
  document_id: string | null;
  conversation_id: string | null;
  created_at: number;
}

let db: Database.Database | undefined;

function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    db = new Database(path.join(config.dataDir, "attachments.db"));
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        file_storage_filename TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        kind TEXT NOT NULL,
        document_id TEXT,
        conversation_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_kind ON attachments(kind);
      CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at DESC);
    `);
  }
  return db;
}

function toRecord(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    fileStorageFilename: row.file_storage_filename,
    url: row.url,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    kind: row.kind,
    documentId: row.document_id,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
  };
}

/** Idempotent: a re-save of the same conversation/document must not duplicate rows. */
export function upsertAttachment(meta: NewAttachment): void {
  getDb()
    .prepare(
      `INSERT INTO attachments
         (id, file_storage_filename, url, original_name, mime_type, size, kind, document_id, conversation_id, created_at)
       VALUES (@id, @file_storage_filename, @url, @original_name, @mime_type, @size, @kind, @document_id, @conversation_id, @created_at)
       ON CONFLICT(file_storage_filename) DO NOTHING`,
    )
    .run({
      id: randomUUID(),
      file_storage_filename: meta.fileStorageFilename,
      url: meta.url,
      original_name: meta.originalName,
      mime_type: meta.mimeType,
      size: meta.size,
      kind: meta.kind,
      document_id: meta.documentId ?? null,
      conversation_id: meta.conversationId ?? null,
      created_at: meta.createdAt ?? Date.now(),
    });
}

export function listAttachments(): AttachmentRecord[] {
  const rows = getDb().prepare(`SELECT * FROM attachments ORDER BY created_at DESC`).all() as AttachmentRow[];
  return rows.map(toRecord);
}

export function getAttachment(id: string): AttachmentRecord | null {
  const row = getDb().prepare(`SELECT * FROM attachments WHERE id = ?`).get(id) as AttachmentRow | undefined;
  return row ? toRecord(row) : null;
}

export function deleteAttachment(id: string): void {
  getDb().prepare(`DELETE FROM attachments WHERE id = ?`).run(id);
}

export function deleteAttachmentsForConversation(conversationId: string): void {
  getDb().prepare(`DELETE FROM attachments WHERE conversation_id = ?`).run(conversationId);
}

export function deleteAttachmentForDocument(documentId: string): void {
  getDb().prepare(`DELETE FROM attachments WHERE document_id = ?`).run(documentId);
}

/** Minimal shapes this module needs from the frontend's richer UITurn/UIAttachment/UIToolCall. */
interface TurnAttachment {
  name: string;
  url?: string;
  mimeType?: string;
  size?: number;
}

interface TurnTool {
  name?: string;
  status?: string;
  output?: unknown;
}

interface SyncableTurn {
  role: "user" | "agent";
  attachments?: (TurnAttachment | string)[];
  tools?: TurnTool[];
}

function filenameFromUrl(url: string): string {
  return url.split("/").pop() ?? url;
}

/** Parses the `generate_image` tool's `JSON.stringify({ url, prompt })` output. */
function parseGeneratedImage(output: unknown): { url: string; prompt: string } | null {
  const raw = typeof output === "string" ? output : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { url?: unknown; prompt?: unknown };
    if (typeof parsed.url !== "string") return null;
    return { url: parsed.url, prompt: typeof parsed.prompt === "string" ? parsed.prompt : "Generated image" };
  } catch {
    return null;
  }
}

/**
 * Called after a conversation is saved (see PUT /conversations/:id): indexes
 * every attachment upload and generated image found in its turns. Idempotent
 * via upsertAttachment's ON CONFLICT DO NOTHING, so re-saving as a chat grows
 * never duplicates rows.
 */
export function syncFromTurns(conversationId: string, turns: SyncableTurn[]): void {
  const now = Date.now();
  for (const turn of turns) {
    if (turn.role === "user") {
      for (const raw of turn.attachments ?? []) {
        if (typeof raw === "string" || !raw.url || !raw.mimeType) continue; // legacy/URL-less entries: nothing to index
        upsertAttachment({
          fileStorageFilename: filenameFromUrl(raw.url),
          url: raw.url,
          originalName: raw.name,
          mimeType: raw.mimeType,
          size: raw.size ?? 0,
          kind: "attachment",
          conversationId,
          createdAt: now,
        });
      }
    } else {
      for (const tool of turn.tools ?? []) {
        if (tool.name !== "generate_image" || tool.status !== "completed") continue;
        const generated = parseGeneratedImage(tool.output);
        if (!generated) continue;
        upsertAttachment({
          fileStorageFilename: filenameFromUrl(generated.url),
          url: generated.url,
          originalName: `${generated.prompt.slice(0, 60)}.png`,
          mimeType: "image/png",
          size: 0,
          kind: "generated-image",
          conversationId,
          createdAt: now,
        });
      }
    }
  }
}

/**
 * One-time catch-up for documents created before this index existed. Safe to
 * call on every startup — documents have real delete semantics (a deleted
 * document's row is gone from documentStore, not just orphaned), so re-syncing
 * from listDocuments() is idempotent and can never resurrect a deleted one.
 *
 * Deliberately does NOT do the equivalent for plain attachments/generated
 * images by re-scanning old conversation transcripts: unlike a document
 * delete, deleting a single attachment leaves its stale URL sitting in the
 * conversation's already-saved transcript JSON on purpose (that's what lets
 * the transcript show a "file removed" placeholder instead of losing the
 * turn). Re-deriving from transcripts on every startup would treat that
 * stale URL as "new" and re-insert the row we just deleted. Attachments from
 * conversations that predate this feature simply won't appear in the Files
 * gallery until that conversation sees new activity (which re-syncs it via
 * the normal PUT /conversations/:id path) — a one-time gap, not a bug.
 */
export function backfillAttachmentsIndex(): void {
  for (const doc of listDocuments()) {
    upsertAttachment({
      fileStorageFilename: doc.fileStorageFilename,
      url: `${config.fileStorageBaseUrl}/files/${doc.fileStorageFilename}`,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.size,
      kind: "document",
      documentId: doc.id,
      conversationId: null,
      createdAt: doc.createdAt,
    });
  }
}
