import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AGENT_URL } from "./config";
import { deleteConversation, getConversation, listConversations, saveConversation } from "./history";
import type { UITurn } from "../store/chat";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("listConversations omits the q param when empty, includes it trimmed otherwise", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ conversations: [] }), { status: 200 }));

  await listConversations();
  expect(String(fetchMock.mock.calls[0]![0])).toBe(`${AGENT_URL}/conversations`);

  await listConversations("  needle  ");
  expect(String(fetchMock.mock.calls[1]![0])).toBe(`${AGENT_URL}/conversations?q=needle`);

  await listConversations("   ");
  expect(String(fetchMock.mock.calls[2]![0])).toBe(`${AGENT_URL}/conversations`);
});

test("getConversation fetches a single conversation by id", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "c1", turns: [] }), { status: 200 }));
  await getConversation("c1");
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${AGENT_URL}/conversations/c1`);
});

test("saveConversation PUTs the model + turns as JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  const turns: UITurn[] = [];
  await saveConversation("c1", "m1", turns);
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(url).toBe(`${AGENT_URL}/conversations/c1`);
  expect((init as RequestInit).method).toBe("PUT");
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ model: "m1", turns });
});

test("deleteConversation DELETEs by id", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  await deleteConversation("c1");
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${AGENT_URL}/conversations/c1`, expect.objectContaining({ method: "DELETE" }));
});

test("each history.ts call throws on a non-ok response", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  await expect(getConversation("c1")).rejects.toThrow(/HTTP 500/);
});
