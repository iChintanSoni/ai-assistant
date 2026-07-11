import { expect, test } from "vitest";
import {
  deleteChunksForDocument,
  deleteDocumentRecord,
  getChunksForDocument,
  getChunksInPageRange,
  getDocumentRecord,
  getDocumentsByIds,
  insertChunks,
  insertDocument,
  listDocuments,
  listStalePendingDocuments,
  markDocumentFailed,
  searchChunks,
  updateDocumentIngestResult,
  updateDocumentPageImages,
  updateDocumentSummary,
} from "../src/agent/documentStore.js";

function newDoc(originalName = "a.pdf") {
  return insertDocument({ originalName, mimeType: "application/pdf", size: 100, fileStorageFilename: `${originalName}-stored` });
}

test("insertDocument creates a pending row with defaults", () => {
  const doc = newDoc("insert.pdf");
  expect(doc.status).toBe("pending");
  expect(doc.sizeClass).toBe("pending");
  expect(doc.pageCount).toBe(0);
  expect(doc.pageImageUrls).toEqual({});
  expect(doc.summary).toBeNull();
});

test("getDocumentRecord returns null for an unknown id", () => {
  expect(getDocumentRecord("does-not-exist")).toBeNull();
});

test("updateDocumentIngestResult flips a document to ready with the resolved page count/sizeClass/fullText", () => {
  const doc = newDoc("ready.pdf");
  updateDocumentIngestResult(doc.id, { pageCount: 3, sizeClass: "small", fullText: "hello world", status: "ready" });
  const updated = getDocumentRecord(doc.id)!;
  expect(updated.status).toBe("ready");
  expect(updated.pageCount).toBe(3);
  expect(updated.sizeClass).toBe("small");
  expect(updated.fullText).toBe("hello world");
});

test("markDocumentFailed sets status failed with the given error message", () => {
  const doc = newDoc("fail.pdf");
  markDocumentFailed(doc.id, "docling exploded");
  const updated = getDocumentRecord(doc.id)!;
  expect(updated.status).toBe("failed");
  expect(updated.error).toBe("docling exploded");
});

test("updateDocumentPageImages stores a page-number -> url map as JSON, round-tripped back to an object", () => {
  const doc = newDoc("pages.pdf");
  updateDocumentPageImages(doc.id, { "1": "http://files/p1.png", "2": "http://files/p2.png" });
  const updated = getDocumentRecord(doc.id)!;
  expect(updated.pageImageUrls).toEqual({ "1": "http://files/p1.png", "2": "http://files/p2.png" });
});

test("updateDocumentSummary sets summary text + status", () => {
  const doc = newDoc("summary.pdf");
  updateDocumentSummary(doc.id, "A short summary.", "ready");
  const updated = getDocumentRecord(doc.id)!;
  expect(updated.summary).toBe("A short summary.");
  expect(updated.summaryStatus).toBe("ready");
});

test("listDocuments orders by most recently updated first", async () => {
  const first = newDoc("first.pdf");
  await new Promise((r) => setTimeout(r, 5)); // ensure a distinct (later) updated_at, not a tie
  const second = newDoc("second.pdf");
  updateDocumentSummary(second.id, null, "ready"); // re-touches second's updated_at
  const ids = listDocuments().map((d) => d.id);
  expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
});

test("getDocumentsByIds returns [] for an empty id list without querying", () => {
  expect(getDocumentsByIds([])).toEqual([]);
});

test("getDocumentsByIds fetches multiple documents by id, ignoring unknown ids", () => {
  const a = newDoc("multi-a.pdf");
  const b = newDoc("multi-b.pdf");
  const result = getDocumentsByIds([a.id, b.id, "unknown-id"]);
  expect(result.map((d) => d.id).sort()).toEqual([a.id, b.id].sort());
});

