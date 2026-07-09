/**
 * Orchestrates turning an uploaded file into a searchable document: Docling
 * conversion -> page-tagged chunking -> small/large classification -> (for
 * large docs) chunk embedding. Runs in the background — insertDocument
 * returns a "pending" row immediately, the pipeline flips it to "ready" or
 * "failed" once done, and the frontend polls GET /documents/:id for status.
 *
 * Figure captioning and whole-document summarization are separate ingest
 * steps layered on top of this in later phases; this pipeline is already a
 * complete, independently useful increment (a document becomes searchable by
 * text/table content without them).
 */
import { cleanupConversion, convertDocument } from "./docling.js";
import { chunkDocument, estimateTokens, fullText, pageCount } from "./documentChunker.js";
import { embed } from "./embeddings.js";
import { precomputeSummary } from "./documentSummarize.js";
import { config } from "../config.js";
import {
  type DocumentRecord,
  type SizeClass,
  getDocumentRecord,
  insertChunks,
  insertDocument,
  markDocumentFailed,
  updateDocumentIngestResult,
} from "./documentStore.js";

export interface IngestArgs {
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileStorageFilename: string;
}

/** Inserts a pending document row and kicks off ingestion in the background. Never throws. */
export function ingestDocument(args: IngestArgs): DocumentRecord {
  const record = insertDocument({
    originalName: args.originalName,
    mimeType: args.mimeType,
    size: args.size,
    fileStorageFilename: args.fileStorageFilename,
  });
  void runIngestPipeline(record.id, args.url).catch((err) => {
    markDocumentFailed(record.id, err instanceof Error ? err.message : String(err));
  });
  return record;
}

async function runIngestPipeline(id: string, url: string): Promise<void> {
  try {
    const { doc } = await convertDocument(url, id);

    const chunks = chunkDocument(doc, config.documentChunkTokenBudget);
    const whole = fullText(doc);
    const sizeClass: SizeClass = estimateTokens(whole) <= config.smallDocTokenBudget ? "small" : "large";

    if (sizeClass === "large" && chunks.length > 0) {
      const vectors = await embed(chunks.map((c) => c.text));
      insertChunks(
        id,
        chunks.map((c, i) => ({
          seq: c.seq,
          kind: c.kind,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          text: c.text,
          embedding: vectors[i],
        })),
      );
    } else {
      insertChunks(
        id,
        chunks.map((c) => ({ seq: c.seq, kind: c.kind, pageStart: c.pageStart, pageEnd: c.pageEnd, text: c.text })),
      );
    }

    updateDocumentIngestResult(id, {
      pageCount: pageCount(doc),
      sizeClass,
      fullText: sizeClass === "small" ? whole : null,
      status: "ready",
    });

    const record = getDocumentRecord(id);
    if (record) void precomputeSummary(record);
  } finally {
    await cleanupConversion(id);
  }
}
