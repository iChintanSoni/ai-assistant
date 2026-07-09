/** Conversation history — the agent's /conversations endpoints (see historyStore.ts). */
import { AGENT_URL } from "./config";
import type { UITurn } from "../store/chat";

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationDetail extends ConversationSummary {
  turns: UITurn[];
}

export async function listConversations(q?: string): Promise<ConversationSummary[]> {
  const url = new URL(`${AGENT_URL}/conversations`);
  if (q?.trim()) url.searchParams.set("q", q.trim());
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load conversations (HTTP ${res.status})`);
  const data = (await res.json()) as { conversations: ConversationSummary[] };
  return data.conversations;
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const res = await fetch(`${AGENT_URL}/conversations/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Could not load conversation (HTTP ${res.status})`);
  return (await res.json()) as ConversationDetail;
}

export async function saveConversation(id: string, model: string, turns: UITurn[]): Promise<void> {
  const res = await fetch(`${AGENT_URL}/conversations/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, turns }),
  });
  if (!res.ok) throw new Error(`Could not save conversation (HTTP ${res.status})`);
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Could not delete conversation (HTTP ${res.status})`);
}
