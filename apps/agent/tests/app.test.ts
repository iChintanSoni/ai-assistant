import { afterEach, beforeEach, expect, test, vi } from "vitest";
import request from "supertest";

vi.mock("../src/agent/models.js", () => ({
  listModels: vi.fn(),
  listAllModels: vi.fn(),
  getDefaultModel: vi.fn(() => "default-model"),
  setDefaultModel: vi.fn(),
  getImageGenModel: vi.fn(() => "image-gen-model"),
  setImageGenModel: vi.fn(),
  getEmbeddingModel: vi.fn(() => "embedding-model"),
  setEmbeddingModel: vi.fn(),
  pullModel: vi.fn(),
  deleteModel: vi.fn(),
}));
vi.mock("../src/agent/historyStore.js", () => ({
  deleteConversation: vi.fn(),
  getConversation: vi.fn(),
  getConversationTitlesByIds: vi.fn(() => new Map()),
  listConversations: vi.fn(),
  listConversationsReferencingDocument: vi.fn(() => []),
  upsertConversation: vi.fn(),
}));
vi.mock("../src/agent/fileCleanup.js", () => ({ deleteConversationFiles: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/agent/documentIngest.js", () => ({ ingestDocument: vi.fn() }));
vi.mock("../src/agent/documentStore.js", () => ({
  deleteDocumentRecord: vi.fn(),
  getChunksForDocument: vi.fn(() => []),
  getDocumentRecord: vi.fn(),
  getDocumentsByIds: vi.fn(() => []),
  listDocuments: vi.fn(),
}));
vi.mock("../src/agent/attachmentsStore.js", () => ({
  deleteAttachment: vi.fn(),
  deleteAttachmentForDocument: vi.fn(),
  deleteAttachmentsForConversation: vi.fn(),
  getAttachment: vi.fn(),
  listAttachments: vi.fn(() => []),
  syncFromTurns: vi.fn(),
  upsertAttachment: vi.fn(),
}));

import {
  deleteModel,
  getDefaultModel,
  getEmbeddingModel,
  getImageGenModel,
  listAllModels,
  listModels,
  pullModel,
  setDefaultModel,
  setEmbeddingModel,
  setImageGenModel,
} from "../src/agent/models.js";
import {
  deleteConversation,
  getConversation,
  listConversations,
  upsertConversation,
} from "../src/agent/historyStore.js";
import { deleteConversationFiles } from "../src/agent/fileCleanup.js";
import { ingestDocument } from "../src/agent/documentIngest.js";
import { deleteDocumentRecord, getChunksForDocument, getDocumentRecord, listDocuments } from "../src/agent/documentStore.js";
import {
  deleteAttachment,
  deleteAttachmentForDocument,
  getAttachment,
  listAttachments,
  syncFromTurns,
  upsertAttachment,
} from "../src/agent/attachmentsStore.js";
import { buildApp } from "../src/server/app.js";
import { config } from "../src/config.js";

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const app = buildApp();

beforeEach(() => {
  vi.mocked(listModels).mockReset();
  vi.mocked(listAllModels).mockReset();
  vi.mocked(getDefaultModel).mockReset().mockReturnValue("default-model");
  vi.mocked(setDefaultModel).mockReset();
  vi.mocked(getImageGenModel).mockReset().mockReturnValue("image-gen-model");
  vi.mocked(setImageGenModel).mockReset();
  vi.mocked(getEmbeddingModel).mockReset().mockReturnValue("embedding-model");
  vi.mocked(setEmbeddingModel).mockReset();
  vi.mocked(pullModel).mockReset();
  vi.mocked(deleteModel).mockReset();
  vi.mocked(listConversations).mockReset().mockReturnValue([]);
  vi.mocked(getConversation).mockReset();
  vi.mocked(upsertConversation).mockReset();
  vi.mocked(deleteConversation).mockReset();
  vi.mocked(deleteConversationFiles).mockReset().mockResolvedValue(undefined);
  vi.mocked(ingestDocument).mockReset();
  vi.mocked(listDocuments).mockReset().mockReturnValue([]);
  vi.mocked(getDocumentRecord).mockReset();
  vi.mocked(getChunksForDocument).mockReset().mockReturnValue([]);
  vi.mocked(deleteDocumentRecord).mockReset();
  vi.mocked(listAttachments).mockReset().mockReturnValue([]);
  vi.mocked(getAttachment).mockReset();
  vi.mocked(deleteAttachment).mockReset();
  vi.mocked(deleteAttachmentForDocument).mockReset();
  vi.mocked(syncFromTurns).mockReset();
  vi.mocked(upsertAttachment).mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- /models -----------------------------------------------------------------

test("GET /models returns the model list + default model on success", async () => {
  vi.mocked(listModels).mockResolvedValue([{ name: "m1", modalities: ["text"], tools: true, thinking: false, contextLength: null }]);
  const res = await request(app).get("/models");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ models: [{ name: "m1", modalities: ["text"], tools: true, thinking: false, contextLength: null }], defaultModel: "default-model" });
});

test("GET /models returns 502 when Ollama can't be reached", async () => {
  vi.mocked(listModels).mockRejectedValue(new Error("ECONNREFUSED"));
  const res = await request(app).get("/models");
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Could not reach Ollama/);
});

// --- /ollama/models, /ollama/default-model, /ollama/pull, /ollama/models/:name --

test("GET /ollama/models returns every local model + default model on success", async () => {
  const summary = {
    name: "m1",
    size: 123,
    modifiedAt: null,
    family: null,
    parameterSize: null,
    quantizationLevel: null,
    capabilities: ["completion"],
    contextLength: null,
  };
  vi.mocked(listAllModels).mockResolvedValue([summary]);
  const res = await request(app).get("/ollama/models");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    models: [summary],
    defaultModel: "default-model",
    imageGenModel: "image-gen-model",
    embeddingModel: "embedding-model",
  });
});

