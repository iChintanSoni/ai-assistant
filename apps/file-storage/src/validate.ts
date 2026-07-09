/**
 * Never trust a client-declared mimetype/extension for what actually gets
 * stored and later served back with a real Content-Type. Sniff magic bytes
 * for binary formats; text has none, so a client's text/* claim is only
 * trusted after the bytes are checked to decode cleanly as UTF-8.
 */
import { fileTypeFromBuffer } from "file-type";

const TEXT_SNIFF_BYTES = 8000;

function isAllowedMime(mime: string): boolean {
  if (mime.startsWith("image/")) return mime !== "image/svg+xml"; // SVG can carry <script>
  if (mime.startsWith("audio/")) return true;
  return mime === "application/pdf" || mime === "text/plain";
}

function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, TEXT_SNIFF_BYTES);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

/** Returns the verified mimetype to store, or null if the file is rejected. */
export async function detectAllowedMime(buffer: Buffer, clientMime: string): Promise<string | null> {
  const sniffed = await fileTypeFromBuffer(buffer);
  const mime = sniffed?.mime ?? (clientMime.startsWith("text/") && looksLikeText(buffer) ? "text/plain" : null);
  return mime && isAllowedMime(mime) ? mime : null;
}
