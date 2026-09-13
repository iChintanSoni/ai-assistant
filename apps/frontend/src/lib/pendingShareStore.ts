/**
 * One-shot handoff for a file shared via the OS "Share"/"Open with" sheet:
 * `sw.ts` intercepts the share-target POST and stores the files here;
 * `ShareTargetRoute.tsx` reads and clears them once the page loads. Hand-rolled
 * rather than a wrapper library — it's two operations on one fixed key in one
 * object store, in both the service-worker and window contexts.
 */
const DB_NAME = "aurora-share-target";
const STORE_NAME = "pending-shares";
const KEY = "pending";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error as unknown);
  });
}

export async function putPendingShare(files: File[]): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(files, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as unknown);
    });
  } finally {
    db.close();
  }
}

/** Reads the pending share and clears it — a share is consumed once. */
export async function takePendingShare(): Promise<File[]> {
  const db = await openDb();
  try {
    return await new Promise<File[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(KEY);
      getReq.onsuccess = () => store.delete(KEY);
      tx.oncomplete = () => resolve((getReq.result as File[] | undefined) ?? []);
      tx.onerror = () => reject(tx.error as unknown);
    });
  } finally {
    db.close();
  }
}
