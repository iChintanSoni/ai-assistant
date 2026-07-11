import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cosineSimilarity, embed, embedOne, fromEmbeddingBlob, toEmbeddingBlob } from "../src/agent/embeddings.js";
import { config } from "../src/config.js";

test("cosineSimilarity is 1 for identical vectors", () => {
  const v = new Float32Array([1, 2, 3]);
  expect(Math.abs(cosineSimilarity(v, v) - 1)).toBeLessThan(1e-6);
});

test("cosineSimilarity is 0 for orthogonal vectors", () => {
  const a = new Float32Array([1, 0]);
  const b = new Float32Array([0, 1]);
  expect(Math.abs(cosineSimilarity(a, b))).toBeLessThan(1e-6);
});

test("cosineSimilarity ranks a near-duplicate above an unrelated vector", () => {
  const query = new Float32Array([1, 1, 0]);
  const close = new Float32Array([1, 0.9, 0.1]);
  const far = new Float32Array([-1, -1, 0]);
  expect(cosineSimilarity(query, close)).toBeGreaterThan(cosineSimilarity(query, far));
});

test("toEmbeddingBlob / fromEmbeddingBlob round-trips a vector", () => {
  const original = [0.1, -0.2, 3.5, -4.25, 0];
  const blob = toEmbeddingBlob(original);
  const restored = fromEmbeddingBlob(blob);
  expect(restored.length).toBe(original.length);
  for (let i = 0; i < original.length; i++) {
    expect(Math.abs(restored[i]! - original[i]!)).toBeLessThan(1e-6);
  }
});

test("cosineSimilarity is 0 (not NaN) when either vector has zero magnitude", () => {
  const zero = new Float32Array([0, 0, 0]);
  const other = new Float32Array([1, 2, 3]);
  expect(cosineSimilarity(zero, other)).toBe(0);
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("embed returns [] without calling fetch for an empty input", async () => {
  const result = await embed([]);
  expect(result).toEqual([]);
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

test("embed posts to /api/embed with the configured model and returns the embeddings in order", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ embeddings: [[1, 2], [3, 4]] }), { status: 200 }),
  );

  const result = await embed(["a", "b"]);

  expect(result).toEqual([[1, 2], [3, 4]]);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe(`${config.ollamaBaseUrl}/api/embed`);
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ model: config.embeddingModel, input: ["a", "b"] });
});

test("embed throws a descriptive error when the request fails", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "model not found" }), { status: 404 }));

  await expect(embed(["a"])).rejects.toThrow(/model not found/);
});

test("embed throws when the response is missing the embeddings field", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

  await expect(embed(["a"])).rejects.toThrow(/missing 'embeddings'/);
});

test("embedOne returns the first (only) embedding for a single string", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ embeddings: [[9, 8, 7]] }), { status: 200 }));

  await expect(embedOne("hello")).resolves.toEqual([9, 8, 7]);
});

test("embedOne throws when the embedding response is empty", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ embeddings: [] }), { status: 200 }));

  await expect(embedOne("hello")).rejects.toThrow(/empty/);
});
