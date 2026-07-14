import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { config } from "../src/config.js";
import {
  deleteModel,
  describeModel,
  getDefaultModel,
  getEmbeddingModel,
  getImageGenModel,
  isEmbeddingEligible,
  isImageGenEligible,
  isOrchestratorEligible,
  listAllModels,
  listModels,
  pullModel,
  setDefaultModel,
  setEmbeddingModel,
  setImageGenModel,
  toModelInfo,
} from "../src/agent/models.js";
import { getSetting } from "../src/agent/settingsStore.js";

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

test("isImageGenEligible requires the image capability", () => {
  expect(isImageGenEligible(["image"])).toBe(true);
  expect(isImageGenEligible(["completion", "tools"])).toBe(false);
  expect(isImageGenEligible([])).toBe(false);
});

test("isEmbeddingEligible requires the embedding capability", () => {
  expect(isEmbeddingEligible(["embedding"])).toBe(true);
  expect(isEmbeddingEligible(["completion", "tools"])).toBe(false);
  expect(isEmbeddingEligible([])).toBe(false);
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

test("listAllModels lists every local model, including non-chat ones, with size/family metadata", async () => {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(
        JSON.stringify({
          models: [
            {
              name: "zeta-all:latest",
              size: 100,
              modified_at: "2026-01-01T00:00:00Z",
              details: { family: "llama", parameter_size: "8B", quantization_level: "Q4_K_M" },
            },
            { name: "image-gen-all:latest", size: 200, details: {} },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/api/show")) {
      const { model } = JSON.parse((init as RequestInit).body as string) as { model: string };
      const caps = model === "image-gen-all:latest" ? ["image"] : ["completion", "tools"];
      return new Response(JSON.stringify({ capabilities: caps, model_info: {} }), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });

  const models = await listAllModels();
  expect(models.map((m) => m.name)).toEqual(["image-gen-all:latest", "zeta-all:latest"]);
  const zeta = models.find((m) => m.name === "zeta-all:latest")!;
  expect(zeta).toMatchObject({
    size: 100,
    modifiedAt: "2026-01-01T00:00:00Z",
    family: "llama",
    parameterSize: "8B",
    quantizationLevel: "Q4_K_M",
    capabilities: ["completion", "tools"],
  });
  const imageGen = models.find((m) => m.name === "image-gen-all:latest")!;
  expect(imageGen.capabilities).toEqual(["image"]);
});

test("getDefaultModel falls back to config.defaultModel when nothing is persisted", () => {
  expect(getDefaultModel()).toBe(config.defaultModel);
});

test("setDefaultModel persists the choice, and getDefaultModel then returns it", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "picked-default:latest" }] }), { status: 200 }));
  await setDefaultModel("picked-default:latest");
  expect(getDefaultModel()).toBe("picked-default:latest");
  expect(getSetting("defaultModel")).toBe("picked-default:latest");
});

test("setDefaultModel throws for a model that isn't installed locally", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "other:latest" }] }), { status: 200 }));
  await expect(setDefaultModel("not-installed:latest")).rejects.toThrow(/not installed/);
});

test("getImageGenModel falls back to config.imageGenModel when nothing is persisted", () => {
  expect(getImageGenModel()).toBe(config.imageGenModel);
});

test("setImageGenModel persists the choice, and getImageGenModel then returns it", async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "picked-image-gen:latest" }] }), { status: 200 });
    }
    if (url.endsWith("/api/show")) {
      return new Response(JSON.stringify({ capabilities: ["image"], model_info: {} }), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  await setImageGenModel("picked-image-gen:latest");
  expect(getImageGenModel()).toBe("picked-image-gen:latest");
  expect(getSetting("imageGenModel")).toBe("picked-image-gen:latest");
});

test("setImageGenModel throws for a model that isn't installed locally", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "other:latest" }] }), { status: 200 }));
  await expect(setImageGenModel("not-installed-image:latest")).rejects.toThrow(/not installed/);
});

test("setImageGenModel throws when the installed model lacks the image capability", async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "chat-not-image:latest" }] }), { status: 200 });
    }
    if (url.endsWith("/api/show")) {
      return new Response(JSON.stringify({ capabilities: ["completion", "tools"], model_info: {} }), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  await expect(setImageGenModel("chat-not-image:latest")).rejects.toThrow(/not an image-generation model/);
});

