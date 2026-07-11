import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@langchain/ollama", () => ({ ChatOllama: vi.fn() }));
vi.mock("../src/agent/documentStore.js", () => ({
  getChunksForDocument: vi.fn(),
  getChunksInPageRange: vi.fn(),
  updateDocumentSummary: vi.fn(),
}));

import { ChatOllama } from "@langchain/ollama";
import { getChunksForDocument, getChunksInPageRange, updateDocumentSummary } from "../src/agent/documentStore.js";
import type { ChunkRecord, DocumentRecord } from "../src/agent/documentStore.js";
import { precomputeSummary, summarizeScoped, summarizeWholeDocument } from "../src/agent/documentSummarize.js";

function mockInvokeSequence(...contents: string[]) {
  const invoke = vi.fn();
  contents.forEach((c) => invoke.mockResolvedValueOnce({ content: c }));
  vi.mocked(ChatOllama).mockImplementation(function () {
    return { invoke } as never;
  } as never);
  return invoke;
}

function chunk(text: string, kind: ChunkRecord["kind"] = "text"): ChunkRecord {
  return { id: "c", documentId: "doc-1", seq: 0, kind, pageStart: 1, pageEnd: 1, text, imageUrl: null };
}

function baseDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc-1",
    originalName: "a.pdf",
    mimeType: "application/pdf",
    size: 1,
    pageCount: 1,
    sizeClass: "small",
    fileStorageFilename: "a.pdf",
    fullText: null,
    pageImageUrls: {},
    summary: null,
    summaryStatus: "pending",
    status: "ready",
    error: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(ChatOllama).mockReset();
  vi.mocked(getChunksForDocument).mockReset();
  vi.mocked(getChunksInPageRange).mockReset();
  vi.mocked(updateDocumentSummary).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("summarizeWholeDocument summarizes a small document's fullText directly, without touching chunks", async () => {
  const invoke = mockInvokeSequence("A crisp summary.");
  const doc = baseDoc({ sizeClass: "small", fullText: "Full document text." });

  const result = await summarizeWholeDocument(doc);

  expect(result).toBe("A crisp summary.");
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(getChunksForDocument).not.toHaveBeenCalled();
});

test("summarizeWholeDocument map-reduces a large document's chunks, excluding figure chunks", async () => {
  mockInvokeSequence("Only summary.");
  vi.mocked(getChunksForDocument).mockReturnValue([chunk("body text"), chunk("a figure caption", "figure")]);
  const doc = baseDoc({ sizeClass: "large", fullText: null });

  const result = await summarizeWholeDocument(doc);

  expect(result).toBe("Only summary.");
  const [docId] = vi.mocked(getChunksForDocument).mock.calls[0]!;
  expect(docId).toBe("doc-1");
});

test("summarizeWholeDocument returns a fixed message when there are no chunks to summarize", async () => {
  vi.mocked(getChunksForDocument).mockReturnValue([]);
  const doc = baseDoc({ sizeClass: "large" });

  const result = await summarizeWholeDocument(doc);

  expect(result).toMatch(/no extractable text to summarize/);
  expect(ChatOllama).not.toHaveBeenCalled();
});

test("summarizeScoped map-reduces chunks from the requested page range only", async () => {
  const invoke = mockInvokeSequence("Scoped summary.");
  vi.mocked(getChunksInPageRange).mockReturnValue([chunk("chapter text")]);
  const doc = baseDoc();

  const result = await summarizeScoped(doc, 2, 5);

  expect(result).toBe("Scoped summary.");
  expect(getChunksInPageRange).toHaveBeenCalledWith("doc-1", 2, 5);
  expect(invoke).toHaveBeenCalledTimes(1);
});

test("summarizeWholeDocument combines multiple map-phase summaries with a final reduce call", async () => {
  // Two chunks whose combined size forces two separate map batches (MAP_TOKEN_BUDGET
  // is 1500 tokens, ~6000 chars); each batch's own summary is short, so the reduce
  // loop doesn't recurse, but with more than one partial summary a final combine runs.
  const invoke = mockInvokeSequence("Summary A.", "Summary B.", "Combined summary.");
  vi.mocked(getChunksForDocument).mockReturnValue([chunk("x".repeat(4000)), chunk("y".repeat(4000))]);
  const doc = baseDoc({ sizeClass: "large" });

  const result = await summarizeWholeDocument(doc);

  expect(result).toBe("Combined summary.");
  expect(invoke).toHaveBeenCalledTimes(3);
});

test("precomputeSummary stores the summary and marks it ready on success", async () => {
  mockInvokeSequence("Final summary.");
  const doc = baseDoc({ sizeClass: "small", fullText: "text" });

  await precomputeSummary(doc);

  expect(updateDocumentSummary).toHaveBeenCalledWith("doc-1", "Final summary.", "ready");
});

test("precomputeSummary stores a null summary and marks it failed when summarization throws", async () => {
  vi.mocked(ChatOllama).mockImplementation(function () {
    return { invoke: vi.fn().mockRejectedValue(new Error("ollama down")) } as never;
  } as never);
  const doc = baseDoc({ sizeClass: "small", fullText: "text" });

  await precomputeSummary(doc);

  expect(updateDocumentSummary).toHaveBeenCalledWith("doc-1", null, "failed");
});
