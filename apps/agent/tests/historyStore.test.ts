import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@langchain/ollama", () => ({ ChatOllama: vi.fn() }));
vi.mock("../src/agent/checkpointer.js", () => ({ getCheckpointer: vi.fn() }));

import { ChatOllama } from "@langchain/ollama";
import { getCheckpointer } from "../src/agent/checkpointer.js";
import {
  deleteConversation,
  getAllTranscripts,
  getConversation,
  getConversationTitlesByIds,
  listConversations,
  listConversationsReferencingDocument,
  upsertConversation,
  type HistoryTurn,
} from "../src/agent/historyStore.js";

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mockInvoke(content: string) {
  vi.mocked(ChatOllama).mockImplementation(function () {
    return { invoke: vi.fn().mockResolvedValue({ content }) } as never;
  } as never);
}

const userTurn = (text: string): HistoryTurn => ({ role: "user", text });
const agentTurn = (text: string): HistoryTurn => ({ role: "agent", text });

beforeEach(() => {
  vi.mocked(ChatOllama).mockReset();
  vi.mocked(getCheckpointer).mockReturnValue({ deleteThread: vi.fn().mockResolvedValue(undefined) } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("getConversation returns null for an unknown id", () => {
  expect(getConversation("nope")).toBeNull();
});

test("upsertConversation inserts a new conversation with a placeholder title from the first user turn", () => {
  upsertConversation("c1", "model-a", [userTurn("Tell me about quantum computing please")]);
  const conv = getConversation("c1")!;
  expect(conv.model).toBe("model-a");
  expect(conv.turns).toEqual([userTurn("Tell me about quantum computing please")]);
  expect(conv.title).toBe("Tell me about quantum computing please");
});

test("placeholder title truncates long first-user-turn text to 40 chars + an ellipsis", () => {
  const longText = "x".repeat(100);
  upsertConversation("c2", "model-a", [userTurn(longText)]);
  const conv = getConversation("c2")!;
  expect(conv.title).toBe(`${"x".repeat(40)}…`);
});

test("upsertConversation updates an existing conversation's transcript/model in place", () => {
  upsertConversation("c3", "model-a", [userTurn("hi")]);
  upsertConversation("c3", "model-b", [userTurn("hi"), agentTurn("hello")]);
  const conv = getConversation("c3")!;
  expect(conv.model).toBe("model-b");
  expect(conv.turns).toHaveLength(2);
});

test("upsertConversation is a no-op for an empty turns array", () => {
  upsertConversation("c4", "model-a", []);
  expect(getConversation("c4")).toBeNull();
});

test("upsertConversation generates a real title once the conversation has an agent reply", async () => {
  mockInvoke("A Generated Title");
  upsertConversation("c5", "model-a", [userTurn("hi"), agentTurn("hello there")]);
  await flushAsync();
  const conv = getConversation("c5")!;
  expect(conv.title).toBe("A Generated Title");
});

test("upsertConversation only triggers title generation once", async () => {
  mockInvoke("First Title");
  upsertConversation("c6", "model-a", [userTurn("hi"), agentTurn("hello")]);
  await flushAsync();
  mockInvoke("Second Title");
  upsertConversation("c6", "model-a", [userTurn("hi"), agentTurn("hello"), userTurn("more"), agentTurn("more reply")]);
  await flushAsync();
  const conv = getConversation("c6")!;
  expect(conv.title).toBe("First Title");
});

test("generateTitle falls back to the placeholder title and marks ready when the model call throws", async () => {
  vi.mocked(ChatOllama).mockImplementation(function () {
    return { invoke: vi.fn().mockRejectedValue(new Error("ollama down")) } as never;
  } as never);
  upsertConversation("c7", "model-a", [userTurn("fallback please"), agentTurn("ok")]);
  await flushAsync();
  const conv = getConversation("c7")!;
  expect(conv.title).toBe("fallback please");
});

test("generateTitle strips surrounding quotes and truncates the model's title to 60 chars", async () => {
  mockInvoke(`"${"y".repeat(80)}"`);
  upsertConversation("c8", "model-a", [userTurn("hi"), agentTurn("hello")]);
  await flushAsync();
  const conv = getConversation("c8")!;
  expect(conv.title).toBe("y".repeat(60));
});

test("deleteConversation removes the row and best-effort deletes its checkpointer thread", async () => {
  upsertConversation("c9", "model-a", [userTurn("hi")]);
  deleteConversation("c9");
  expect(getConversation("c9")).toBeNull();
  await flushAsync();
  expect(vi.mocked(getCheckpointer)().deleteThread).toHaveBeenCalledWith("c9");
});

test("getAllTranscripts returns every saved conversation's turns", () => {
  upsertConversation("c10", "model-a", [userTurn("only one")]);
  const all = getAllTranscripts();
  expect(all.some((turns) => turns.some((t) => t.text === "only one"))).toBe(true);
});

test("getConversationTitlesByIds returns an empty map for an empty id list, and batches lookups otherwise", () => {
  expect(getConversationTitlesByIds([])).toEqual(new Map());
  upsertConversation("c11", "model-a", [userTurn("hey")]);
  const titles = getConversationTitlesByIds(["c11", "unknown"]);
  expect(titles.get("c11")).toBeDefined();
  expect(titles.has("unknown")).toBe(false);
});

test("listConversationsReferencingDocument scans transcripts for a user turn's documentIds", () => {
  upsertConversation("c12", "model-a", [{ role: "user", text: "hi", documentIds: ["doc-1"] } as HistoryTurn]);
  const refs = listConversationsReferencingDocument("doc-1");
  expect(refs.map((r) => r.id)).toContain("c12");
  expect(listConversationsReferencingDocument("doc-unused")).toEqual([]);
});

test("listConversations filters by a case-insensitive query against title or search text", () => {
  upsertConversation("c13", "model-a", [userTurn("Searchable Needle Text")]);
  const found = listConversations("needle");
  expect(found.map((c) => c.id)).toContain("c13");
  expect(listConversations("no-such-term-xyz").map((c) => c.id)).not.toContain("c13");
});
