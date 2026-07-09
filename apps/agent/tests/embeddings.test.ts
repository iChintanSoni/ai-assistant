import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, fromEmbeddingBlob, toEmbeddingBlob } from "../src/agent/embeddings.js";

test("cosineSimilarity is 1 for identical vectors", () => {
  const v = new Float32Array([1, 2, 3]);
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-6);
});

test("cosineSimilarity is 0 for orthogonal vectors", () => {
  const a = new Float32Array([1, 0]);
  const b = new Float32Array([0, 1]);
  assert.ok(Math.abs(cosineSimilarity(a, b)) < 1e-6);
});

test("cosineSimilarity ranks a near-duplicate above an unrelated vector", () => {
  const query = new Float32Array([1, 1, 0]);
  const close = new Float32Array([1, 0.9, 0.1]);
  const far = new Float32Array([-1, -1, 0]);
  assert.ok(cosineSimilarity(query, close) > cosineSimilarity(query, far));
});

test("toEmbeddingBlob / fromEmbeddingBlob round-trips a vector", () => {
  const original = [0.1, -0.2, 3.5, -4.25, 0];
  const blob = toEmbeddingBlob(original);
  const restored = fromEmbeddingBlob(blob);
  assert.equal(restored.length, original.length);
  for (let i = 0; i < original.length; i++) {
    assert.ok(Math.abs(restored[i]! - original[i]!) < 1e-6);
  }
});
