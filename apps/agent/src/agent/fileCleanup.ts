/**
 * Garbage-collects file-storage objects nothing in saved history references
 * anymore. Attachments and generated images are stored as plain URLs inside
 * the transcript JSON (see historyStore.ts / imageGen.ts) — a file is "live"
 * exactly as long as some transcript's text still contains its URL.
 */
import { config } from "../config.js";
import { getAllTranscripts, type HistoryTurn } from "./historyStore.js";

interface FileStorageMeta {
  filename: string;
  createdAt: number;
}

function fileUrlPattern(): RegExp {
  const base = config.fileStorageBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${base}/files/([^"'\\s]+)`, "g");
}

function extractFilenames(transcripts: HistoryTurn[][]): Set<string> {
  const found = new Set<string>();
  const pattern = fileUrlPattern();
  for (const turns of transcripts) {
    for (const match of JSON.stringify(turns).matchAll(pattern)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return found;
}

async function deleteFromFileStorage(filename: string): Promise<void> {
  try {
    await fetch(`${config.fileStorageBaseUrl}/files/${encodeURIComponent(filename)}`, { method: "DELETE" });
  } catch {
    // best-effort; an orphan sweep will retry later
  }
}

/**
 * Call right after a conversation row is deleted, passing the turns it had.
 * Deletes files it referenced, unless another surviving conversation also
 * references them (e.g. a URL copy-pasted between chats).
 */
export async function deleteConversationFiles(deletedTurns: HistoryTurn[]): Promise<void> {
  const owned = extractFilenames([deletedTurns]);
  if (owned.size === 0) return;
  const stillReferenced = extractFilenames(getAllTranscripts());
  await Promise.all(
    [...owned].filter((f) => !stillReferenced.has(f)).map((f) => deleteFromFileStorage(f)),
  );
}

// Give an in-flight upload/send time to land in a saved transcript before
// treating it as orphaned (a slow send, or a message that's still streaming).
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/** Best-effort: delete file-storage objects that no saved conversation references. */
export async function sweepOrphanFiles(): Promise<void> {
  try {
    const res = await fetch(`${config.fileStorageBaseUrl}/files`);
    if (!res.ok) return;
    const { files } = (await res.json()) as { files: FileStorageMeta[] };
    if (files.length === 0) return;

    const referenced = extractFilenames(getAllTranscripts());
    const cutoff = Date.now() - ORPHAN_GRACE_MS;
    const orphans = files.filter((f) => f.createdAt < cutoff && !referenced.has(f.filename));
    if (orphans.length > 0) {
      console.log(`[agent] file-cleanup: removing ${orphans.length} orphaned file(s) from file-storage`);
    }
    await Promise.all(orphans.map((f) => deleteFromFileStorage(f.filename)));
  } catch (err) {
    console.error("[agent] file-cleanup sweep failed:", err instanceof Error ? err.message : err);
  }
}

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Runs once at startup, then on a fixed interval. Call once from index.ts. */
export function startFileCleanup(): void {
  if (!config.fileCleanupEnabled) return;
  void sweepOrphanFiles();
  setInterval(() => void sweepOrphanFiles(), SWEEP_INTERVAL_MS).unref();
}