test("GET /ollama/models returns 502 when Ollama can't be reached", async () => {
  vi.mocked(listAllModels).mockRejectedValue(new Error("ECONNREFUSED"));
  const res = await request(app).get("/ollama/models");
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Could not reach Ollama/);
});

test("PUT /ollama/default-model sets the default and returns 204", async () => {
  vi.mocked(setDefaultModel).mockResolvedValue(undefined);
  const res = await request(app).put("/ollama/default-model").send({ model: "m1" });
  expect(res.status).toBe(204);
  expect(setDefaultModel).toHaveBeenCalledWith("m1");
});

test("PUT /ollama/default-model returns 400 for a missing model field", async () => {
  const res = await request(app).put("/ollama/default-model").send({});
  expect(res.status).toBe(400);
  expect(setDefaultModel).not.toHaveBeenCalled();
});

test("PUT /ollama/default-model returns 404 when the model isn't installed", async () => {
  vi.mocked(setDefaultModel).mockRejectedValue(new Error("not installed"));
  const res = await request(app).put("/ollama/default-model").send({ model: "missing" });
  expect(res.status).toBe(404);
  expect(res.body.error).toBe("not installed");
});

test("PUT /ollama/image-gen-model sets the image-gen default and returns 204", async () => {
  vi.mocked(setImageGenModel).mockResolvedValue(undefined);
  const res = await request(app).put("/ollama/image-gen-model").send({ model: "m1" });
  expect(res.status).toBe(204);
  expect(setImageGenModel).toHaveBeenCalledWith("m1");
});

test("PUT /ollama/image-gen-model returns 400 for a missing model field", async () => {
  const res = await request(app).put("/ollama/image-gen-model").send({});
  expect(res.status).toBe(400);
  expect(setImageGenModel).not.toHaveBeenCalled();
});

test("PUT /ollama/image-gen-model returns 404 when the model isn't installed or lacks the image capability", async () => {
  vi.mocked(setImageGenModel).mockRejectedValue(new Error("not an image-generation model"));
  const res = await request(app).put("/ollama/image-gen-model").send({ model: "chat-model" });
  expect(res.status).toBe(404);
  expect(res.body.error).toBe("not an image-generation model");
});

test("PUT /ollama/embedding-model sets the embedding default and returns 204", async () => {
  vi.mocked(setEmbeddingModel).mockResolvedValue(undefined);
  const res = await request(app).put("/ollama/embedding-model").send({ model: "m1" });
  expect(res.status).toBe(204);
  expect(setEmbeddingModel).toHaveBeenCalledWith("m1");
});

test("PUT /ollama/embedding-model returns 400 for a missing model field", async () => {
  const res = await request(app).put("/ollama/embedding-model").send({});
  expect(res.status).toBe(400);
  expect(setEmbeddingModel).not.toHaveBeenCalled();
});

test("PUT /ollama/embedding-model returns 404 when the model isn't installed or lacks the embedding capability", async () => {
  vi.mocked(setEmbeddingModel).mockRejectedValue(new Error("not an embedding model"));
  const res = await request(app).put("/ollama/embedding-model").send({ model: "chat-model" });
  expect(res.status).toBe(404);
  expect(res.body.error).toBe("not an embedding model");
});

