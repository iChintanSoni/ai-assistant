/** Model list + capabilities from the agent's /models endpoint (proxies Ollama). */
import { AGENT_URL } from "./config";

export type Modality = "text" | "image" | "audio";

export interface ModelInfo {
  name: string;
  modalities: Modality[];
  tools: boolean;
  thinking: boolean;
  /** The model's real trained max context length (from Ollama), or null if it couldn't be determined. */
  contextLength: number | null;
}

export interface ModelsResponse {
  models: ModelInfo[];
  defaultModel: string;
}

export async function fetchModels(): Promise<ModelsResponse> {
  const res = await fetch(`${AGENT_URL}/models`);
  if (!res.ok) throw new Error(`Could not load models (HTTP ${res.status})`);
  return (await res.json()) as ModelsResponse;
}

/** Accept string for a file <input>, gated by what the model can actually read. */
export function acceptFor(model: ModelInfo | undefined): string {
  if (!model) return "";
  const accept: string[] = [];
  if (model.modalities.includes("image")) accept.push("image/*");
  if (model.modalities.includes("audio")) accept.push("audio/*");
  return accept.join(",");
}

/**
 * Real validation for a non-document file, gated by the model's modalities.
 * Unlike a file <input>'s `accept` attribute (which only filters the OS
 * dialog), a drag-and-drop DataTransfer can carry any file type, so the drop
 * path needs this instead of relying on the browser to have filtered already.
 */
export function isAcceptableOtherFile(file: File, model: ModelInfo | undefined): boolean {
  if (!model) return false;
  if (model.modalities.includes("image") && file.type.startsWith("image/")) return true;
  if (model.modalities.includes("audio") && file.type.startsWith("audio/")) return true;
  return false;
}

