import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AGENT_URL } from "./config";
import {
  deleteDocument,
  getDocument,
  isDocumentFile,
  isLegacyOfficeFile,
  listDocuments,
  registerDocument,
} from "./documents";
import type { ModelInfo } from "./models";

function model(modalities: ModelInfo["modalities"]): ModelInfo {
  return { name: "m", modalities, tools: true, thinking: false, contextLength: null };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("isLegacyOfficeFile flags old binary Office extensions but not modern ones", () => {
  expect(isLegacyOfficeFile(new File([""], "old.doc"))).toBe(true);
  expect(isLegacyOfficeFile(new File([""], "new.docx"))).toBe(false);
});

test("isDocumentFile recognizes plain document extensions regardless of model", () => {
  expect(isDocumentFile(new File([""], "report.pdf"))).toBe(true);
  expect(isDocumentFile(new File([""], "notes.md"))).toBe(true);
});

test("isDocumentFile routes an image through OCR only when the model can't see images directly", () => {
  const image = new File([""], "photo.png", { type: "image/png" });
  expect(isDocumentFile(image, model(["text"]))).toBe(true);
  expect(isDocumentFile(image, model(["text", "image"]))).toBe(false);
  expect(isDocumentFile(image)).toBe(true); // no model selected -> default to OCR document
});

test("isDocumentFile never routes SVGs through the image-OCR fallback", () => {
  const svg = new File([""], "icon.svg", { type: "image/svg+xml" });
  expect(isDocumentFile(svg, model(["text"]))).toBe(false);
});

test("isDocumentFile rejects anything else", () => {
  expect(isDocumentFile(new File([""], "song.mp3", { type: "audio/mpeg" }))).toBe(false);
});

test("listDocuments/getDocument/registerDocument/deleteDocument call the expected agent endpoints", async () => {
  const fetchMock = vi.mocked(fetch);

  fetchMock.mockResolvedValue(new Response(JSON.stringify({ documents: [] }), { status: 200 }));
  await listDocuments();
  expect(fetchMock).toHaveBeenCalledWith(`${AGENT_URL}/documents`);

  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "d1" }), { status: 200 }));
  await getDocument("d1");
  expect(fetchMock).toHaveBeenCalledWith(`${AGENT_URL}/documents/d1`);

  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "d2" }), { status: 200 }));
  await registerDocument({ url: "u", filename: "f", mimetype: "application/pdf", size: 1 });
  expect(fetchMock).toHaveBeenCalledWith(`${AGENT_URL}/documents`, expect.objectContaining({ method: "POST" }));

  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await deleteDocument("d3");
  expect(fetchMock).toHaveBeenCalledWith(`${AGENT_URL}/documents/d3`, expect.objectContaining({ method: "DELETE" }));
});

test("each documents.ts call throws a descriptive error on a non-ok response", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  await expect(listDocuments()).rejects.toThrow(/HTTP 500/);
});
