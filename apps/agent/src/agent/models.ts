/**
 * Ollama model discovery + capability mapping.
 *
 * Ollama's /api/show returns a `capabilities` array per model. We map it to the
 * facts the UI needs:
 *   - `tools`     -> can drive the deep-agent orchestrator (function calling)
 *   - `completion`-> is a chat model at all (image-generation models lack this)
 *   - `vision`    -> accepts image INPUT  (NB: capability `image` means image
 *                    GENERATION output, e.g. Flux — that is NOT image input)
 *   - `audio`     -> accepts audio input
 *   - `thinking`  -> emits reasoning/thinking content
 *
 * The orchestrator selector only offers models that are `completion` + `tools`.
 */
import { config } from "../config.js";
import { deleteSetting, getSetting, setSetting } from "./settingsStore.js";

export type Modality = "text" | "image" | "audio";

export interface ModelInfo {
  name: string;
  modalities: Modality[];
  tools: boolean;
  thinking: boolean;
  /** The model's real trained max context length (from Ollama), or null if it couldn't be determined. */
  contextLength: number | null;
}

/** Every locally installed model, unfiltered — what the Settings page manages. */
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

export interface PullProgressEvent {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
    size?: number;
    modified_at?: string;
    details?: { family?: string; parameter_size?: string; quantization_level?: string };
  }>;
}
interface OllamaShowResponse {
  capabilities?: string[];
  details?: { family?: string };
  model_info?: Record<string, unknown>;
  error?: string;
}

interface ModelDetails {
  capabilities: string[];
  contextLength: number | null;
}

// Details of a given model tag don't change while the process runs.
const detailsCache = new Map<string, ModelDetails>();

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** `model_info["<family>.context_length"]`, falling back to any key ending in `.context_length`. */
function extractContextLength(modelInfo: Record<string, unknown> | undefined, family: string | undefined): number | null {
  if (!modelInfo) return null;
  const direct = family ? modelInfo[`${family}.context_length`] : undefined;
  if (typeof direct === "number") return direct;
  const fallbackKey = Object.keys(modelInfo).find((k) => k.endsWith(".context_length"));
  const fallback = fallbackKey ? modelInfo[fallbackKey] : undefined;
  return typeof fallback === "number" ? fallback : null;
}

