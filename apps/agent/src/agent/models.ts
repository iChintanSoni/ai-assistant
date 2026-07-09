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
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}
interface OllamaShowResponse {
  capabilities?: string[];
  error?: string;
}

// Capabilities of a given model tag don't change while the process runs.
const capsCache = new Map<string, string[]>();

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Raw Ollama capability list for a model (cached, empty on failure). */
export async function getCapabilities(model: string): Promise<string[]> {
  const cached = capsCache.get(model);
  if (cached) return cached;
  try {
    const data = await fetchJson<OllamaShowResponse>(`${config.ollamaBaseUrl}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const caps = data.capabilities ?? [];
    capsCache.set(model, caps);
    return caps;
  } catch {
    return [];
  }
}

export function toModelInfo(name: string, caps: string[]): ModelInfo {
  const modalities: Modality[] = ["text"];
  if (caps.includes("vision")) modalities.push("image");
  if (caps.includes("audio")) modalities.push("audio");
  return { name, modalities, tools: caps.includes("tools"), thinking: caps.includes("thinking") };
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
    const caps = await getCapabilities(name);
    if (isOrchestratorEligible(caps)) infos.push(toModelInfo(name, caps));
  }
  infos.sort((a, b) => a.name.localeCompare(b.name));
  return infos;
}

/** Capability check used server-side to validate a chosen model + its uploads. */
export async function describeModel(name: string): Promise<ModelInfo & { eligible: boolean }> {
  const caps = await getCapabilities(name);
  return { ...toModelInfo(name, caps), eligible: isOrchestratorEligible(caps) };
}
