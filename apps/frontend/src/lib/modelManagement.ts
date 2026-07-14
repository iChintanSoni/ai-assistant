/** Model management — the agent's /ollama/* endpoints (Settings page: every local model). */
import { AGENT_URL } from "./config";

export interface ModelSummary {
  name: string;
  size: number;
  modifiedAt: string | null;
  family: string | null;
  parameterSize: string | null;
  quantizationLevel: string | null;
  capabilities: string[];
  contextLength: number | null;
}

export interface ModelsSummaryResponse {
  models: ModelSummary[];
  defaultModel: string;
  imageGenModel: string;
  embeddingModel: string;
}

/** A model usable as the deep-agent orchestrator: a chat model that supports tools. */
export function isOrchestratorEligible(capabilities: string[]): boolean {
  return capabilities.includes("completion") && capabilities.includes("tools");
}

/** A model usable for image generation (e.g. Flux, z-image-turbo): the `image` capability. */
export function isImageGenEligible(capabilities: string[]): boolean {
  return capabilities.includes("image");
}

/** A model usable for embeddings (e.g. nomic-embed-text): the `embedding` capability. */
export function isEmbeddingEligible(capabilities: string[]): boolean {
  return capabilities.includes("embedding");
}

export interface PullProgressEvent {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export async function fetchAllModels(): Promise<ModelsSummaryResponse> {
  const res = await fetch(`${AGENT_URL}/ollama/models`);
  if (!res.ok) throw new Error(`Could not load models (HTTP ${res.status})`);
  return (await res.json()) as ModelsSummaryResponse;
}

export async function setDefaultModel(name: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/ollama/default-model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Could not set default model (HTTP ${res.status})`);
  }
}

export async function setImageGenModel(name: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/ollama/image-gen-model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Could not set image-generation model (HTTP ${res.status})`);
  }
}

export async function setEmbeddingModel(name: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/ollama/embedding-model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Could not set embedding model (HTTP ${res.status})`);
  }
}

export async function deleteModel(name: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/ollama/models/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Could not delete "${name}" (HTTP ${res.status})`);
  }
}

/**
 * Pulls a model, calling `onProgress` for each NDJSON line the agent streams
 * through from Ollama. Resolves once the stream ends; rejects if a line
 * carries an `error` field.
 */
export async function pullModel(
  name: string,
  onProgress: (evt: PullProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${AGENT_URL}/ollama/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: name }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Could not start pulling "${name}" (HTTP ${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const evt = JSON.parse(trimmed) as PullProgressEvent;
    onProgress(evt);
    if (evt.error) throw new Error(evt.error);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      handleLine(line);
    }
  }
  handleLine(buffer);
}
