import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AGENT_URL } from "./config";
import {
  deleteModel,
  fetchAllModels,
  isImageGenEligible,
  isOrchestratorEligible,
  pullModel,
  setDefaultModel,
  setImageGenModel,
} from "./modelManagement";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fetchAllModels calls GET /ollama/models and returns the parsed body", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ models: [], defaultModel: "m1", imageGenModel: "img1" }), { status: 200 }),
  );
  const result = await fetchAllModels();
  expect(fetch).toHaveBeenCalledWith(`${AGENT_URL}/ollama/models`);
  expect(result).toEqual({ models: [], defaultModel: "m1", imageGenModel: "img1" });
});

test("isOrchestratorEligible requires both completion and tools capabilities", () => {
  expect(isOrchestratorEligible(["completion", "tools"])).toBe(true);
  expect(isOrchestratorEligible(["completion"])).toBe(false);
  expect(isOrchestratorEligible([])).toBe(false);
});

test("isImageGenEligible requires the image capability", () => {
  expect(isImageGenEligible(["image"])).toBe(true);
  expect(isImageGenEligible(["completion", "tools"])).toBe(false);
  expect(isImageGenEligible([])).toBe(false);
});

test("fetchAllModels throws a descriptive error on a non-ok response", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  await expect(fetchAllModels()).rejects.toThrow(/HTTP 500/);
});

test("setDefaultModel PUTs the model name to /ollama/default-model", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  await setDefaultModel("m1");
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(url).toBe(`${AGENT_URL}/ollama/default-model`);
  expect((init as RequestInit).method).toBe("PUT");
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ model: "m1" });
});

test("setDefaultModel throws the server's error message on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "not installed" }), { status: 404 }));
  await expect(setDefaultModel("missing")).rejects.toThrow("not installed");
});

test("setImageGenModel PUTs the model name to /ollama/image-gen-model", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  await setImageGenModel("img1");
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(url).toBe(`${AGENT_URL}/ollama/image-gen-model`);
  expect((init as RequestInit).method).toBe("PUT");
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ model: "img1" });
});

test("setImageGenModel throws the server's error message on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: "not an image-generation model" }), { status: 404 }),
  );
  await expect(setImageGenModel("chat-model")).rejects.toThrow("not an image-generation model");
});

test("deleteModel DELETEs the encoded model name", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  await deleteModel("x/y:latest");
  expect(fetch).toHaveBeenCalledWith(
    `${AGENT_URL}/ollama/models/${encodeURIComponent("x/y:latest")}`,
    expect.objectContaining({ method: "DELETE" }),
  );
});

test("deleteModel throws the server's error message on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "in use" }), { status: 400 }));
  await expect(deleteModel("m1")).rejects.toThrow("in use");
});

test("pullModel reports each NDJSON progress line and resolves on stream end", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"status":"pulling manifest"}\n'));
      controller.enqueue(new TextEncoder().encode('{"status":"downloading","total":100,"completed":50}\n'));
      controller.enqueue(new TextEncoder().encode('{"status":"success"}\n'));
      controller.close();
    },
  });
  vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 200 }));

  const events: unknown[] = [];
  await pullModel("m1", (evt) => events.push(evt));

  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(url).toBe(`${AGENT_URL}/ollama/pull`);
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ model: "m1" });
  expect(events).toEqual([
    { status: "pulling manifest" },
    { status: "downloading", total: 100, completed: 50 },
    { status: "success" },
  ]);
});

test("pullModel rejects when a progress line carries an error field", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"status":"error","error":"disk full"}\n'));
      controller.close();
    },
  });
  vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 200 }));
  await expect(pullModel("m1", () => {})).rejects.toThrow("disk full");
});

test("pullModel throws when the request itself fails to start", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  await expect(pullModel("m1", () => {})).rejects.toThrow(/HTTP 500/);
});
