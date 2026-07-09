/** Ollama /api/embed wrapper for document chunk + query embeddings. */
import { config } from "../config.js";

interface EmbedResponse {
  embeddings?: number[][];
  error?: string;
}

/** Embeds a batch of strings in one request. Order of results matches order of input. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch(`${config.ollamaBaseUrl}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: config.embeddingModel, input: texts }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as EmbedResponse | null;
    throw new Error(
      `Embedding request failed (HTTP ${res.status}): ${body?.error ?? "unknown error"}. ` +
        `Make sure "${config.embeddingModel}" is pulled (ollama pull ${config.embeddingModel}).`,
    );
  }
  const data = (await res.json()) as EmbedResponse;
  if (!data.embeddings) throw new Error("Embedding response missing 'embeddings'.");
  return data.embeddings;
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embed([text]);
  if (!vec) throw new Error("Embedding response was empty.");
  return vec;
}

export function toEmbeddingBlob(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

export function fromEmbeddingBlob(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
