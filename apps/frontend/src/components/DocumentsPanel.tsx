/** Floating flyout listing the uploaded document library — opened from the rail's Documents button. */
import { useEffect, useRef, useState } from "react";
import { CheckIcon, DocumentTextIcon, ExclamationTriangleIcon, PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { deleteDocument, listDocuments, type DocumentSummary } from "../lib/documents";
import { useChatStore } from "../store/chat";

interface DocumentsPanelProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function statusLabel(doc: DocumentSummary): string {
  if (doc.status === "pending") return "Processing…";
  if (doc.status === "failed") return doc.error ?? "Failed to process";
  return doc.summaryStatus === "pending" ? "Ready" : "Ready";
}

export function DocumentsPanel({ open, onClose, triggerRef }: DocumentsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const activeIds = useChatStore((s) => s.activeDocumentIds);
  const addActiveDocument = useChatStore((s) => s.addActiveDocument);
  const removeActiveDocument = useChatStore((s) => s.removeActiveDocument);

  useEffect(() => {
    if (!open) return;
    let active = true;
    listDocuments()
      .then((list) => {
        if (active) setDocuments(list);
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setConfirmingId(null);
      setLoadError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerRef]);

  if (!open) return null;

  function close() {
    onClose();
    triggerRef.current?.focus();
  }

  const handleDelete = async (id: string) => {
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setConfirmingId(null);
    removeActiveDocument(id);
    try {
      await deleteDocument(id);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Document library"
      className="fixed top-6 left-20 z-30 flex max-h-[70vh] w-80 flex-col gap-2 rounded-3xl bg-white/80 p-3 ring-1 ring-slate-200/70 backdrop-blur-md dark:bg-slate-900/80 dark:ring-slate-700/60"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Documents</span>
        <button
          type="button"
          aria-label="Close documents"
          onClick={close}
          className="flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {loadError && <p className="px-2 py-1 text-xs text-rose-500 dark:text-rose-400">{loadError}</p>}
        {!loadError && documents.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            No documents yet — attach one from the composer.
          </p>
        )}
        {documents.map((doc) => {
          const isActive = activeIds.includes(doc.id);
          const canActivate = doc.status === "ready";
          return (
            <div
              key={doc.id}
              className="group flex items-center gap-1 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <button
                type="button"
                disabled={!canActivate}
                aria-pressed={isActive}
                onClick={() => (isActive ? removeActiveDocument(doc.id) : addActiveDocument(doc.id))}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-2 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:cursor-not-allowed"
              >
                {doc.status === "failed" ? (
                  <ExclamationTriangleIcon className="size-4 shrink-0 text-rose-500 dark:text-rose-400" aria-hidden="true" />
                ) : (
                  <DocumentTextIcon className="size-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-700 dark:text-slate-300">{doc.originalName}</span>
                  <span className="block text-xs text-slate-400 dark:text-slate-500">{statusLabel(doc)}</span>
                </span>
                {isActive && <CheckIcon className="size-4 shrink-0 text-blue-500 dark:text-blue-400" aria-hidden="true" />}
                {!isActive && canActivate && (
                  <PlusIcon className="size-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                aria-label={confirmingId === doc.id ? `Confirm delete "${doc.originalName}"` : `Delete "${doc.originalName}"`}
                onClick={() => void handleDelete(doc.id)}
                className={`mr-1 flex size-8 shrink-0 items-center justify-center rounded-full opacity-0 transition-colors group-hover:opacity-100 focus-visible:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
                  confirmingId === doc.id
                    ? "bg-rose-100 text-rose-600 opacity-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30"
                    : "text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <TrashIcon className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
