/** Uploads an attachment to file-storage before it's referenced by URL in a chat message. */
import { FILE_STORAGE_URL } from "./config";

export interface UploadedFile {
  url: string;
  filename: string;
  size: number;
  mimetype: string;
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file, file.name);

  let res: Response;
  try {
    res = await fetch(`${FILE_STORAGE_URL}/upload`, { method: "POST", body: form });
  } catch {
    throw new Error(`Could not reach the file-storage service to upload "${file.name}".`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Could not upload "${file.name}" (HTTP ${res.status}).`);
  }
  return (await res.json()) as UploadedFile;
}
