import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../src/agent/docling.js", () => ({ convertDocument: vi.fn(), cleanupConversion: vi.fn() }));
vi.mock("../src/agent/documentChunker.js", () => ({
  chunkDocument: vi.fn(),
  estimateTokens: vi.fn(),
  fullText: vi.fn(),
  pageCount: vi.fn(),
}));
vi.mock("../src/agent/embeddings.js", () => ({ embed: vi.fn() }));
vi.mock("../src/agent/documentSummarize.js", () => ({ precomputeSummary: vi.fn() }));
vi.mock("../src/agent/documentFigures.js", () => ({
  captionAndIndexFigures: vi.fn(),
  uploadFigures: vi.fn(),
  uploadPageImages: vi.fn(),
}));
vi.mock("../src/agent/documentStore.js", () => ({
  getDocumentRecord: vi.fn(),
  insertChunks: vi.fn(),
  insertDocument: vi.fn(),
  listStalePendingDocuments: vi.fn(),
  markDocumentFailed: vi.fn(),
  updateDocumentIngestResult: vi.fn(),
}));

import { cleanupConversion, convertDocument } from "../src/agent/docling.js";
import { chunkDocument, estimateTokens, fullText, pageCount } from "../src/agent/documentChunker.js";
import { embed } from "../src/agent/embeddings.js";
import { precomputeSummary } from "../src/agent/documentSummarize.js";
import { captionAndIndexFigures, uploadFigures, uploadPageImages } from "../src/agent/documentFigures.js";
import {
  getDocumentRecord,
  insertChunks,
  insertDocument,
  listStalePendingDocuments,
  markDocumentFailed,
  updateDocumentIngestResult,
} from "../src/agent/documentStore.js";
import { ingestDocument, reconcileStuckDocuments } from "../src/agent/documentIngest.js";
import { config } from "../src/config.js";
import type { DocumentRecord } from "../src/agent/documentStore.js";

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function pendingRecord(id: string): DocumentRecord {
  return {
    id,
    originalName: "a.pdf",
    mimeType: "application/pdf",
    size: 10,
    pageCount: 0,
    sizeClass: "pending",
    fileStorageFilename: "a.pdf",
    fullText: null,
    pageImageUrls: {},
    summary: null,
    summaryStatus: "pending",
    status: "pending",
    error: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  vi.mocked(convertDocument).mockReset();
  vi.mocked(cleanupConversion).mockReset().mockResolvedValue(undefined);
  vi.mocked(chunkDocument).mockReset();
  vi.mocked(estimateTokens).mockReset();
  vi.mocked(fullText).mockReset();
  vi.mocked(pageCount).mockReset();
  vi.mocked(embed).mockReset();
  vi.mocked(precomputeSummary).mockReset().mockResolvedValue(undefined);
  vi.mocked(captionAndIndexFigures).mockReset().mockResolvedValue(undefined);
  vi.mocked(uploadFigures).mockReset().mockResolvedValue([]);
  vi.mocked(uploadPageImages).mockReset().mockResolvedValue({});
  vi.mocked(getDocumentRecord).mockReset();
  vi.mocked(insertChunks).mockReset();
  vi.mocked(insertDocument).mockReset();
  vi.mocked(listStalePendingDocuments).mockReset();
  vi.mocked(markDocumentFailed).mockReset();
  vi.mocked(updateDocumentIngestResult).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("ingestDocument returns the pending record synchronously, before the pipeline runs", () => {
  const record = pendingRecord("doc-sync");
  vi.mocked(insertDocument).mockReturnValue(record);
  vi.mocked(convertDocument).mockReturnValue(new Promise(() => {})); // never resolves

  const result = ingestDocument({ url: "http://files/a.pdf", originalName: "a.pdf", mimeType: "application/pdf", size: 10, fileStorageFilename: "a.pdf" });

  expect(result).toBe(record);
});

test("ingests a small document without embedding its chunks", async () => {
  vi.mocked(insertDocument).mockReturnValue(pendingRecord("doc-small"));
  vi.mocked(convertDocument).mockResolvedValue({ doc: { schema_name: "DoclingDocument" } as never, artifactsDir: "/tmp/scratch" });
  vi.mocked(chunkDocument).mockReturnValue([{ seq: 0, kind: "text", pageStart: 1, pageEnd: 1, text: "hello" }]);
  vi.mocked(fullText).mockReturnValue("hello");
  vi.mocked(estimateTokens).mockReturnValue(1); // well under smallDocTokenBudget
  vi.mocked(pageCount).mockReturnValue(1);
  vi.mocked(getDocumentRecord).mockReturnValue(pendingRecord("doc-small"));

  ingestDocument({ url: "http://files/a.pdf", originalName: "a.pdf", mimeType: "application/pdf", size: 10, fileStorageFilename: "a.pdf" });
  await flushAsync();

  expect(embed).not.toHaveBeenCalled();
  expect(insertChunks).toHaveBeenCalledWith("doc-small", [{ seq: 0, kind: "text", pageStart: 1, pageEnd: 1, text: "hello" }]);
  expect(updateDocumentIngestResult).toHaveBeenCalledWith("doc-small", { pageCount: 1, sizeClass: "small", fullText: "hello", status: "ready" });
  expect(cleanupConversion).toHaveBeenCalledWith("doc-small");
});

test("ingests a large document by embedding each chunk and dropping fullText from the ingest result", async () => {
  vi.mocked(insertDocument).mockReturnValue(pendingRecord("doc-large"));
  vi.mocked(convertDocument).mockResolvedValue({ doc: { schema_name: "DoclingDocument" } as never, artifactsDir: "/tmp/scratch" });
  const chunks = [
    { seq: 0, kind: "text" as const, pageStart: 1, pageEnd: 1, text: "chunk one" },
    { seq: 1, kind: "text" as const, pageStart: 2, pageEnd: 2, text: "chunk two" },
  ];
  vi.mocked(chunkDocument).mockReturnValue(chunks);
  vi.mocked(fullText).mockReturnValue("a".repeat(100000)); // huge -> "large"
  vi.mocked(estimateTokens).mockReturnValue(1_000_000);
  vi.mocked(pageCount).mockReturnValue(2);
  vi.mocked(embed).mockResolvedValue([[1, 0], [0, 1]]);
  vi.mocked(getDocumentRecord).mockReturnValue(pendingRecord("doc-large"));

  ingestDocument({ url: "http://files/b.pdf", originalName: "b.pdf", mimeType: "application/pdf", size: 10, fileStorageFilename: "b.pdf" });
  await flushAsync();

  expect(embed).toHaveBeenCalledWith(["chunk one", "chunk two"]);
  expect(insertChunks).toHaveBeenCalledWith("doc-large", [
    { seq: 0, kind: "text", pageStart: 1, pageEnd: 1, text: "chunk one", embedding: [1, 0] },
    { seq: 1, kind: "text", pageStart: 2, pageEnd: 2, text: "chunk two", embedding: [0, 1] },
  ]);
  expect(updateDocumentIngestResult).toHaveBeenCalledWith("doc-large", { pageCount: 2, sizeClass: "large", fullText: null, status: "ready" });
});

test("uploads figures and page images, then background-enriches (captioning + summary) after the doc is ready", async () => {
  vi.mocked(insertDocument).mockReturnValue(pendingRecord("doc-figs"));
  vi.mocked(convertDocument).mockResolvedValue({ doc: { schema_name: "DoclingDocument" } as never, artifactsDir: "/tmp/scratch" });
  vi.mocked(chunkDocument).mockReturnValue([]);
  vi.mocked(fullText).mockReturnValue("");
  vi.mocked(estimateTokens).mockReturnValue(0);
  vi.mocked(pageCount).mockReturnValue(1);
  const figures = [{ seq: 0, pageNo: 1, figureUrl: "http://files/fig.png" }];
  vi.mocked(uploadFigures).mockResolvedValue(figures);
  const readyRecord = { ...pendingRecord("doc-figs"), status: "ready" as const };
  vi.mocked(getDocumentRecord).mockReturnValue(readyRecord);

  ingestDocument({ url: "http://files/c.pdf", originalName: "c.pdf", mimeType: "application/pdf", size: 10, fileStorageFilename: "c.pdf" });
  await flushAsync();
  await flushAsync();

  expect(uploadFigures).toHaveBeenCalledWith(expect.anything(), "/tmp/scratch", 0);
  expect(uploadPageImages).toHaveBeenCalledWith(expect.anything(), "doc-figs", [1]);
  expect(captionAndIndexFigures).toHaveBeenCalledWith("doc-figs", figures);
  expect(precomputeSummary).toHaveBeenCalledWith(readyRecord);
});

test("skips figure captioning and page-image upload entirely when no figures were extracted", async () => {
  vi.mocked(insertDocument).mockReturnValue(pendingRecord("doc-nofigs"));
  vi.mocked(convertDocument).mockResolvedValue({ doc: { schema_name: "DoclingDocument" } as never, artifactsDir: "/tmp/scratch" });
  vi.mocked(chunkDocument).mockReturnValue([]);
  vi.mocked(fullText).mockReturnValue("");
  vi.mocked(estimateTokens).mockReturnValue(0);
  vi.mocked(pageCount).mockReturnValue(1);
  vi.mocked(getDocumentRecord).mockReturnValue(pendingRecord("doc-nofigs"));

  ingestDocument({ url: "http://files/d.pdf", originalName: "d.pdf", mimeType: "application/pdf", size: 10, fileStorageFilename: "d.pdf" });
  await flushAsync();
  await flushAsync();

  expect(uploadPageImages).not.toHaveBeenCalled();
  expect(captionAndIndexFigures).not.toHaveBeenCalled();
  expect(precomputeSummary).toHaveBeenCalled();
});

test("skips precomputeSummary when the document record has since disappeared", async () => {
  vi.mocked(insertDocument).mockReturnValue(pendingRecord("doc-gone"));
  vi.mocked(convertDocument).mockResolvedValue({ doc: { schema_name: "DoclingDocument" } as never, artifactsDir: "/tmp/scratch" });
  vi.mocked(chunkDocument).mockReturnValue([]);
  vi.mocked(fullText).mockReturnValue("");
  vi.mocked(estimateTokens).mockReturnValue(0);
  vi.mocked(pageCount).mockReturnValue(1);
  vi.mocked(getDocumentRecord).mockReturnValue(null);

  ingestDocument({ url: "http://files/e.pdf", originalName: "e.pdf", mimeType: "application/pdf", size: 10, fileStorageFilename: "e.pdf" });
  await flushAsync();
  await flushAsync();

  expect(precomputeSummary).not.toHaveBeenCalled();
});

test("cleans up the scratch dir and marks the document failed when the pipeline throws mid-way", async () => {
  vi.mocked(insertDocument).mockReturnValue(pendingRecord("doc-fail"));
  vi.mocked(convertDocument).mockResolvedValue({ doc: { schema_name: "DoclingDocument" } as never, artifactsDir: "/tmp/scratch" });
  vi.mocked(chunkDocument).mockImplementation(() => {
    throw new Error("chunking exploded");
  });

  ingestDocument({ url: "http://files/f.pdf", originalName: "f.pdf", mimeType: "application/pdf", size: 10, fileStorageFilename: "f.pdf" });
  await flushAsync();

  expect(cleanupConversion).toHaveBeenCalledWith("doc-fail");
  expect(markDocumentFailed).toHaveBeenCalledWith("doc-fail", "chunking exploded");
});

test("reconcileStuckDocuments marks every stale pending document as failed", () => {
  vi.mocked(listStalePendingDocuments).mockReturnValue([pendingRecord("stale-1"), pendingRecord("stale-2")]);

  reconcileStuckDocuments();

  expect(listStalePendingDocuments).toHaveBeenCalledWith(config.documentIngestTimeoutMs * 2);
  expect(markDocumentFailed).toHaveBeenCalledWith("stale-1", expect.stringMatching(/restarted mid-process/));
  expect(markDocumentFailed).toHaveBeenCalledWith("stale-2", expect.stringMatching(/restarted mid-process/));
});

test("reconcileStuckDocuments does nothing when there are no stale documents", () => {
  vi.mocked(listStalePendingDocuments).mockReturnValue([]);

  reconcileStuckDocuments();

  expect(markDocumentFailed).not.toHaveBeenCalled();
});
