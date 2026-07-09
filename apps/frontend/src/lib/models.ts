/** Model list + capabilities from the agent's /models endpoint (proxies Ollama). */
import { AGENT_URL } from "./config";

export type Modality = "text" | "image" | "audio";

export interface ModelInfo {
  name: string;
  modalities: Modality[];
  tools: boolean;
  thinking: boolean;
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

export function canAttach(model: ModelInfo | undefined): boolean {
  return !!model && (model.modalities.includes("image") || model.modalities.includes("audio"));
}
