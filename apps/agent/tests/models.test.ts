import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { config } from "../src/config.js";
import { describeModel, isOrchestratorEligible, listModels, toModelInfo } from "../src/agent/models.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("isOrchestratorEligible requires both completion and tools capabilities", () => {
  expect(isOrchestratorEligible(["completion", "tools"])).toBe(true);
  expect(isOrchestratorEligible(["completion"])).toBe(false);
  expect(isOrchestratorEligible(["tools"])).toBe(false);
  expect(isOrchestratorEligible([])).toBe(false);
});

test("toModelInfo maps vision/audio capabilities to modalities, always including text", () => {
  const info = toModelInfo("llava", { capabilities: ["completion", "tools", "vision", "audio"], contextLength: 8192 });
  expect(info).toEqual({
    name: "llava",
    modalities: ["text", "image", "audio"],
    tools: true,
    thinking: false,
    contextLength: 8192,
  });
});

test("toModelInfo reports tools/thinking false and text-only modalities for a plain text model", () => {
  const info = toModelInfo("plain", { capabilities: ["completion"], contextLength: null });
  expect(info.modalities).toEqual(["text"]);
  expect(info.tools).toBe(false);
  expect(info.thinking).toBe(false);
  expect(info.contextLength).toBeNull();
});

function mockShowResponse(body: unknown) {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/show")) return new Response(JSON.stringify(body), { status: 200 });
    throw new Error(`unexpected fetch to ${url}`);
  });
}

// Each test below uses a distinct model name: models.ts caches capability
// details per model name for the process lifetime, and all these tests share
// one module instance within this file.

test("describeModel extracts context length from model_info's <family>.context_length key", async () => {
  mockShowResponse({
    capabilities: ["completion", "tools"],
    details: { family: "llama" },
    model_info: { "llama.context_length": 32768, "other.context_length": 999 },
  });
  const result = await describeModel("model-family-key");
  expect(result.contextLength).toBe(32768);
  expect(result.eligible).toBe(true);
});

test("describeModel falls back to any *.context_length key when the family key is absent", async () => {
  mockShowResponse({ capabilities: [], model_info: { "unknown.context_length": 4096 } });
  const result = await describeModel("model-fallback-key");
  expect(result.contextLength).toBe(4096);
});

test("describeModel returns null context length when model_info has no context_length key at all", async () => {
  mockShowResponse({ capabilities: [], model_info: {} });
  const result = await describeModel("model-no-context-key");
  expect(result.contextLength).toBeNull();
});

test("describeModel treats a fetch/parse failure as empty capabilities + not eligible, without throwing", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("connection refused"));
  const result = await describeModel("unreachable-model");
  expect(result.eligible).toBe(false);
  expect(result.contextLength).toBeNull();
});

test("describeModel caches capability details per model (second call doesn't re-fetch)", async () => {
  mockShowResponse({ capabilities: ["completion", "tools"], model_info: {} });
  await describeModel("cached-model");
  await describeModel("cached-model");
  const showCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/api/show"));
  expect(showCalls).toHaveLength(1);
});

test("describeModel POSTs the model name to Ollama's /api/show", async () => {
  mockShowResponse({ capabilities: [], model_info: {} });
  await describeModel("post-check-model");
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(url).toBe(`${config.ollamaBaseUrl}/api/show`);
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ model: "post-check-model" });
});

test("listModels lists only tool-capable chat models, sorted by name", async () => {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(
        JSON.stringify({ models: [{ name: "zeta-list:latest" }, { name: "alpha-list:latest" }, { name: "image-gen-list:latest" }] }),
        { status: 200 },
      );
    }
    if (url.endsWith("/api/show")) {
      const { model } = JSON.parse((init as RequestInit).body as string) as { model: string };
      const eligible = model !== "image-gen-list:latest";
      return new Response(
        JSON.stringify({ capabilities: eligible ? ["completion", "tools"] : ["completion"], model_info: {} }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch to ${url}`);
  });

  const models = await listModels();
  expect(models.map((m) => m.name)).toEqual(["alpha-list:latest", "zeta-list:latest"]);
});
