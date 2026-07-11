import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AGENT_URL } from "./config";
import { deleteAttachment, listAttachments } from "./attachments";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("listAttachments returns the parsed attachment list", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ attachments: [{ id: "a1" }] }), { status: 200 }));
  await expect(listAttachments()).resolves.toEqual([{ id: "a1" }]);
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${AGENT_URL}/attachments`);
});

test("listAttachments throws on a non-ok response", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  await expect(listAttachments()).rejects.toThrow(/HTTP 500/);
});

test("deleteAttachment DELETEs the encoded attachment id", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  await deleteAttachment("a b");
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${AGENT_URL}/attachments/a%20b`, expect.objectContaining({ method: "DELETE" }));
});

test("deleteAttachment throws on a non-ok response", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
  await expect(deleteAttachment("a1")).rejects.toThrow(/HTTP 404/);
});
