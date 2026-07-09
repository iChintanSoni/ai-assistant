/** Convert & validate A2A message parts <-> LangChain message content. */
import type { Message, Part } from "@a2a-js/sdk";
import type { Modality } from "./models.js";

/** The selected model is passed per-message in metadata: { model: "<name>" }. */
export function extractModel(message: Message): string | undefined {
  const model = message.metadata?.["model"];
  return typeof model === "string" && model.length > 0 ? model : undefined;
}

function fileModality(mimeType: string | undefined): Modality | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "other" as const; // audio handled below
  return "other";
}

/**
 * Server-side upload gate: reject a file the selected model can't consume.
 * Returns an error string, or null if all parts are acceptable.
 */
export function validateParts(parts: Part[], modalities: Modality[]): string | null {
  for (const part of parts) {
    if (part.kind !== "file") continue;
    const mime = part.file.mimeType ?? "";
    if (mime.startsWith("image/") && !modalities.includes("image")) {
      return "The selected model can't read images. Choose a vision-capable model or remove the image.";
    }
    if (mime.startsWith("audio/") && !modalities.includes("audio")) {
      return "The selected model can't process audio. Choose an audio-capable model or remove the audio file.";
    }
  }
  return null;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: string };

/**
 * `uri` file parts (uploads now go straight to file-storage and reference it by
 * URL — see Composer/useChat) aren't usable as-is: @langchain/ollama only accepts
 * `data:...;base64,...` strings for `image_url` and silently sends an empty image
 * for anything else (see extractBase64FromDataUrl in its utils). So we fetch and
 * inline it here, at model-call time, instead of ever persisting the bytes.
 */
async function fetchAsBase64DataUrl(uri: string, mime: string): Promise<string> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Could not fetch attachment (HTTP ${res.status}): ${uri}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Build LangChain human-message content from A2A parts. */
export async function toLangChainContent(parts: Part[]): Promise<string | ContentBlock[]> {
  const blocks: ContentBlock[] = [];
  for (const part of parts) {
    if (part.kind === "text") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.kind === "data") {
      blocks.push({ type: "text", text: "```json\n" + JSON.stringify(part.data, null, 2) + "\n```" });
    } else if (part.kind === "file") {
      const mime = part.file.mimeType ?? "application/octet-stream";
      if ("bytes" in part.file) {
        blocks.push({ type: "image_url", image_url: `data:${mime};base64,${part.file.bytes}` });
      } else if ("uri" in part.file) {
        blocks.push({ type: "image_url", image_url: await fetchAsBase64DataUrl(part.file.uri, mime) });
      }
    }
  }
  // Collapse to a plain string when it's a single text block (nicer for text models).
  if (blocks.length === 1 && blocks[0]?.type === "text") return blocks[0].text;
  return blocks;
}

void fileModality; // reserved for future document handling