/** Capabilities + real context length for a model (cached, empty/null on failure). */
export async function getModelDetails(model: string): Promise<ModelDetails> {
  const cached = detailsCache.get(model);
  if (cached) return cached;
  try {
    const data = await fetchJson<OllamaShowResponse>(`${config.ollamaBaseUrl}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const details: ModelDetails = {
      capabilities: data.capabilities ?? [],
      contextLength: extractContextLength(data.model_info, data.details?.family),
    };
    detailsCache.set(model, details);
    return details;
  } catch {
    return { capabilities: [], contextLength: null };
  }
}

export function toModelInfo(name: string, details: ModelDetails): ModelInfo {
  const { capabilities: caps, contextLength } = details;
  const modalities: Modality[] = ["text"];
  if (caps.includes("vision")) modalities.push("image");
  if (caps.includes("audio")) modalities.push("audio");
  return {
    name,
    modalities,
    tools: caps.includes("tools"),
    thinking: caps.includes("thinking"),
    contextLength,
  };
}

/** A model usable as the deep-agent orchestrator: a chat model that supports tools. */
export function isOrchestratorEligible(caps: string[]): boolean {
  return caps.includes("completion") && caps.includes("tools");
}

/** A model usable for image generation (e.g. Flux, z-image-turbo): the `image` capability. */
export function isImageGenEligible(caps: string[]): boolean {
  return caps.includes("image");
}

/** A model usable for embeddings (e.g. nomic-embed-text): the `embedding` capability. */
export function isEmbeddingEligible(caps: string[]): boolean {
  return caps.includes("embedding");
}

/** Installed, tool-capable chat models — what the UI model selector shows. */
export async function listModels(): Promise<ModelInfo[]> {
  const tags = await fetchJson<OllamaTagsResponse>(`${config.ollamaBaseUrl}/api/tags`);
  const names = (tags.models ?? [])
    .map((m) => m.name ?? m.model)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  const infos: ModelInfo[] = [];
  for (const name of names) {
    const details = await getModelDetails(name);
    if (isOrchestratorEligible(details.capabilities)) infos.push(toModelInfo(name, details));
  }
  infos.sort((a, b) => a.name.localeCompare(b.name));
  return infos;
}

/** Capability check used server-side to validate a chosen model + its uploads. */
export async function describeModel(name: string): Promise<ModelInfo & { eligible: boolean }> {
  const details = await getModelDetails(name);
  return { ...toModelInfo(name, details), eligible: isOrchestratorEligible(details.capabilities) };
}

/** Every locally installed model, unfiltered by chat-eligibility — what Settings manages. */
export async function listAllModels(): Promise<ModelSummary[]> {
  const tags = await fetchJson<OllamaTagsResponse>(`${config.ollamaBaseUrl}/api/tags`);
  const summaries: ModelSummary[] = [];
  for (const entry of tags.models ?? []) {
    const name = entry.name ?? entry.model;
    if (typeof name !== "string" || !name) continue;
    const details = await getModelDetails(name);
    summaries.push({
      name,
      size: entry.size ?? 0,
      modifiedAt: entry.modified_at ?? null,
      family: entry.details?.family ?? null,
      parameterSize: entry.details?.parameter_size ?? null,
      quantizationLevel: entry.details?.quantization_level ?? null,
      capabilities: details.capabilities,
      contextLength: details.contextLength,
    });
  }
  summaries.sort((a, b) => a.name.localeCompare(b.name));
  return summaries;
}

const DEFAULT_MODEL_KEY = "defaultModel";
const IMAGE_GEN_MODEL_KEY = "imageGenModel";
const EMBEDDING_MODEL_KEY = "embeddingModel";

/** The effective default model: the user's persisted choice, or the DEFAULT_MODEL env var. */
export function getDefaultModel(): string {
  return getSetting(DEFAULT_MODEL_KEY) ?? config.defaultModel;
}

/** The effective image-generation model: the user's persisted choice, or the IMAGE_GEN_MODEL env var. */
export function getImageGenModel(): string {
  return getSetting(IMAGE_GEN_MODEL_KEY) ?? config.imageGenModel;
}

/** The effective embedding model: the user's persisted choice, or the EMBEDDING_MODEL env var. */
export function getEmbeddingModel(): string {
  return getSetting(EMBEDDING_MODEL_KEY) ?? config.embeddingModel;
}

async function installedModelNames(): Promise<Set<string>> {
  const tags = await fetchJson<OllamaTagsResponse>(`${config.ollamaBaseUrl}/api/tags`);
  return new Set((tags.models ?? []).map((m) => m.name ?? m.model).filter((n): n is string => typeof n === "string"));
}

/** Persist `name` as the default model. Throws if it isn't installed locally. */
export async function setDefaultModel(name: string): Promise<void> {
  const installed = await installedModelNames();
  if (!installed.has(name)) throw new Error(`Model "${name}" is not installed locally.`);
  setSetting(DEFAULT_MODEL_KEY, name);
}

/** Persist `name` as the image-generation model. Throws if it isn't installed, or lacks the `image` capability. */
export async function setImageGenModel(name: string): Promise<void> {
  const installed = await installedModelNames();
  if (!installed.has(name)) throw new Error(`Model "${name}" is not installed locally.`);
  const details = await getModelDetails(name);
  if (!isImageGenEligible(details.capabilities)) throw new Error(`Model "${name}" is not an image-generation model.`);
  setSetting(IMAGE_GEN_MODEL_KEY, name);
}

/** Persist `name` as the embedding model. Throws if it isn't installed, or lacks the `embedding` capability. */
export async function setEmbeddingModel(name: string): Promise<void> {
  const installed = await installedModelNames();
  if (!installed.has(name)) throw new Error(`Model "${name}" is not installed locally.`);
  const details = await getModelDetails(name);
  if (!isEmbeddingEligible(details.capabilities)) throw new Error(`Model "${name}" is not an embedding model.`);
  setSetting(EMBEDDING_MODEL_KEY, name);
}

/**
 * Pull a model from the registry, reporting Ollama's streamed NDJSON progress
 * lines (`{status, digest?, total?, completed?}`) as they arrive.
 */
export async function pullModel(name: string, onProgress: (evt: PullProgressEvent) => void): Promise<void> {
  const res = await fetch(`${config.ollamaBaseUrl}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: name, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Could not start pulling "${name}" (HTTP ${res.status}).`);

  const decoder = new TextDecoder();
  let buffer = "";
  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const evt = JSON.parse(trimmed) as PullProgressEvent;
    onProgress(evt);
    if (evt.error) throw new Error(evt.error);
  };
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      handleLine(line);
    }
  }
  handleLine(buffer);
  detailsCache.delete(name);
}

/** Delete a locally installed model. If it was the persisted default, that setting is cleared. */
export async function deleteModel(name: string): Promise<void> {
  const res = await fetch(`${config.ollamaBaseUrl}/api/delete`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Could not delete "${name}" (HTTP ${res.status}).`);
  }
  detailsCache.delete(name);
  if (getSetting(DEFAULT_MODEL_KEY) === name) deleteSetting(DEFAULT_MODEL_KEY);
  if (getSetting(IMAGE_GEN_MODEL_KEY) === name) deleteSetting(IMAGE_GEN_MODEL_KEY);
  if (getSetting(EMBEDDING_MODEL_KEY) === name) deleteSetting(EMBEDDING_MODEL_KEY);
}
