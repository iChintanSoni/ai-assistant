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

export type Modality = "text" | "image" | "audio";

export interface ModelInfo {
  name: string;
  modalities: Modality[];
  tools: boolean;
  thinking: boolean;
  /** The model's real trained max context length (from Ollama), or null if it couldn't be determined. */
  contextLength: number | null;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
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
