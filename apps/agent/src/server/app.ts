/** Express app: A2A JSON-RPC + agent card + a custom /models endpoint. */
import express from "express";
import cors from "cors";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { DeepAgentExecutor } from "./executor.js";
import { buildAgentCard } from "./agentCard.js";
import { listModels } from "../agent/models.js";
import {
  deleteConversation,
  getConversation,
  getConversationTitlesByIds,
  listConversations,
  listConversationsReferencingDocument,
  upsertConversation,
  type HistoryTurn,
} from "../agent/historyStore.js";
import { deleteConversationFiles } from "../agent/fileCleanup.js";
import { ingestDocument } from "../agent/documentIngest.js";
import { deleteDocumentRecord, getChunksForDocument, getDocumentRecord, getDocumentsByIds, listDocuments } from "../agent/documentStore.js";
import {
  deleteAttachment,
  deleteAttachmentForDocument,
  deleteAttachmentsForConversation,
  getAttachment,
  listAttachments,
  syncFromTurns,
  upsertAttachment,
} from "../agent/attachmentsStore.js";
import { config } from "../config.js";

export function buildApp(): express.Express {
  const agentCard = buildAgentCard();
  const taskStore = new InMemoryTaskStore();
  const executor = new DeepAgentExecutor();
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "25mb" })); // base64 file parts can be large

  // Model selector + upload gating source of truth (proxies Ollama capabilities).
  app.get("/models", async (_req, res) => {
    try {
      const models = await listModels();
      res.json({ models, defaultModel: config.defaultModel });
    } catch (err) {
      res.status(502).json({
        error: "Could not reach Ollama",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Conversation history — persists the frontend's rendered turn shape (see historyStore.ts).
  app.get("/conversations", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    res.json({ conversations: listConversations(q) });
  });

  app.get("/conversations/:id", (req, res) => {
    const conversation = getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(conversation);
  });

  app.put("/conversations/:id", (req, res) => {
    const { model, turns } = req.body as { model?: unknown; turns?: unknown };
    if (typeof model !== "string" || !Array.isArray(turns)) {
      res.status(400).json({ error: "Expected { model: string, turns: HistoryTurn[] }" });
      return;
    }
    upsertConversation(req.params.id, model, turns as HistoryTurn[]);
    syncFromTurns(req.params.id, turns as HistoryTurn[]);
    res.status(204).end();
  });

  app.delete("/conversations/:id", (req, res) => {
    const existing = getConversation(req.params.id);
    deleteConversation(req.params.id);
    deleteAttachmentsForConversation(req.params.id);
    res.status(204).end();
    if (existing) void deleteConversationFiles(existing.turns);
  });

  // Document library — upload happens against file-storage first (same as chat
  // attachments), then this kicks off background ingestion (see documentIngest.ts).
  app.post("/documents", (req, res) => {
    const { url, filename, mimetype, size } = req.body as {
      url?: unknown;
      filename?: unknown;
      mimetype?: unknown;
      size?: unknown;
    };
    if (typeof url !== "string" || typeof filename !== "string" || typeof mimetype !== "string") {
      res.status(400).json({ error: "Expected { url: string, filename: string, mimetype: string, size?: number }" });
      return;
    }
    const record = ingestDocument({
      url,
      originalName: filename,
      mimeType: mimetype,
      size: typeof size === "number" ? size : 0,
      fileStorageFilename: url.split("/").pop() ?? filename,
    });
    upsertAttachment({
      fileStorageFilename: record.fileStorageFilename,
      url,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      kind: "document",
      documentId: record.id,
      conversationId: null,
      createdAt: record.createdAt,
    });
    res.status(201).json(record);
  });

  app.get("/documents", (_req, res) => {
    res.json({ documents: listDocuments() });
  });

  app.get("/documents/:id", (req, res) => {
    const doc = getDocumentRecord(req.params.id);
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(doc);
  });

  app.delete("/documents/:id", async (req, res) => {
    const doc = getDocumentRecord(req.params.id);
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Gather every file-storage object this document owns — the original upload,
    // any extracted figure images, and any full-page renders — before the DB rows
    // that reference them are gone.
    const filenames = new Set<string>([doc.fileStorageFilename]);
    for (const chunk of getChunksForDocument(req.params.id)) {
      if (chunk.imageUrl) filenames.add(chunk.imageUrl.split("/").pop()!);
    }
    for (const url of Object.values(doc.pageImageUrls)) {
      filenames.add(url.split("/").pop()!);
    }

    deleteDocumentRecord(req.params.id);
    deleteAttachmentForDocument(req.params.id);
    res.status(204).end();
    await Promise.allSettled(
      [...filenames].map((filename) =>
        fetch(`${config.fileStorageBaseUrl}/files/${encodeURIComponent(filename)}`, { method: "DELETE" }),
      ),
    );
  });

  // Files gallery — unified view over documents, plain attachments, and
  // generated images (see attachmentsStore.ts for how each kind gets indexed).
  app.get("/attachments", (_req, res) => {
    const records = listAttachments();

    const conversationIds = new Set<string>();
    const documentIds: string[] = [];
    for (const r of records) {
      if (r.conversationId) conversationIds.add(r.conversationId);
      if (r.kind === "document" && r.documentId) documentIds.push(r.documentId);
    }
    const titles = getConversationTitlesByIds([...conversationIds]);
    const docs = new Map(getDocumentsByIds(documentIds).map((d) => [d.id, d]));

    const attachments = records.map((r) => {
      const usedIn =
        r.kind === "document" && r.documentId
          ? listConversationsReferencingDocument(r.documentId)
          : r.conversationId && titles.has(r.conversationId)
            ? [{ id: r.conversationId, title: titles.get(r.conversationId)! }]
            : [];
      const doc = r.kind === "document" && r.documentId ? docs.get(r.documentId) : undefined;

      return {
        id: r.id,
        url: r.url,
        originalName: r.originalName,
        mimeType: r.mimeType,
        size: r.size,
        kind: r.kind,
        createdAt: r.createdAt,
        usedIn,
        ...(doc
          ? {
              documentId: doc.id,
              status: doc.status,
              summaryStatus: doc.summaryStatus,
              pageCount: doc.pageCount,
              error: doc.error,
            }
          : {}),
      };
    });

    res.json({ attachments });
  });

  app.delete("/attachments/:id", async (req, res) => {
    const record = getAttachment(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (record.kind === "document") {
      res.status(400).json({ error: "Delete documents via DELETE /documents/:id" });
      return;
    }
    deleteAttachment(record.id);
    res.status(204).end();
    await fetch(`${config.fileStorageBaseUrl}/files/${encodeURIComponent(record.fileStorageFilename)}`, {
      method: "DELETE",
    }).catch(() => {});
  });

  // A2A surface.
  app.use(
    "/.well-known/agent-card.json",
    agentCardHandler({ agentCardProvider: requestHandler }),
  );
  app.use("/a2a", jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

  return app;
}