test("POST /ollama/pull streams NDJSON progress lines and ends the response", async () => {
  vi.mocked(pullModel).mockImplementation(async (_name, onProgress) => {
    onProgress({ status: "pulling manifest" });
    onProgress({ status: "success" });
  });
  const res = await request(app).post("/ollama/pull").send({ model: "m1" });
  expect(res.status).toBe(200);
  const lines = res.text.trim().split("\n").map((l) => JSON.parse(l));
  expect(lines).toEqual([{ status: "pulling manifest" }, { status: "success" }]);
});

test("POST /ollama/pull writes a final error line when the pull fails mid-stream", async () => {
  vi.mocked(pullModel).mockImplementation(async (_name, onProgress) => {
    onProgress({ status: "pulling manifest" });
    throw new Error("disk full");
  });
  const res = await request(app).post("/ollama/pull").send({ model: "m1" });
  expect(res.status).toBe(200);
  const lines = res.text.trim().split("\n").map((l) => JSON.parse(l));
  expect(lines[0]).toEqual({ status: "pulling manifest" });
  expect(lines[1]).toEqual({ status: "error", error: "disk full" });
});

test("POST /ollama/pull returns 400 for a missing model field", async () => {
  const res = await request(app).post("/ollama/pull").send({});
  expect(res.status).toBe(400);
  expect(pullModel).not.toHaveBeenCalled();
});

test("DELETE /ollama/models/:name deletes the model and returns 204", async () => {
  vi.mocked(deleteModel).mockResolvedValue(undefined);
  const res = await request(app).delete(`/ollama/models/${encodeURIComponent("x/y:latest")}`);
  expect(res.status).toBe(204);
  expect(deleteModel).toHaveBeenCalledWith("x/y:latest");
});

test("DELETE /ollama/models/:name returns 404 when the model doesn't exist", async () => {
  vi.mocked(deleteModel).mockRejectedValue(new Error("not found"));
  const res = await request(app).delete("/ollama/models/missing");
  expect(res.status).toBe(404);
  expect(res.body.error).toBe("not found");
});

// --- /conversations -----------------------------------------------------------

test("GET /conversations passes through a search query and returns the results", async () => {
  vi.mocked(listConversations).mockReturnValue([{ id: "c1", title: "t", model: "m", createdAt: 0, updatedAt: 0 }]);
  const res = await request(app).get("/conversations?q=needle");
  expect(res.status).toBe(200);
  expect(listConversations).toHaveBeenCalledWith("needle");
  expect(res.body.conversations).toHaveLength(1);
});

test("GET /conversations/:id returns 404 for an unknown conversation", async () => {
  vi.mocked(getConversation).mockReturnValue(null);
  const res = await request(app).get("/conversations/nope");
  expect(res.status).toBe(404);
});

test("GET /conversations/:id returns the conversation when found", async () => {
  vi.mocked(getConversation).mockReturnValue({ id: "c1", title: "t", model: "m", createdAt: 0, updatedAt: 0, turns: [] });
  const res = await request(app).get("/conversations/c1");
  expect(res.status).toBe(200);
  expect(res.body.id).toBe("c1");
});

test("PUT /conversations/:id rejects a malformed body", async () => {
  const res = await request(app).put("/conversations/c1").send({ model: "m" }); // missing turns
  expect(res.status).toBe(400);
  expect(upsertConversation).not.toHaveBeenCalled();
});

test("PUT /conversations/:id upserts the conversation and syncs its attachments", async () => {
  const turns = [{ role: "user", text: "hi" }];
  const res = await request(app).put("/conversations/c1").send({ model: "m1", turns });
  expect(res.status).toBe(204);
  expect(upsertConversation).toHaveBeenCalledWith("c1", "m1", turns);
  expect(syncFromTurns).toHaveBeenCalledWith("c1", turns);
});

test("DELETE /conversations/:id removes the conversation + its attachments, then best-effort cleans up its files", async () => {
  const existing = { id: "c1", title: "t", model: "m", createdAt: 0, updatedAt: 0, turns: [{ role: "user", text: "hi" }] };
  vi.mocked(getConversation).mockReturnValue(existing as never);
  const res = await request(app).delete("/conversations/c1");
  expect(res.status).toBe(204);
  expect(deleteConversation).toHaveBeenCalledWith("c1");
  await flushAsync();
  expect(deleteConversationFiles).toHaveBeenCalledWith(existing.turns);
});

test("DELETE /conversations/:id skips file cleanup when the conversation didn't exist", async () => {
  vi.mocked(getConversation).mockReturnValue(null);
  const res = await request(app).delete("/conversations/nope");
  expect(res.status).toBe(204);
  await flushAsync();
  expect(deleteConversationFiles).not.toHaveBeenCalled();
});

