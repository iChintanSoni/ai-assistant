/** Chip strip above the Composer showing documents active in this conversation. */
import { useEffect, useRef, useState } from "react";
import { DocumentTextIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { getDocument, type DocumentSummary } from "../lib/documents";
import { useChatStore } from "../store/chat";

const POLL_MS = 1500;

export function ActiveDocuments() {
  const activeIds = useChatStore((s) => s.activeDocumentIds);
  const removeActiveDocument = useChatStore((s) => s.removeActiveDocument);
  const [docs, setDocs] = useState<Record<string, DocumentSummary>>({});
  const docsRef = useRef(docs);
  docsRef.current = docs;

  useEffect(() => {
    if (activeIds.length === 0) return;
    let cancelled = false;

    async function refresh() {
      const results = await Promise.all(
        activeIds.map(async (id) => {
          try {
            return await getDocument(id);
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setDocs((prev) => {
        const next = { ...prev };
        results.forEach((doc, i) => {
          if (doc) next[activeIds[i]!] = doc;
        });
        return next;
      });
    }

    void refresh();
    const anyPending = activeIds.some((id) => (docsRef.current[id]?.status ?? "pending") === "pending");
    if (!anyPending) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Re-run when the set of active ids changes, or a poll tick might flip a status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds.join(",")]);

  if (activeIds.length === 0) return null;

  return (
    <div className="mx-auto mb-2 flex w-full max-w-2xl flex-wrap gap-1.5 px-3">
      {activeIds.map((id) => {
        const doc = docs[id];
        const status = doc?.status ?? "pending";
        return (
          <span
            key={id}
            className="flex items-center gap-1.5 rounded-full bg-slate-100/80 py-1 pr-1.5 pl-2.5 text-xs text-slate-600 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-700/60"
          >
            {status === "failed" ? (
              <ExclamationTriangleIcon className="size-3.5 shrink-0 text-rose-500 dark:text-rose-400" aria-hidden="true" />
            ) : (
              <DocumentTextIcon className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            )}
            <span className="max-w-[10rem] truncate">{doc?.originalName ?? "Loading…"}</span>
            {status === "pending" && <span className="text-slate-400 italic dark:text-slate-500">processing…</span>}
            {status === "failed" && <span className="text-rose-500 dark:text-rose-400">failed</span>}
            <button
              type="button"
              aria-label={`Remove ${doc?.originalName ?? "document"} from this chat`}
              onClick={() => removeActiveDocument(id)}
              className="flex size-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <XMarkIcon className="size-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
