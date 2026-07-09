/**
 * Orchestrates turning an uploaded file into a searchable document: Docling
 * conversion -> page-tagged chunking -> small/large classification -> (for
 * large docs) chunk embedding -> figure image upload. Runs in the
 * background — insertDocument returns a "pending" row immediately, the
 * pipeline flips it to "ready" or "failed" once done, and the frontend polls
 * GET /documents/:id for status.
 *
 * Figure captioning and whole-document summarization both need slow,
 * sequential LLM calls, so — like precomputeSummary — they run as a
 * fire-and-forget background step *after* the document is already "ready"
 * and text-searchable, rather than blocking on them. They're chained
 * sequentially with each other (not fired concurrently): a local Ollama
 * instance serializes requests onto one model/GPU anyway, so two concurrent
 * background jobs each doing their own sequential calls would still queue
 * against each other and risk the same header-timeout failure documented in
 * documentSummarize.ts.
 */
import { cleanupConversion, convertDocument } from "./docling.js";
import { chunkDocument, estimateTokens, fullText, pageCount } from "./documentChunker.js";
import { embed } from "./embeddings.js";
import { precomputeSummary } from "./documentSummarize.js";
import { captionAndIndexFigures, uploadFigures, uploadPageImages } from "./documentFigures.js";
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

/** Sequential, not fired concurrently — see the module comment on why. */
async function runBackgroundEnrichment(id: string, figures: Awaited<ReturnType<typeof uploadFigures>>): Promise<void> {
  if (figures.length > 0) await captionAndIndexFigures(id, figures);
  const record = getDocumentRecord(id);
  if (record) await precomputeSummary(record);
}

async function runIngestPipeline(id: string, url: string): Promise<void> {
  let figures: Awaited<ReturnType<typeof uploadFigures>> = [];
  try {
    const { doc, artifactsDir } = await convertDocument(url, id);

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

    // Must happen before cleanupConversion() below deletes the scratch dir these read from.
    figures = await uploadFigures(doc, artifactsDir, chunks.length);
    if (figures.length > 0) {
      await uploadPageImages(doc, id, figures.map((f) => f.pageNo));
    }

    updateDocumentIngestResult(id, {
      pageCount: pageCount(doc),
      sizeClass,
      fullText: sizeClass === "small" ? whole : null,
      status: "ready",
    });
  } finally {
    await cleanupConversion(id);
  }

  void runBackgroundEnrichment(id, figures);
}
