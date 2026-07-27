/**
 * Uploads a local file to a file-storage service's multer `/upload` endpoint
 * and returns the public URL it's now reachable at. Shared by every
 * capability that produces a file for the user (image generation, document/
 * diagram authoring, ...) so each one doesn't reimplement this upload dance.
 */
import fs from "node:fs/promises";
import path from "node:path";

export async function uploadToFileStorage(filePath: string, fileStorageBaseUrl: string, mimeType: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), path.basename(filePath));

  const res = await fetch(`${fileStorageBaseUrl}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`file-storage upload failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("file-storage upload response missing url");
  return data.url;
}