// --- /documents ----------------------------------------------------------------

test("POST /documents rejects a malformed body", async () => {
  const res = await request(app).post("/documents").send({ filename: "a.pdf" }); // missing url/mimetype
  expect(res.status).toBe(400);
  expect(ingestDocument).not.toHaveBeenCalled();
});

test("POST /documents ingests the upload and indexes it as an attachment", async () => {
  const record = { id: "doc-1", originalName: "a.pdf", mimeType: "application/pdf", size: 5, fileStorageFilename: "stored-a.pdf", createdAt: 0 };
  vi.mocked(ingestDocument).mockReturnValue(record as never);
  const res = await request(app).post("/documents").send({ url: "http://files/stored-a.pdf", filename: "a.pdf", mimetype: "application/pdf", size: 5 });
  expect(res.status).toBe(201);
  expect(res.body).toEqual(record);
  expect(upsertAttachment).toHaveBeenCalledWith(expect.objectContaining({ documentId: "doc-1", kind: "document" }));
});

test("GET /documents/:id returns 404 for an unknown document", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue(null);
  const res = await request(app).get("/documents/nope");
  expect(res.status).toBe(404);
});

test("DELETE /documents/:id gathers filenames from chunks + page images before deleting, then fires file-storage deletes", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue({
    id: "doc-1",
    fileStorageFilename: "original.pdf",
    pageImageUrls: { "1": "http://files/page-1.png" },
  } as never);
  vi.mocked(getChunksForDocument).mockReturnValue([
    { id: "c1", documentId: "doc-1", seq: 0, kind: "figure", pageStart: 1, pageEnd: 1, text: "x", imageUrl: "http://files/fig-1.png" },
  ] as never);

  const res = await request(app).delete("/documents/doc-1");

  expect(res.status).toBe(204);
  expect(deleteDocumentRecord).toHaveBeenCalledWith("doc-1");
  await flushAsync();
  const fetchMock = vi.mocked(fetch);
  const deletedUrls = fetchMock.mock.calls.map(([url]) => String(url));
  expect(deletedUrls).toEqual(
    expect.arrayContaining([
      `${config.fileStorageBaseUrl}/files/original.pdf`,
      `${config.fileStorageBaseUrl}/files/page-1.png`,
      `${config.fileStorageBaseUrl}/files/fig-1.png`,
    ]),
  );
});

test("DELETE /documents/:id returns 404 for an unknown document without touching file-storage", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue(null);
  const res = await request(app).delete("/documents/nope");
  expect(res.status).toBe(404);
  await flushAsync();
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

// --- /attachments ----------------------------------------------------------------

test("GET /attachments returns the joined attachment list", async () => {
  vi.mocked(listAttachments).mockReturnValue([
    { id: "a1", url: "u", originalName: "n", mimeType: "image/png", size: 1, kind: "attachment", documentId: null, conversationId: null, createdAt: 0, fileStorageFilename: "n" },
  ] as never);
  const res = await request(app).get("/attachments");
  expect(res.status).toBe(200);
  expect(res.body.attachments).toHaveLength(1);
});

test("DELETE /attachments/:id returns 404 for an unknown attachment", async () => {
  vi.mocked(getAttachment).mockReturnValue(null);
  const res = await request(app).delete("/attachments/nope");
  expect(res.status).toBe(404);
});

test("DELETE /attachments/:id refuses to delete a document-kind attachment directly", async () => {
  vi.mocked(getAttachment).mockReturnValue({ id: "a1", kind: "document" } as never);
  const res = await request(app).delete("/attachments/a1");
  expect(res.status).toBe(400);
  expect(deleteAttachment).not.toHaveBeenCalled();
});

test("DELETE /attachments/:id deletes a plain attachment and fires a file-storage delete", async () => {
  vi.mocked(getAttachment).mockReturnValue({ id: "a1", kind: "attachment", fileStorageFilename: "n.png" } as never);
  const res = await request(app).delete("/attachments/a1");
  expect(res.status).toBe(204);
  expect(deleteAttachment).toHaveBeenCalledWith("a1");
  await flushAsync();
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${config.fileStorageBaseUrl}/files/n.png`, expect.objectContaining({ method: "DELETE" }));
});

// --- A2A surface (smoke) ----------------------------------------------------------

test("GET /.well-known/agent-card.json serves the real agent card", async () => {
  const res = await request(app).get("/.well-known/agent-card.json");
  expect(res.status).toBe(200);
  expect(res.body.name).toBe("Aurora Assistant");
});
