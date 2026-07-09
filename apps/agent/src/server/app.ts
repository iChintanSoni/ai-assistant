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
  listConversations,
  upsertConversation,
  type HistoryTurn,
} from "../agent/historyStore.js";
import { deleteConversationFiles } from "../agent/fileCleanup.js";
import { ingestDocument } from "../agent/documentIngest.js";
import { deleteDocumentRecord, getDocumentRecord, listDocuments } from "../agent/documentStore.js";
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
    res.status(204).end();
  });

  app.delete("/conversations/:id", (req, res) => {
    const existing = getConversation(req.params.id);
    deleteConversation(req.params.id);
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
    deleteDocumentRecord(req.params.id);
    res.status(204).end();
    try {
      await fetch(`${config.fileStorageBaseUrl}/files/${encodeURIComponent(doc.fileStorageFilename)}`, {
        method: "DELETE",
      });
    } catch {
      // best-effort; an orphan sweep can catch this later if we add one
    }
  });

  // A2A surface.
  app.use(
    "/.well-known/agent-card.json",
    agentCardHandler({ agentCardProvider: requestHandler }),
  );
  app.use("/a2a", jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

  return app;
}