test("getEmbeddingModel falls back to config.embeddingModel when nothing is persisted", () => {
  expect(getEmbeddingModel()).toBe(config.embeddingModel);
});

test("setEmbeddingModel persists the choice, and getEmbeddingModel then returns it", async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "picked-embedding:latest" }] }), { status: 200 });
    }
    if (url.endsWith("/api/show")) {
      return new Response(JSON.stringify({ capabilities: ["embedding"], model_info: {} }), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  await setEmbeddingModel("picked-embedding:latest");
  expect(getEmbeddingModel()).toBe("picked-embedding:latest");
  expect(getSetting("embeddingModel")).toBe("picked-embedding:latest");
});

test("setEmbeddingModel throws for a model that isn't installed locally", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "other:latest" }] }), { status: 200 }));
  await expect(setEmbeddingModel("not-installed-embedding:latest")).rejects.toThrow(/not installed/);
});

test("setEmbeddingModel throws when the installed model lacks the embedding capability", async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "chat-not-embedding:latest" }] }), { status: 200 });
    }
    if (url.endsWith("/api/show")) {
      return new Response(JSON.stringify({ capabilities: ["completion", "tools"], model_info: {} }), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  await expect(setEmbeddingModel("chat-not-embedding:latest")).rejects.toThrow(/not an embedding model/);
});

test("pullModel reports each NDJSON progress line and resolves on a success line", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response('{"status":"pulling manifest"}\n{"status":"downloading","total":100,"completed":50}\n{"status":"success"}\n', {
      status: 200,
    }),
  );
  const events: unknown[] = [];
  await pullModel("pull-target:latest", (evt) => events.push(evt));
  expect(events).toEqual([
    { status: "pulling manifest" },
    { status: "downloading", total: 100, completed: 50 },
    { status: "success" },
  ]);
});

test("pullModel rejects when a progress line carries an error field", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response('{"status":"pulling manifest"}\n{"status":"error","error":"model not found"}\n', { status: 200 }),
  );
  const events: unknown[] = [];
  await expect(pullModel("pull-error:latest", (evt) => events.push(evt))).rejects.toThrow("model not found");
  expect(events).toHaveLength(2);
});

test("pullModel throws when Ollama's pull endpoint itself fails to start", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  await expect(pullModel("pull-start-fail:latest", () => {})).rejects.toThrow(/HTTP 500/);
});

test("deleteModel calls Ollama's delete endpoint and resolves on success", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
  await deleteModel("delete-target:latest");
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(url).toBe(`${config.ollamaBaseUrl}/api/delete`);
  expect((init as RequestInit).method).toBe("DELETE");
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ model: "delete-target:latest" });
});

test("deleteModel clears the persisted default when the deleted model was the default", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "was-default:latest" }] }), { status: 200 }));
  await setDefaultModel("was-default:latest");
  expect(getDefaultModel()).toBe("was-default:latest");

  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
  await deleteModel("was-default:latest");
  expect(getDefaultModel()).toBe(config.defaultModel);
});

test("deleteModel clears the persisted image-gen default when the deleted model was set as it", async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "was-image-gen-default:latest" }] }), { status: 200 });
    }
    if (url.endsWith("/api/show")) {
      return new Response(JSON.stringify({ capabilities: ["image"], model_info: {} }), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  await setImageGenModel("was-image-gen-default:latest");
  expect(getImageGenModel()).toBe("was-image-gen-default:latest");

  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
  await deleteModel("was-image-gen-default:latest");
  expect(getImageGenModel()).toBe(config.imageGenModel);
});

test("deleteModel clears the persisted embedding default when the deleted model was set as it", async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "was-embedding-default:latest" }] }), { status: 200 });
    }
    if (url.endsWith("/api/show")) {
      return new Response(JSON.stringify({ capabilities: ["embedding"], model_info: {} }), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  await setEmbeddingModel("was-embedding-default:latest");
  expect(getEmbeddingModel()).toBe("was-embedding-default:latest");

  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
  await deleteModel("was-embedding-default:latest");
  expect(getEmbeddingModel()).toBe(config.embeddingModel);
});

test("deleteModel throws with Ollama's error message on failure", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "model is in use" }), { status: 400 }));
  await expect(deleteModel("delete-fail:latest")).rejects.toThrow("model is in use");
});
