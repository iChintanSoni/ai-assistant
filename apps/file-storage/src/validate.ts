/**
 * Never trust a client-declared mimetype/extension for what actually gets
 * stored and later served back with a real Content-Type. Sniff magic bytes
 * for binary formats; text has none, so a client's text/* claim is only
 * trusted after the bytes are checked to decode cleanly as UTF-8.
 */
import { fileTypeFromBuffer } from "file-type";

const TEXT_SNIFF_BYTES = 8000;

const ALLOWED_OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

function isAllowedMime(mime: string, clientMime: string): boolean {
  if (mime.startsWith("image/")) return mime !== "image/svg+xml"; // SVG can carry <script>
  if (mime.startsWith("audio/")) return true;
  // WebM audio-only recordings (e.g. a browser's MediaRecorder, used for voice input)
  // share identical container magic bytes with WebM video — file-type can't tell them
  // apart without deep track parsing. Trust the client's audio/* claim only to
  // disambiguate an already-verified-WebM container, not to bypass sniffing entirely.
  if (mime === "video/webm" && clientMime.startsWith("audio/")) return true;
  return mime === "application/pdf" || mime === "text/plain" || ALLOWED_OFFICE_MIMES.has(mime);
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
  if (!mime || !isAllowedMime(mime, clientMime)) return null;
  // Store "audio/webm", not the sniffed-but-ambiguous "video/webm", once the client's
  // claim has disambiguated it — see isAllowedMime's webm branch.
  return mime === "video/webm" ? "audio/webm" : mime;
}
