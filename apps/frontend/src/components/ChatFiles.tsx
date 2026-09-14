/** Attachment preview tray inside the Composer. */
import { useEffect, useRef, useState } from "react";
import {
  DocumentTextIcon,
  ExclamationTriangleIcon,
  MusicalNoteIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getDocument, type DocumentSummary } from "../lib/documents";
import { notifyIfHidden } from "../lib/notify";
import { useChatStore } from "../store/chat";
import { useNotificationsStore } from "../store/notifications";
import type { PendingAttachment } from "../hooks/useAttachments";
import { canPreviewAttachment, type ViewableAttachment } from "../lib/attachmentPreview";
import { AttachmentViewer } from "./AttachmentViewer";

const POLL_MS = 1500;

/** A 404 means the document was deleted from the library since this chat last used it. */
type DocEntry = DocumentSummary | "removed";

interface ChatFilesProps {
  attachments: PendingAttachment[];
  removeAttachment: (index: number) => void;
}

function AttachmentTile({
  icon,
  image,
  name,
  detail,
  detailClassName,
  title,
  onOpen,
  onRemove,
}: {
  icon?: React.ReactNode;
  image?: string;
  name: string;
  detail?: string;
  detailClassName?: string;
  title?: string;
  onOpen?: () => void;
  onRemove: () => void;
}) {
  const preview = (
    <>
      {image ? (
        <img
          src={image}
          alt=""
          className="size-full object-cover"
        />
      ) : (
        icon
      )}
    </>
  );
  return (
    <div
      title={title}
      className="group flex w-28 shrink-0 flex-col"
    >
      <div className="relative flex h-24 w-28 items-center justify-center overflow-hidden rounded-2xl bg-slate-100/80 text-slate-400 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-500 dark:ring-slate-700/60">
        {onOpen ? (
          <button
            type="button"
            aria-label={`Open ${name}`}
            onClick={onOpen}
            className="flex size-full items-center justify-center focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400/60"
          >
            {preview}
          </button>
        ) : (
          preview
        )}
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-white/85 text-slate-600 backdrop-blur-sm transition-colors hover:bg-white hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:bg-slate-950/80 dark:text-slate-300 dark:hover:bg-slate-950 dark:hover:text-white"
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="pointer-events-none mt-2 truncate rounded-full bg-slate-900 px-3 py-1.5 text-center text-xs text-white opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {name}
        </button>
      ) : (
        <span className="mt-2 truncate rounded-full bg-slate-900 px-3 py-1.5 text-center text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-100 dark:text-slate-900">
          {name}
        </span>
      )}
      {detail && (
        <span
          className={`mt-1 truncate px-1 text-center text-[11px] ${
            detailClassName ?? "text-slate-400 dark:text-slate-500"
          }`}
        >
          {detail}
        </span>
      )}
    </div>
  );
}

export function ChatFiles({ attachments, removeAttachment }: ChatFilesProps) {
  const activeIds = useChatStore((s) => s.activeDocumentIds);
  const removeActiveDocument = useChatStore((s) => s.removeActiveDocument);
  const [docs, setDocs] = useState<Record<string, DocEntry>>({});
  const [viewerAttachment, setViewerAttachment] = useState<ViewableAttachment | null>(null);
  const transientViewerUrl = useRef<string | null>(null);
  const docsRef = useRef(docs);
  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  useEffect(
    () => () => {
      if (transientViewerUrl.current) URL.revokeObjectURL(transientViewerUrl.current);
    },
    [],
  );

  function closeViewer() {
    setViewerAttachment(null);
    if (transientViewerUrl.current) {
      URL.revokeObjectURL(transientViewerUrl.current);
      transientViewerUrl.current = null;
    }
  }

  function openPendingAttachment(attachment: PendingAttachment) {
    if (!canPreviewAttachment(attachment.file.type)) return;
    const url = attachment.previewUrl ?? URL.createObjectURL(attachment.file);
    if (!attachment.previewUrl) transientViewerUrl.current = url;
    setViewerAttachment({
      name: attachment.file.name,
      url,
      mimeType: attachment.file.type,
    });
  }

  useEffect(() => {
    if (activeIds.length === 0) return;
    let cancelled = false;

    async function refresh() {
      const results = await Promise.all(
        activeIds.map(async (id) => {
          try {
            return await getDocument(id);
          } catch {
            return "removed" as const;
          }
        }),
      );
      if (cancelled) return;
      if (useNotificationsStore.getState().enabled) {
        results.forEach((doc, i) => {
          // prevEntry is undefined on the very first fetch for this id — never notify
          // then, since a document already resolved by the time we started watching it
          // isn't a transition, just its existing state.
          const prevEntry = docsRef.current[activeIds[i]!];
          const wasPending = prevEntry !== undefined && prevEntry !== "removed" && prevEntry.status === "pending";
          if (wasPending && doc !== "removed" && doc.status !== "pending") {
            notifyIfHidden(
              doc.status === "ready" ? "Document ready" : "Document failed to process",
              doc.originalName,
            );
          }
        });
      }
      setDocs((prev) => {
        const next = { ...prev };
        results.forEach((doc, i) => {
          next[activeIds[i]!] = doc;
        });
        return next;
      });
    }

    void refresh();
    const anyPending = activeIds.some((id) => {
      const entry = docsRef.current[id];
      return !entry || (entry !== "removed" && entry.status === "pending");
    });
    if (!anyPending) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Re-run when the set of active ids changes, or a poll tick might flip a status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds.join(",")]);

  if (activeIds.length === 0 && attachments.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Message attachments"
      className="flex w-full min-w-0 flex-nowrap gap-3 overflow-x-auto p-1"
    >
      {activeIds.map((id) => {
        const entry = docs[id];
        if (entry === "removed") {
          return (
            <AttachmentTile
              key={id}
              icon={
                <ExclamationTriangleIcon
                  className="size-8 shrink-0 text-rose-500 dark:text-rose-400"
                  aria-hidden="true"
                />
              }
              name="Removed from library"
              onRemove={() => removeActiveDocument(id)}
            />
          );
        }
        const status = entry?.status ?? "pending";
        return (
          <AttachmentTile
            key={id}
            icon={
              status === "failed" ? (
                <ExclamationTriangleIcon
                  className="size-8 shrink-0 text-rose-500 dark:text-rose-400"
                  aria-hidden="true"
                />
              ) : (
                <DocumentTextIcon
                  className="size-8 shrink-0 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
              )
            }
            name={entry?.originalName ?? "Loading…"}
            detail={
              status === "pending"
                ? "processing…"
                : status === "failed"
                  ? "failed"
                  : undefined
            }
            detailClassName={
              status === "failed"
                ? "text-rose-500 dark:text-rose-400"
                : "text-slate-400 italic dark:text-slate-500"
            }
            title={
              status === "failed"
                ? (entry?.error ?? "Failed to process")
                : undefined
            }
            onRemove={() => removeActiveDocument(id)}
          />
        );
      })}
      {attachments.map((a, i) => (
        <AttachmentTile
          key={`${a.file.name}-${i}`}
          image={a.previewUrl}
          icon={
            a.previewUrl ? undefined : (
              <MusicalNoteIcon
                className="size-8 shrink-0 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
            )
          }
          name={a.file.name}
          onOpen={canPreviewAttachment(a.file.type) ? () => openPendingAttachment(a) : undefined}
          onRemove={() => removeAttachment(i)}
        />
      ))}
      {viewerAttachment && (
        <AttachmentViewer attachment={viewerAttachment} onClose={closeViewer} />
      )}
    </div>
  );
}
