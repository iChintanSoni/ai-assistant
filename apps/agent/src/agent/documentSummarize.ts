/**
 * Map-reduce summarization over a document's chunks.
 *
 * Deliberately separate from search_documents' similarity search: no query
 * vector is "similar" to a whole document, so summarizing has to walk every
 * chunk in order rather than retrieve a top-k subset. Small documents (full
 * text already fits a token budget) skip map-reduce entirely and summarize
 * directly. Uses a one-off ChatOllama instance for the sub-calls, the same
 * pattern historyStore.ts's generateTitle uses for its own background LLM call
 * rather than the orchestrator's live model.
 */
import { ChatOllama } from "@langchain/ollama";
import { config } from "../config.js";
import { estimateTokens } from "./documentChunker.js";
import {
  type ChunkRecord,
  type DocumentRecord,
  getChunksForDocument,
  getChunksInPageRange,
  updateDocumentSummary,
} from "./documentStore.js";
import { getDefaultModel } from "./models.js";

const MAP_TOKEN_BUDGET = 1500;
const REDUCE_TOKEN_BUDGET = 2000;

async function summarizeText(prompt: string): Promise<string> {
  const chat = new ChatOllama({ model: getDefaultModel(), baseUrl: config.ollamaBaseUrl });
  const response = await chat.invoke([{ role: "user", content: prompt }]);
  const raw = typeof response.content === "string" ? response.content : String(response.content);
  return raw.trim();
}

function batchByTokens<T>(items: T[], tokenBudget: number, textOf: (item: T) => string): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let tokens = 0;
  for (const item of items) {
    const t = estimateTokens(textOf(item));
    if (current.length > 0 && tokens + t > tokenBudget) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(item);
    tokens += t;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Sequential, not Promise.all: a local Ollama instance serializes requests onto
 * one model/GPU anyway, so firing batches in parallel buys no throughput and
 * just leaves most of them queued long enough to trip the client's
 * header-receipt timeout (confirmed: UND_ERR_HEADERS_TIMEOUT on an 18-page doc).
 */
async function summarizeBatchesSequentially(batches: string[][], instruction: string): Promise<string[]> {
  const summaries: string[] = [];
  for (const batch of batches) {
    summaries.push(await summarizeText(`${instruction}\n\n${batch.join("\n\n")}`));
  }
  return summaries;
}

async function mapReduceSummarize(chunks: ChunkRecord[]): Promise<string> {
  if (chunks.length === 0) return "This document (or the requested range) has no extractable text to summarize.";

  const mapBatches = batchByTokens(chunks, MAP_TOKEN_BUDGET, (c) => c.text).map((batch) =>
    batch.map((c) => c.text),
  );
  let summaries = await summarizeBatchesSequentially(
    mapBatches,
    "Summarize the following excerpt from a document in 2-4 sentences. Preserve concrete facts, " +
      "numbers, and names — don't editorialize.",
  );

  // Reduce: combine partial summaries, recursing if the combined text still overflows one pass.
  while (summaries.length > 1 && estimateTokens(summaries.join("\n\n")) > REDUCE_TOKEN_BUDGET) {
    const reduceBatches = batchByTokens(summaries, REDUCE_TOKEN_BUDGET, (s) => s);
    summaries = await summarizeBatchesSequentially(
      reduceBatches,
      "Combine these partial summaries into one coherent summary:",
    );
  }

  if (summaries.length === 1) return summaries[0]!;
  return summarizeText(
    `Combine these partial summaries into one coherent, well-organized summary:\n\n${summaries.join("\n\n")}`,
  );
}

export async function summarizeWholeDocument(doc: DocumentRecord): Promise<string> {
  if (doc.sizeClass === "small" && doc.fullText) {
    return summarizeText(`Summarize the following document:\n\n${doc.fullText}`);
  }
  const chunks = getChunksForDocument(doc.id).filter((c) => c.kind !== "figure");
  return mapReduceSummarize(chunks);
}

export async function summarizeScoped(doc: DocumentRecord, pageStart: number, pageEnd: number): Promise<string> {
  const chunks = getChunksInPageRange(doc.id, pageStart, pageEnd).filter((c) => c.kind !== "figure");
  return mapReduceSummarize(chunks);
}

/** Fire-and-forget: called once ingestion completes. Never throws. */
export async function precomputeSummary(doc: DocumentRecord): Promise<void> {
  try {
    const summary = await summarizeWholeDocument(doc);
    updateDocumentSummary(doc.id, summary, "ready");
  } catch {
    updateDocumentSummary(doc.id, null, "failed");
  }
}
