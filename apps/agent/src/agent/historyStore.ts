/**
 * Durable conversation history: stores the frontend's exact rendered turn
 * shape (JSON blob) so reopening a conversation looks pixel-identical to the
 * original stream. Separate from the LangGraph checkpointer, which persists
 * model *context* (see checkpointer.ts) rather than the UI transcript.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ChatOllama } from "@langchain/ollama";
import { config } from "../config.js";
import { getCheckpointer } from "./checkpointer.js";

/** Minimal shape this module needs from the frontend's richer UITurn. */
export interface HistoryTurn {
  role: "user" | "agent";
  text: string;
  [key: string]: unknown;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationDetail extends ConversationSummary {
  turns: HistoryTurn[];
}

interface ConversationRow {
  id: string;
  title: string;
  title_status: "pending" | "ready";
  model: string;
  transcript: string;
  search_text: string;
  created_at: number;
  updated_at: number;
}

let db: Database.Database | undefined;

function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    db = new Database(path.join(config.dataDir, "history.db"));
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        title_status TEXT NOT NULL DEFAULT 'pending',
        model TEXT NOT NULL,
        transcript TEXT NOT NULL,
        search_text TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
    `);
  }
  return db;
}

function toSummary(row: ConversationRow): ConversationSummary {
  return { id: row.id, title: row.title, model: row.model, createdAt: row.created_at, updatedAt: row.updated_at };
}

function placeholderTitle(turns: HistoryTurn[]): string {
  const firstUser = turns.find((t) => t.role === "user" && t.text.trim());
  const text = firstUser?.text.trim().replace(/\s+/g, " ") ?? "New chat";
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function searchText(turns: HistoryTurn[]): string {
  return turns.map((t) => t.text).join(" ").toLowerCase().slice(0, 20000);
}

export function listConversations(q?: string): ConversationSummary[] {
  const rows = q
    ? getDb()
        .prepare(
          `SELECT * FROM conversations WHERE LOWER(title) LIKE @needle OR search_text LIKE @needle
           ORDER BY updated_at DESC LIMIT 200`,
        )
        .all({ needle: `%${q.toLowerCase()}%` })
    : getDb().prepare(`SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 200`).all();
  return (rows as ConversationRow[]).map(toSummary);
}

export function getConversation(id: string): ConversationDetail | null {
  const row = getDb().prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as ConversationRow | undefined;
  if (!row) return null;
  return { ...toSummary(row), turns: JSON.parse(row.transcript) as HistoryTurn[] };
}

/** Every saved transcript, unpaginated — used by fileCleanup to find still-referenced files. */
export function getAllTranscripts(): HistoryTurn[][] {
  const rows = getDb().prepare(`SELECT transcript FROM conversations`).all() as { transcript: string }[];
  return rows.map((r) => JSON.parse(r.transcript) as HistoryTurn[]);
}

export function upsertConversation(id: string, model: string, turns: HistoryTurn[]): void {
  if (turns.length === 0) return;
  const database = getDb();
  const existing = database.prepare(`SELECT id, title_status FROM conversations WHERE id = ?`).get(id) as
    | Pick<ConversationRow, "id" | "title_status">
    | undefined;
  const now = Date.now();
  const transcript = JSON.stringify(turns);
  const search = searchText(turns);

  if (existing) {
    database
      .prepare(`UPDATE conversations SET model = ?, transcript = ?, search_text = ?, updated_at = ? WHERE id = ?`)
      .run(model, transcript, search, now, id);
  } else {
    database
      .prepare(
        `INSERT INTO conversations (id, title, title_status, model, transcript, search_text, created_at, updated_at)
         VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`,
      )
      .run(id, placeholderTitle(turns), model, transcript, search, now, now);
  }

  const status = (existing?.title_status ?? "pending") as "pending" | "ready";
  const hasAgentReply = turns.some((t) => t.role === "agent" && t.text.trim());
  if (status === "pending" && hasAgentReply) {
    void generateTitle(id, model, turns);
  }
}

export function deleteConversation(id: string): void {
  getDb().prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
  void getCheckpointer()
    .deleteThread(id)
    .catch(() => {
      // best-effort cleanup of the model-context checkpoint; the transcript row is already gone
    });
}

/** Fire-and-forget: ask the model for a short title, then update the row. Never throws. */
async function generateTitle(id: string, model: string, turns: HistoryTurn[]): Promise<void> {
  try {
    const firstUser = turns.find((t) => t.role === "user" && t.text.trim())?.text ?? "";
    const firstAgent = turns.find((t) => t.role === "agent" && t.text.trim())?.text ?? "";
    const chat = new ChatOllama({ model, baseUrl: config.ollamaBaseUrl });
    const response = await chat.invoke([
      {
        role: "user",
        content:
          "Reply with ONLY a concise 3-6 word title for this conversation. " +
          "No punctuation, no quotes, no preamble.\n\n" +
          `User: ${firstUser.slice(0, 500)}\nAssistant: ${firstAgent.slice(0, 500)}`,
      },
    ]);
    const raw = typeof response.content === "string" ? response.content : String(response.content);
    const title = raw.trim().replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 60) || placeholderTitle(turns);
    getDb().prepare(`UPDATE conversations SET title = ?, title_status = 'ready' WHERE id = ?`).run(title, id);
  } catch {
    // Keep the placeholder title; mark ready so we don't retry forever.
    getDb().prepare(`UPDATE conversations SET title_status = 'ready' WHERE id = ?`).run(id);
  }
}
