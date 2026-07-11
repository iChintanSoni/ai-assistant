import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@langchain/ollama", () => ({ ChatOllama: vi.fn() }));
vi.mock("../src/agent/embeddings.js", () => ({ embedOne: vi.fn() }));
vi.mock("../src/agent/documentStore.js", () => ({
  insertChunks: vi.fn(),
  updateDocumentPageImages: vi.fn(),
}));

import { ChatOllama } from "@langchain/ollama";
import { embedOne } from "../src/agent/embeddings.js";
import { insertChunks, updateDocumentPageImages } from "../src/agent/documentStore.js";
import { captionAndIndexFigures, uploadFigures, uploadPageImages } from "../src/agent/documentFigures.js";
import type { DoclingDocument } from "../src/agent/docling.js";

let artifactsDir: string;

beforeEach(() => {
  artifactsDir = mkdtempSync(path.join(tmpdir(), "figures-test-"));
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(embedOne).mockReset();
  vi.mocked(insertChunks).mockReset();
  vi.mocked(updateDocumentPageImages).mockReset();
  vi.mocked(ChatOllama).mockReset();
});

afterEach(() => {
  rmSync(artifactsDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function baseDoc(overrides: Partial<DoclingDocument> = {}): DoclingDocument {
  return {
    schema_name: "DoclingDocument",
    texts: [],
    tables: [],
    pictures: [],
    groups: [],
    body: { self_ref: "#/body", children: [] },
    pages: {},
    ...overrides,
  };
}

test("uploadFigures uploads each picture's extracted PNG, assigning sequential seq numbers from startSeq", async () => {
  writeFileSync(path.join(artifactsDir, "fig-a.png"), Buffer.from([1]));
  writeFileSync(path.join(artifactsDir, "fig-b.png"), Buffer.from([2]));
  vi.mocked(fetch).mockImplementation(
    async () => new Response(JSON.stringify({ url: "http://files/uploaded.png" }), { status: 200 }),
  );

  const doc = baseDoc({
    pictures: [
      { self_ref: "#/pictures/0", label: "picture", prov: [{ page_no: 1 }], image: { mimetype: "image/png", uri: "fig-a.png" }, captions: [] },
      { self_ref: "#/pictures/1", label: "picture", prov: [{ page_no: 2 }], image: { mimetype: "image/png", uri: "fig-b.png" }, captions: [] },
    ],
  });

  const uploaded = await uploadFigures(doc, artifactsDir, 5);

  expect(uploaded).toEqual([
    { seq: 5, pageNo: 1, figureUrl: "http://files/uploaded.png" },
    { seq: 6, pageNo: 2, figureUrl: "http://files/uploaded.png" },
  ]);
});

test("uploadFigures skips pictures without an image.uri and ones whose file can't be read", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ url: "http://files/x.png" }), { status: 200 }));
  const doc = baseDoc({
    pictures: [
      { self_ref: "#/pictures/0", label: "picture", prov: [{ page_no: 1 }], captions: [] },
      { self_ref: "#/pictures/1", label: "picture", prov: [{ page_no: 1 }], image: { mimetype: "image/png", uri: "missing.png" }, captions: [] },
    ],
  });

  const uploaded = await uploadFigures(doc, artifactsDir, 0);

  expect(uploaded).toEqual([]);
});

test("uploadFigures defaults to page 1 when a picture has no provenance", async () => {
  writeFileSync(path.join(artifactsDir, "fig-c.png"), Buffer.from([1]));
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ url: "http://files/c.png" }), { status: 200 }));
  const doc = baseDoc({
    pictures: [{ self_ref: "#/pictures/0", label: "picture", prov: [], image: { mimetype: "image/png", uri: "fig-c.png" }, captions: [] }],
  });

  const [uploaded] = await uploadFigures(doc, artifactsDir, 0);

  expect(uploaded!.pageNo).toBe(1);
});

test("uploadFigures silently skips a figure when the file-storage upload itself fails", async () => {
  writeFileSync(path.join(artifactsDir, "fig-d.png"), Buffer.from([1]));
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  const doc = baseDoc({
    pictures: [{ self_ref: "#/pictures/0", label: "picture", prov: [{ page_no: 1 }], image: { mimetype: "image/png", uri: "fig-d.png" }, captions: [] }],
  });

  await expect(uploadFigures(doc, artifactsDir, 0)).resolves.toEqual([]);
});

test("uploadPageImages uploads only pages with an inline data: image, skipping others, and dedupes page numbers", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ url: "http://files/page.png" }), { status: 200 }));
  const doc = baseDoc({
    pages: {
      "1": { size: { width: 1, height: 1 }, image: { mimetype: "image/png", uri: `data:image/png;base64,${Buffer.from([1]).toString("base64")}` } },
      "2": { size: { width: 1, height: 1 } },
      "3": { size: { width: 1, height: 1 }, image: { mimetype: "image/png", uri: "not-a-data-uri.png" } },
    },
  });

  const result = await uploadPageImages(doc, "doc-1", [1, 1, 2, 3]);

  expect(result).toEqual({ "1": "http://files/page.png" });
  expect(updateDocumentPageImages).toHaveBeenCalledWith("doc-1", { "1": "http://files/page.png" });
  const uploadCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/upload"));
  expect(uploadCalls).toHaveLength(1); // page 1 requested twice, uploaded once
});

test("uploadPageImages still records an (empty) page-image map when every page is skipped", async () => {
  const doc = baseDoc({ pages: { "1": { size: { width: 1, height: 1 } } } });

  const result = await uploadPageImages(doc, "doc-2", [1]);

  expect(result).toEqual({});
  expect(updateDocumentPageImages).toHaveBeenCalledWith("doc-2", {});
});

test("captionAndIndexFigures captions, embeds, and indexes each figure as a searchable chunk", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }));
  vi.mocked(ChatOllama).mockImplementation(function () {
    return { invoke: vi.fn().mockResolvedValue({ content: "A caption." }) } as never;
  } as never);
  vi.mocked(embedOne).mockResolvedValue([0.1, 0.2]);

  await captionAndIndexFigures("doc-1", [{ seq: 3, pageNo: 2, figureUrl: "http://files/fig.png" }]);

  expect(insertChunks).toHaveBeenCalledWith("doc-1", [
    { seq: 3, kind: "figure", pageStart: 2, pageEnd: 2, text: "A caption.", imageUrl: "http://files/fig.png", embedding: [0.1, 0.2] },
  ]);
});

test("captionAndIndexFigures skips a figure that fails to caption without throwing or indexing it", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

  await expect(
    captionAndIndexFigures("doc-1", [{ seq: 0, pageNo: 1, figureUrl: "http://files/missing.png" }]),
  ).resolves.toBeUndefined();
  expect(insertChunks).not.toHaveBeenCalled();
});