test("listStalePendingDocuments returns only pending documents older than the cutoff", async () => {
  const doc = newDoc("stale.pdf");
  await new Promise((r) => setTimeout(r, 5)); // ensure created_at is strictly before an olderThanMs=0 cutoff
  expect(listStalePendingDocuments(0)).toEqual(expect.arrayContaining([expect.objectContaining({ id: doc.id })]));
  expect(listStalePendingDocuments(24 * 60 * 60 * 1000)).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: doc.id })]),
  );
});

test("insertChunks + getChunksForDocument round-trips text/table/figure chunks in seq order", () => {
  const doc = newDoc("chunks.pdf");
  insertChunks(doc.id, [
    { seq: 1, kind: "text", pageStart: 1, pageEnd: 1, text: "first" },
    { seq: 0, kind: "table", pageStart: 1, pageEnd: 1, text: "| a | b |" },
  ]);
  const chunks = getChunksForDocument(doc.id);
  expect(chunks.map((c) => c.seq)).toEqual([0, 1]);
  expect(chunks[0]!.kind).toBe("table");
  expect(chunks[1]!.text).toBe("first");
});

test("insertChunks is a no-op for an empty array", () => {
  const doc = newDoc("empty-chunks.pdf");
  insertChunks(doc.id, []);
  expect(getChunksForDocument(doc.id)).toEqual([]);
});

test("getChunksInPageRange returns only chunks overlapping the requested page range", () => {
  const doc = newDoc("range.pdf");
  insertChunks(doc.id, [
    { seq: 0, kind: "text", pageStart: 1, pageEnd: 1, text: "page one" },
    { seq: 1, kind: "text", pageStart: 2, pageEnd: 3, text: "pages two-three" },
    { seq: 2, kind: "text", pageStart: 4, pageEnd: 4, text: "page four" },
  ]);
  const result = getChunksInPageRange(doc.id, 2, 3);
  expect(result.map((c) => c.text)).toEqual(["pages two-three"]);
});

test("deleteChunksForDocument removes only that document's chunks", () => {
  const a = newDoc("del-a.pdf");
  const b = newDoc("del-b.pdf");
  insertChunks(a.id, [{ seq: 0, kind: "text", pageStart: 1, pageEnd: 1, text: "a" }]);
  insertChunks(b.id, [{ seq: 0, kind: "text", pageStart: 1, pageEnd: 1, text: "b" }]);
  deleteChunksForDocument(a.id);
  expect(getChunksForDocument(a.id)).toEqual([]);
  expect(getChunksForDocument(b.id)).toHaveLength(1);
});

test("deleteDocumentRecord removes the document and its chunks", () => {
  const doc = newDoc("cascade.pdf");
  insertChunks(doc.id, [{ seq: 0, kind: "text", pageStart: 1, pageEnd: 1, text: "gone" }]);
  deleteDocumentRecord(doc.id);
  expect(getDocumentRecord(doc.id)).toBeNull();
  expect(getChunksForDocument(doc.id)).toEqual([]);
});

test("searchChunks returns [] for an empty document id list", () => {
  expect(searchChunks([], [1, 0, 0], 5)).toEqual([]);
});

test("searchChunks ranks embedded chunks by cosine similarity and caps results to k", () => {
  const doc = newDoc("search.pdf");
  insertChunks(doc.id, [
    { seq: 0, kind: "text", pageStart: 1, pageEnd: 1, text: "close match", embedding: [1, 0.9, 0.1] },
    { seq: 1, kind: "text", pageStart: 2, pageEnd: 2, text: "far match", embedding: [-1, -1, 0] },
    { seq: 2, kind: "text", pageStart: 3, pageEnd: 3, text: "no embedding" }, // not embedded, must be excluded
  ]);

  const results = searchChunks([doc.id], [1, 1, 0], 1);

  expect(results).toHaveLength(1);
  expect(results[0]!.text).toBe("close match");
  expect(results[0]!.documentName).toBe("search.pdf");
  expect(results[0]!.score).toBeGreaterThan(0);
});
